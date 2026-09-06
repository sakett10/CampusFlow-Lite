import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptToken,
  decryptToken,
  isEncryptedToken,
} from './services/crypto.service.js';

describe('AES-256-GCM Token Encryption Service', () => {
  const originalKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  const originalSecret = process.env.GMAIL_OAUTH_STATE_SECRET;

  beforeEach(() => {
    // 64-hex char = 32-byte key
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterEach(() => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = originalKey;
    process.env.GMAIL_OAUTH_STATE_SECRET = originalSecret;
  });

  it('encrypts a token into the versioned enc:v1 format', () => {
    const plain = 'ya29.sample_google_oauth_token_secret_value';
    const encrypted = encryptToken(plain);

    expect(encrypted).not.toBe(plain);
    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);

    const parts = encrypted.slice('enc:v1:'.length).split(':');
    expect(parts).toHaveLength(3); // iv, tag, ciphertext
  });

  it('successfully decrypts an encrypted token', () => {
    const plain = 'refresh_token_xyz_secure_value_123';
    const encrypted = encryptToken(plain);
    const { text, wasEncrypted } = decryptToken(encrypted);

    expect(text).toBe(plain);
    expect(wasEncrypted).toBe(true);
  });

  it('safely handles legacy plaintext tokens without crashing (safe migration)', () => {
    const legacyPlaintext = 'legacy_unencrypted_google_refresh_token';
    expect(isEncryptedToken(legacyPlaintext)).toBe(false);

    const { text, wasEncrypted } = decryptToken(legacyPlaintext);
    expect(text).toBe(legacyPlaintext);
    expect(wasEncrypted).toBe(false); // Indicates migration to encrypted format is needed
  });

  it('rejects tampered ciphertexts or tags (authenticated encryption integrity check)', () => {
    const plain = 'super_confidential_token';
    const encrypted = encryptToken(plain);
    const parts = encrypted.slice('enc:v1:'.length).split(':');

    // Tamper with ciphertext by altering the last hex character
    const tamperedCipher =
      parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
    const tampered = `enc:v1:${parts[0]}:${parts[1]}:${tamperedCipher}`;

    expect(() => decryptToken(tampered)).toThrow();
  });

  it('supports key derivation from GMAIL_OAUTH_STATE_SECRET when GMAIL_TOKEN_ENCRYPTION_KEY is omitted', () => {
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    process.env.GMAIL_OAUTH_STATE_SECRET = 'temporary_oauth_state_secret_123';

    const plain = 'fallback_derived_key_token';
    const encrypted = encryptToken(plain);
    const { text, wasEncrypted } = decryptToken(encrypted);

    expect(text).toBe(plain);
    expect(wasEncrypted).toBe(true);
  });
});
