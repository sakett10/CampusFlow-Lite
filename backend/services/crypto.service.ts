import crypto from 'node:crypto';

const VERSION_PREFIX = 'enc:v1:';

/**
 * Derives or retrieves the 32-byte AES-256-GCM key.
 * Prioritizes GMAIL_TOKEN_ENCRYPTION_KEY.
 * Falls back to SHA-256 derivation from GMAIL_OAUTH_STATE_SECRET for deployment compatibility.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (envKey && envKey.trim()) {
    const trimmed = envKey.trim();
    // 64 hex characters = 32 bytes
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    const buf = Buffer.from(trimmed, 'utf8');
    if (buf.length === 32) {
      return buf;
    }
    return crypto.createHash('sha256').update(buf).digest();
  }

  // Fallback for deployment compatibility: derive 32-byte key from GMAIL_OAUTH_STATE_SECRET using SHA-256
  // SECURITY TRADEOFF NOTE: If GMAIL_TOKEN_ENCRYPTION_KEY is not configured, we derive a key from
  // GMAIL_OAUTH_STATE_SECRET so existing services don't crash. A dedicated key should be provisioned.
  const stateSecret = process.env.GMAIL_OAUTH_STATE_SECRET;
  if (stateSecret && stateSecret.trim()) {
    return crypto.createHash('sha256').update(`campusflow-gmail-token:${stateSecret.trim()}`).digest();
  }

  throw new Error('Encryption key not configured: GMAIL_TOKEN_ENCRYPTION_KEY or GMAIL_OAUTH_STATE_SECRET required');
}

export function isEncryptedToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

/**
 * Encrypts a token using AES-256-GCM with a 96-bit random IV.
 * Returns formatted versioned string: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return plainText;
  if (isEncryptedToken(plainText)) {
    return plainText; // Already encrypted
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plainText, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');

  return `${VERSION_PREFIX}${ivHex}:${tag}:${ciphertext}`;
}

/**
 * Decrypts a token payload.
 * If the value is not in versioned encrypted format, it is assumed to be a legacy plaintext token,
 * allowing safe backward-compatible reading for automatic re-encryption migration.
 */
export function decryptToken(encryptedOrPlain: string): { text: string; wasEncrypted: boolean } {
  if (!encryptedOrPlain) {
    return { text: encryptedOrPlain, wasEncrypted: false };
  }

  if (!isEncryptedToken(encryptedOrPlain)) {
    // Legacy plaintext token
    return { text: encryptedOrPlain, wasEncrypted: false };
  }

  const payload = encryptedOrPlain.slice(VERSION_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted token payload');
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return { text: decrypted, wasEncrypted: true };
}
