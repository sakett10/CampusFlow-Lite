import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateProductionEnv } from './config.js';

describe('Production Environment Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('bypasses validation in test and non-production environments', () => {
    // In test environment, it should not throw even if variables are missing
    process.env.NODE_ENV = 'test';
    delete process.env.DATABASE_URL;
    delete process.env.CLERK_SECRET_KEY;
    expect(() => validateProductionEnv()).not.toThrow();

    process.env.NODE_ENV = 'development';
    expect(() => validateProductionEnv()).not.toThrow();
  });

  it('throws an error listing missing variables when forced or in production without test flags', () => {
    delete process.env.DATABASE_URL;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    delete process.env.GMAIL_REDIRECT_URI;
    delete process.env.GMAIL_OAUTH_STATE_SECRET;
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    delete process.env.CLERK_WEBHOOK_SECRET;

    expect(() => validateProductionEnv({ force: true })).toThrowError(
      /Missing required environment variables: DATABASE_URL, CLERK_SECRET_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GMAIL_OAUTH_STATE_SECRET, GMAIL_TOKEN_ENCRYPTION_KEY, CLERK_WEBHOOK_SECRET/,
    );
  });

  it('does not leak secret values in error messages', () => {
    delete process.env.DATABASE_URL;
    process.env.CLERK_SECRET_KEY = 'super_secret_clerk_key_12345';
    process.env.GOOGLE_CLIENT_SECRET = 'super_secret_google_secret_abcde';

    let errorThrown: Error | null = null;
    try {
      validateProductionEnv({ force: true });
    } catch (err) {
      errorThrown = err as Error;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown!.message).not.toContain('super_secret_clerk_key_12345');
    expect(errorThrown!.message).not.toContain('super_secret_google_secret_abcde');
    expect(errorThrown!.message).toContain('DATABASE_URL');
  });

  it('passes when all required variables are present, even if optional AI keys are absent', () => {
    process.env.DATABASE_URL = 'postgres://test:5432/db';
    process.env.CLERK_SECRET_KEY = 'sk_test_123';
    process.env.GOOGLE_CLIENT_ID = 'client_id_123';
    process.env.GOOGLE_CLIENT_SECRET = 'client_secret_123';
    process.env.GOOGLE_REDIRECT_URI = 'https://campus-flow.in/api/gmail/callback';
    process.env.GMAIL_OAUTH_STATE_SECRET = 'state_secret_123';
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.CLERK_WEBHOOK_SECRET = 'whsec_123';

    // Omit optional AI keys
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;

    expect(() => validateProductionEnv({ force: true })).not.toThrow();
  });
});
