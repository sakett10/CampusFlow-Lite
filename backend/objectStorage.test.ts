import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockVercelPut,
  mockVercelGet,
  mockVercelDel,
  mockVercelHead,
  MockBlobNotFoundError,
} = vi.hoisted(() => {
  class MockBlobNotFoundError extends Error {
    constructor(message = 'Blob not found') {
      super(message);
      this.name = 'BlobNotFoundError';
    }
  }

  return {
    mockVercelPut: vi.fn(),
    mockVercelGet: vi.fn(),
    mockVercelDel: vi.fn(),
    mockVercelHead: vi.fn(),
    MockBlobNotFoundError,
  };
});

vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockVercelPut(...args),
  get: (...args: unknown[]) => mockVercelGet(...args),
  del: (...args: unknown[]) => mockVercelDel(...args),
  head: (...args: unknown[]) => mockVercelHead(...args),
  BlobNotFoundError: MockBlobNotFoundError,
}));

import {
  VercelBlobStorageDriver,
  S3CompatibleStorageDriver,
  MemoryObjectStorageDriver,
  getObjectStorageDriver,
  resetObjectStorageDriver,
  isVercelBlobConfigured,
  isS3StorageConfigured,
  isProductionStorageConfigured,
  StorageConfigurationError,
} from './services/objectStorage.service.js';

describe('VercelBlobStorageDriver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts binary data with access: private, addRandomSuffix: false, and contentType', async () => {
    mockVercelPut.mockResolvedValue({
      url: 'https://blob.vercel-storage.com/private/sample.pdf',
      pathname: 'notices/123/sample.pdf',
    });

    const driver = new VercelBlobStorageDriver({ token: 'test_token_123' });
    const buffer = Buffer.from('%PDF-1.4 test data');

    await driver.put('notices/123/sample.pdf', buffer, 'application/pdf');

    expect(mockVercelPut).toHaveBeenCalledWith(
      'notices/123/sample.pdf',
      buffer,
      {
        access: 'private',
        contentType: 'application/pdf',
        addRandomSuffix: false,
        token: 'test_token_123',
      },
    );
  });

  it('gets binary data using access: private and reconstructs buffer from stream', async () => {
    const chunk1 = Buffer.from('hello ');
    const chunk2 = Buffer.from('world');

    async function* makeStream() {
      yield chunk1;
      yield chunk2;
    }

    mockVercelGet.mockResolvedValue({
      statusCode: 200,
      stream: makeStream(),
      blob: {
        contentType: 'image/png',
        size: 11,
      },
    });

    const driver = new VercelBlobStorageDriver({ token: 'test_token_123' });
    const result = await driver.get('notices/123/photo.png');

    expect(mockVercelGet).toHaveBeenCalledWith(
      'notices/123/photo.png',
      {
        access: 'private',
        token: 'test_token_123',
        useCache: false,
      },
    );

    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe('image/png');
    expect(result?.data.toString('utf-8')).toBe('hello world');
  });

  it('returns null when get returns null or BlobNotFoundError', async () => {
    mockVercelGet.mockResolvedValueOnce(null);

    const driver = new VercelBlobStorageDriver({ token: 'test_token_123' });
    const res1 = await driver.get('notices/123/missing.pdf');
    expect(res1).toBeNull();

    mockVercelGet.mockRejectedValueOnce(new MockBlobNotFoundError('File not found'));
    const res2 = await driver.get('notices/123/missing2.pdf');
    expect(res2).toBeNull();
  });

  it('deletes blob using del and handles BlobNotFoundError gracefully', async () => {
    mockVercelDel.mockResolvedValueOnce(undefined);

    const driver = new VercelBlobStorageDriver({ token: 'test_token_123' });
    await driver.delete('notices/123/sample.pdf');

    expect(mockVercelDel).toHaveBeenCalledWith('notices/123/sample.pdf', {
      token: 'test_token_123',
    });

    mockVercelDel.mockRejectedValueOnce(new MockBlobNotFoundError('Already deleted'));
    await expect(driver.delete('notices/123/sample.pdf')).resolves.not.toThrow();
  });

  it('checks existence via head method', async () => {
    mockVercelHead.mockResolvedValueOnce({ size: 100 });

    const driver = new VercelBlobStorageDriver({ token: 'test_token_123' });
    const exists1 = await driver.exists('notices/123/sample.pdf');
    expect(exists1).toBe(true);

    mockVercelHead.mockRejectedValueOnce(new MockBlobNotFoundError('Not found'));
    const exists2 = await driver.exists('notices/123/missing.pdf');
    expect(exists2).toBe(false);
  });
});

