import { randomUUID, createHash, createHmac } from 'node:crypto';
import {
  put as vercelBlobPut,
  get as vercelBlobGet,
  del as vercelBlobDel,
  head as vercelBlobHead,
  BlobNotFoundError,
} from '@vercel/blob';
import type { SupportedAttachmentMimeType, AttachmentType } from '../types.js';

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigurationError';
  }
}

export interface ObjectStorageDriver {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; mimeType: string } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * In-Memory Driver for tests and local development.
 * Never writes to local filesystem or persists binaries to PostgreSQL.
 */
export class MemoryObjectStorageDriver implements ObjectStorageDriver {
  private store = new Map<string, { data: Buffer; mimeType: string }>();

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    this.store.set(key, { data: Buffer.from(data), mimeType });
  }

  async get(key: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const item = this.store.get(key);
    if (!item) return null;
    return { data: Buffer.from(item.data), mimeType: item.mimeType };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * S3-compatible Object Storage Driver (AWS S3, Cloudflare R2, MinIO).
 * Uses standard AWS Signature Version 4 authentication over HTTPS.
 * Stores strictly private objects with server-generated keys.
 */
export class S3CompatibleStorageDriver implements ObjectStorageDriver {
  private bucket: string;
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private endpoint?: string;

  constructor(config: {
    bucket: string;
    region?: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
  }) {
    this.bucket = config.bucket;
    this.region = config.region || 'us-east-1';
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.endpoint = config.endpoint ? config.endpoint.replace(/\/+$/, '') : undefined;
  }

  private getUrl(key: string): { url: URL; host: string } {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    if (this.endpoint) {
      const u = new URL(`${this.endpoint}/${this.bucket}/${cleanKey}`);
      return { url: u, host: u.host };
    }
    const host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
    const u = new URL(`https://${host}/${cleanKey}`);
    return { url: u, host };
  }

  private signRequest(
    method: string,
    url: URL,
    headers: Record<string, string>,
    payloadHash: string,
  ): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const signedHeadersList = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .concat(['host', 'x-amz-date', 'x-amz-content-sha256'])
      .sort();

    const signedHeaders = signedHeadersList.join(';');

    const headerValues: Record<string, string> = {
      ...headers,
      host: url.host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    const canonicalHeaders = signedHeadersList
      .map((k) => `${k}:${headerValues[k].trim()}\n`)
      .join('');

    const canonicalRequest = [
      method,
      url.pathname,
      url.search.slice(1),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const kDate = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      ...headerValues,
      authorization,
    };
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    const { url } = this.getUrl(key);
    const payloadHash = createHash('sha256').update(data).digest('hex');
    const headers = this.signRequest(
      'PUT',
      url,
      {
        'content-type': mimeType,
        'content-length': String(data.length),
      },
      payloadHash,
    );

    const res = await fetch(url.toString(), {
      method: 'PUT',
      headers,
      body: new Uint8Array(data),
    });

    if (!res.ok) {
      throw new Error(`S3 PUT object failed: HTTP ${res.status} ${res.statusText}`);
    }
  }

  async get(key: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const { url } = this.getUrl(key);
    const payloadHash = createHash('sha256').update('').digest('hex');
    const headers = this.signRequest('GET', url, {}, payloadHash);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`S3 GET object failed: HTTP ${res.status} ${res.statusText}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    return { data: Buffer.from(arrayBuf), mimeType };
  }

  async delete(key: string): Promise<void> {
    const { url } = this.getUrl(key);
    const payloadHash = createHash('sha256').update('').digest('hex');
    const headers = this.signRequest('DELETE', url, {}, payloadHash);

    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers,
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`S3 DELETE object failed: HTTP ${res.status} ${res.statusText}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const { url } = this.getUrl(key);
    const payloadHash = createHash('sha256').update('').digest('hex');
    const headers = this.signRequest('HEAD', url, {}, payloadHash);

    const res = await fetch(url.toString(), {
      method: 'HEAD',
      headers,
    });

    return res.status === 200;
  }
}

/**
 * Vercel Private Blob Storage Driver.
 * Uses official @vercel/blob SDK with access: 'private'.
 * Binaries are stored as private blobs and served exclusively
 * via CampusFlow's authenticated attachment delivery endpoints.
 */
export class VercelBlobStorageDriver implements ObjectStorageDriver {
  private token?: string;

  constructor(config?: { token?: string }) {
    this.token = config?.token || process.env.BLOB_READ_WRITE_TOKEN;
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    await vercelBlobPut(cleanKey, data, {
      access: 'private',
      contentType: mimeType,
      addRandomSuffix: false,
      token: this.token,
    });
  }

  async get(key: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    try {
      const res = await vercelBlobGet(cleanKey, {
        access: 'private',
        token: this.token,
        useCache: false,
      });

      if (!res || res.statusCode !== 200 || !res.stream) {
        return null;
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of res.stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }

      const data = Buffer.concat(chunks);
      const mimeType = res.blob.contentType || 'application/octet-stream';
      return { data, mimeType };
    } catch (err: unknown) {
      if (
        err instanceof BlobNotFoundError ||
        (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'BlobNotFoundError')
      ) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    try {
      await vercelBlobDel(cleanKey, { token: this.token });
    } catch (err: unknown) {
      if (
        err instanceof BlobNotFoundError ||
        (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'BlobNotFoundError')
      ) {
        return;
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    try {
      await vercelBlobHead(cleanKey, { token: this.token });
      return true;
    } catch (err: unknown) {
      if (
        err instanceof BlobNotFoundError ||
        (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'BlobNotFoundError')
      ) {
        return false;
      }
      return false;
    }
  }
}

// Global active driver
let activeDriver: ObjectStorageDriver | null = null;

export function isVercelBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function isS3StorageConfigured(): boolean {
  const bucket = process.env.STORAGE_BUCKET || process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  const accessKey = process.env.STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  return Boolean(bucket?.trim() && accessKey?.trim() && secretKey?.trim());
}

export function isProductionStorageConfigured(): boolean {
  const requested = process.env.STORAGE_DRIVER?.toLowerCase().trim();
  if (requested === 'vercel-blob' || requested === 'vercel_blob' || requested === 'blob') {
    return isVercelBlobConfigured();
  }
  if (requested === 's3' || requested === 's3-compatible') {
    return isS3StorageConfigured();
  }
  return isVercelBlobConfigured() || isS3StorageConfigured();
}

function createS3DriverFromEnv(): S3CompatibleStorageDriver {
  const bucket = (process.env.STORAGE_BUCKET || process.env.S3_BUCKET || process.env.AWS_S3_BUCKET)!.trim();
  const accessKeyId = (process.env.STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)!.trim();
  const secretAccessKey = (process.env.STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)!.trim();
  const region = (process.env.STORAGE_REGION || process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1').trim();
  const endpoint = (process.env.STORAGE_ENDPOINT || process.env.S3_ENDPOINT)?.trim();

  return new S3CompatibleStorageDriver({
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    endpoint,
  });
}

export function getObjectStorageDriver(): ObjectStorageDriver {
  if (activeDriver) {
    return activeDriver;
  }

  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  if (isTest) {
    activeDriver = new MemoryObjectStorageDriver();
    return activeDriver;
  }

  const requestedDriver = process.env.STORAGE_DRIVER?.toLowerCase().trim();

  // 1. Explicit Vercel Blob requested
  if (requestedDriver === 'vercel-blob' || requestedDriver === 'vercel_blob' || requestedDriver === 'blob') {
    if (!isVercelBlobConfigured()) {
      throw new StorageConfigurationError(
        'Vercel Blob storage is selected (STORAGE_DRIVER=vercel-blob) but BLOB_READ_WRITE_TOKEN is missing or empty. Configure BLOB_READ_WRITE_TOKEN in your environment.',
      );
    }
    activeDriver = new VercelBlobStorageDriver();
    return activeDriver;
  }

  // 2. Explicit S3 requested
  if (requestedDriver === 's3' || requestedDriver === 's3-compatible') {
    if (!isS3StorageConfigured()) {
      throw new StorageConfigurationError(
        'S3 storage is selected (STORAGE_DRIVER=s3) but required S3 credentials (STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY) are missing.',
      );
    }
    activeDriver = createS3DriverFromEnv();
    return activeDriver;
  }

  // 3. Explicit Memory driver requested
  if (requestedDriver === 'memory') {
    if (process.env.NODE_ENV === 'production') {
      throw new StorageConfigurationError(
        'In-memory storage driver cannot be used in production. Configure STORAGE_DRIVER=vercel-blob or STORAGE_DRIVER=s3.',
      );
    }
    activeDriver = new MemoryObjectStorageDriver();
    return activeDriver;
  }

  // 4. Unknown driver specified
  if (requestedDriver) {
    throw new StorageConfigurationError(
      `Unsupported STORAGE_DRIVER '${requestedDriver}'. Supported drivers: 'vercel-blob', 's3', 'memory'.`,
    );
  }

  // 5. Implicit auto-detection (when STORAGE_DRIVER is unset):
  // Prefer Vercel Blob if token is present
  if (isVercelBlobConfigured()) {
    activeDriver = new VercelBlobStorageDriver();
    return activeDriver;
  }

  // Next, prefer S3 if S3 credentials are present
  if (isS3StorageConfigured()) {
    activeDriver = createS3DriverFromEnv();
    return activeDriver;
  }

  // If in production and not configured, throw a clear error rather than using local filesystem
  if (process.env.NODE_ENV === 'production') {
    throw new StorageConfigurationError(
      'Production object storage is not configured. Configure STORAGE_DRIVER=vercel-blob with BLOB_READ_WRITE_TOKEN, or STORAGE_DRIVER=s3 with S3 credentials. Local filesystem storage is disabled in serverless production.',
    );
  }

  // Local development fallback: in-memory driver
  activeDriver = new MemoryObjectStorageDriver();
  return activeDriver;
}

export function setObjectStorageDriver(driver: ObjectStorageDriver | null): void {
  activeDriver = driver;
}

export function resetObjectStorageDriver(): void {
  activeDriver = null;
}

/**
 * Hard Safety Limits
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_NOTICE = 5;

export const SUPPORTED_ATTACHMENT_MIME_TYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export function normalizeAttachmentMimeType(mimeType: string): SupportedAttachmentMimeType | null {
  if (!mimeType || typeof mimeType !== 'string') return null;
  const lower = mimeType.toLowerCase().trim().split(';')[0].trim();
  if (lower === 'image/jpg' || lower === 'image/jpeg') return 'image/jpeg';
  if (lower === 'application/pdf') return 'application/pdf';
  if (lower === 'image/png') return 'image/png';
  if (lower === 'image/webp') return 'image/webp';
  return null;
}

export function isSupportedMimeType(mimeType: string): boolean {
  return normalizeAttachmentMimeType(mimeType) !== null;
}

export function deriveAttachmentType(mimeType: SupportedAttachmentMimeType): AttachmentType {
  return mimeType === 'application/pdf' ? 'pdf' : 'image';
}

/**
 * Strips path traversal sequences, null bytes, and non-printable/illegal characters.
 * Ensures the file has a clean basename and preserves a valid extension.
 */
export function sanitizeAttachmentFilename(rawFilename: string): string {
  if (!rawFilename || typeof rawFilename !== 'string') {
    return 'attachment.dat';
  }

  // Remove null bytes and directory paths
  let clean = rawFilename.replace(/\0/g, '').replace(/\\/g, '/');
  const lastSlash = clean.lastIndexOf('/');
  if (lastSlash !== -1) {
    clean = clean.slice(lastSlash + 1);
  }

  // Remove relative traversal tokens
  clean = clean.replace(/^\.+/, '').trim();

  // Replace disallowed characters with underscore
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

  if (!clean || clean === '.') {
    clean = 'attachment.dat';
  }

  // Limit length while preserving extension
  if (clean.length > 120) {
    const extIdx = clean.lastIndexOf('.');
    if (extIdx > 0 && clean.length - extIdx <= 10) {
      const ext = clean.slice(extIdx);
      const base = clean.slice(0, 120 - ext.length);
      clean = `${base}${ext}`;
    } else {
      clean = clean.slice(0, 120);
    }
  }

  return clean;
}

export function generateStorageKey(noticeId: string, filename: string): string {
  const safeName = sanitizeAttachmentFilename(filename);
  const uuid = randomUUID();
  return `notices/${noticeId}/${uuid}-${safeName}`;
}
