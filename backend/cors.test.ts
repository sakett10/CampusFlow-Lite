import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllowedOrigins, isOriginAllowed, normalizeOrigin } from './index.js';

describe('Configuration-Driven CORS and Origin Suite', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    delete process.env.FRONTEND_URL;
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    if (originalFrontendUrl !== undefined) {
      process.env.FRONTEND_URL = originalFrontendUrl;
    } else {
      delete process.env.FRONTEND_URL;
    }

    if (originalAllowedOrigins !== undefined) {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
  });

  it('normalizes trailing slashes and whitespace correctly', () => {
    expect(normalizeOrigin('https://campus-flow.in/')).toBe('https://campus-flow.in');
    expect(normalizeOrigin(' https://www.campus-flow.in/// ')).toBe('https://www.campus-flow.in');
    expect(normalizeOrigin('')).toBe('');
    expect(normalizeOrigin(null)).toBe('');
    expect(normalizeOrigin(undefined)).toBe('');
  });

  it('always allows localhost development ports regardless of env vars', () => {
    const origins = getAllowedOrigins();
    expect(origins).toContain('http://localhost:5173');
    expect(origins).toContain('http://localhost:3000');
    expect(origins).toContain('http://localhost:4173');

    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://localhost:4173')).toBe(true);
  });

  it('allows canonical origin from FRONTEND_URL environment variable', () => {
    process.env.FRONTEND_URL = 'https://campus-flow.in';
    const origins = getAllowedOrigins();
    expect(origins).toContain('https://campus-flow.in');
    expect(isOriginAllowed('https://campus-flow.in')).toBe(true);
  });

  it('allows additional trusted origins from ALLOWED_ORIGINS environment variable', () => {
    process.env.FRONTEND_URL = 'https://campus-flow.in';
    process.env.ALLOWED_ORIGINS = 'https://www.campus-flow.in, https://campus-flow-lite.vercel.app';

    const origins = getAllowedOrigins();
    expect(origins).toContain('https://campus-flow.in');
    expect(origins).toContain('https://www.campus-flow.in');
    expect(origins).toContain('https://campus-flow-lite.vercel.app');

    expect(isOriginAllowed('https://campus-flow.in')).toBe(true);
    expect(isOriginAllowed('https://www.campus-flow.in')).toBe(true);
    expect(isOriginAllowed('https://campus-flow-lite.vercel.app')).toBe(true);
  });

  it('normalizes trailing slashes on environment variables and incoming request origins', () => {
    process.env.FRONTEND_URL = 'https://campus-flow.in/';
    process.env.ALLOWED_ORIGINS = 'https://www.campus-flow.in// , https://campus-flow-lite.vercel.app/ ';

    expect(isOriginAllowed('https://campus-flow.in')).toBe(true);
    expect(isOriginAllowed('https://campus-flow.in/')).toBe(true);
    expect(isOriginAllowed('https://www.campus-flow.in')).toBe(true);
    expect(isOriginAllowed('https://www.campus-flow.in/')).toBe(true);
    expect(isOriginAllowed('https://campus-flow-lite.vercel.app')).toBe(true);
  });

  it('permits empty, null, or undefined origins for same-origin and server-to-server requests', () => {
    expect(isOriginAllowed('')).toBe(true);
    expect(isOriginAllowed(null)).toBe(true);
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('strictly rejects unauthorized origins', () => {
    process.env.FRONTEND_URL = 'https://campus-flow.in';
    process.env.ALLOWED_ORIGINS = 'https://www.campus-flow.in,https://campus-flow-lite.vercel.app';

    expect(isOriginAllowed('https://malicious-site.com')).toBe(false);
    expect(isOriginAllowed('https://attacker-campus-flow.in')).toBe(false);
    expect(isOriginAllowed('http://untrusted-domain.org')).toBe(false);
    expect(isOriginAllowed('https://campus-flow.in.evil.com')).toBe(false);
  });
});