describe('Object Storage Driver Selection & Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetObjectStorageDriver();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    resetObjectStorageDriver();
    process.env = { ...originalEnv };
  });

  it('returns MemoryObjectStorageDriver in test environment (VITEST=true)', () => {
    process.env.VITEST = 'true';
    const driver = getObjectStorageDriver();
    expect(driver).toBeInstanceOf(MemoryObjectStorageDriver);
  });

  it('throws StorageConfigurationError when STORAGE_DRIVER=vercel-blob and token is missing', () => {
    delete process.env.VITEST;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 'vercel-blob';

    expect(() => getObjectStorageDriver()).toThrow(StorageConfigurationError);
    expect(() => getObjectStorageDriver()).toThrow(/BLOB_READ_WRITE_TOKEN is missing or empty/i);
  });

  it('selects VercelBlobStorageDriver when STORAGE_DRIVER=vercel-blob and token is present', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 'vercel-blob';
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_secret_token';

    const driver = getObjectStorageDriver();
    expect(driver).toBeInstanceOf(VercelBlobStorageDriver);
  });

  it('throws StorageConfigurationError when STORAGE_DRIVER=s3 and credentials are missing', () => {
    delete process.env.VITEST;
    delete process.env.STORAGE_BUCKET;
    delete process.env.STORAGE_ACCESS_KEY_ID;
    delete process.env.STORAGE_SECRET_ACCESS_KEY;
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 's3';

    expect(() => getObjectStorageDriver()).toThrow(StorageConfigurationError);
    expect(() => getObjectStorageDriver()).toThrow(/required S3 credentials/i);
  });

  it('selects S3CompatibleStorageDriver when STORAGE_DRIVER=s3 and credentials are present', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 's3';
    process.env.STORAGE_BUCKET = 'test-bucket';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-key-id';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';

    const driver = getObjectStorageDriver();
    expect(driver).toBeInstanceOf(S3CompatibleStorageDriver);
  });

  it('throws StorageConfigurationError when STORAGE_DRIVER=memory in production', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 'memory';

    expect(() => getObjectStorageDriver()).toThrow(StorageConfigurationError);
    expect(() => getObjectStorageDriver()).toThrow(/In-memory storage driver cannot be used in production/i);
  });

  it('allows STORAGE_DRIVER=memory in development', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_DRIVER = 'memory';

    const driver = getObjectStorageDriver();
    expect(driver).toBeInstanceOf(MemoryObjectStorageDriver);
  });

  it('throws StorageConfigurationError for unsupported STORAGE_DRIVER values', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 'ftp';

    expect(() => getObjectStorageDriver()).toThrow(StorageConfigurationError);
    expect(() => getObjectStorageDriver()).toThrow(/Unsupported STORAGE_DRIVER 'ftp'/i);
  });

  it('auto-detects Vercel Blob when STORAGE_DRIVER is unset but BLOB_READ_WRITE_TOKEN is set', () => {
    delete process.env.VITEST;
    delete process.env.STORAGE_DRIVER;
    process.env.NODE_ENV = 'production';
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_token';

    const driver = getObjectStorageDriver();
    expect(driver).toBeInstanceOf(VercelBlobStorageDriver);
  });

  it('auto-detects S3 when STORAGE_DRIVER is unset but S3 credentials are set', () => {
    delete process.env.VITEST;
    delete process.env.STORAGE_DRIVER;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_BUCKET = 'my-bucket';
    process.env.STORAGE_ACCESS_KEY_ID = 'my-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'my-secret-key';

    const driver = getObjectStorageDriver();
    expect(driver).toBeInstanceOf(S3CompatibleStorageDriver);
  });

  it('throws in production when STORAGE_DRIVER is unset and no credentials exist', () => {
    delete process.env.VITEST;
    delete process.env.STORAGE_DRIVER;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.STORAGE_BUCKET;
    delete process.env.STORAGE_ACCESS_KEY_ID;
    delete process.env.STORAGE_SECRET_ACCESS_KEY;
    process.env.NODE_ENV = 'production';

    expect(() => getObjectStorageDriver()).toThrow(StorageConfigurationError);
    expect(() => getObjectStorageDriver()).toThrow(/Production object storage is not configured/i);
  });

  it('falls back to MemoryObjectStorageDriver in development when nothing is configured', () => {
    delete process.env.VITEST;
    delete process.env.STORAGE_DRIVER;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.STORAGE_BUCKET;
    delete process.env.STORAGE_ACCESS_KEY_ID;
    delete process.env.STORAGE_SECRET_ACCESS_KEY;
    process.env.NODE_ENV = 'development';

    const driver = getObjectStorageDriver();
    expect(driver).toBeInstanceOf(MemoryObjectStorageDriver);
  });

  it('correctly reports isVercelBlobConfigured, isS3StorageConfigured, and isProductionStorageConfigured', () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.STORAGE_BUCKET;
    delete process.env.STORAGE_ACCESS_KEY_ID;
    delete process.env.STORAGE_SECRET_ACCESS_KEY;

    expect(isVercelBlobConfigured()).toBe(false);
    expect(isS3StorageConfigured()).toBe(false);
    expect(isProductionStorageConfigured()).toBe(false);

    process.env.BLOB_READ_WRITE_TOKEN = 'tok_123';
    expect(isVercelBlobConfigured()).toBe(true);
    expect(isProductionStorageConfigured()).toBe(true);
  });
});
