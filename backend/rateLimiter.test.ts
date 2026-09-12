import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import {
  createRateLimiter,
  ipOnlyRateLimitKeyGenerator,
  gmailSyncLimiter,
  aiAnalyzeLimiter,
  gmailAnalyzeLimiter,
  noticeConvertLimiter,
  gmailCallbackLimiter,
  globalApiLimiter,
} from './middleware/rateLimiter.js';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock Clerk middleware to allow switching identities dynamically
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        req.auth = { userId: token, sessionClaims: {} };
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    getAuth: (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }) => {
      return req.auth || { userId: null };
    },
  };
});

import { app } from './index.js';

describe('Phase 2B: API Abuse Protection & Rate Limiting Unit/Integration Suite', () => {
  afterEach(() => {
    gmailSyncLimiter.reset();
    aiAnalyzeLimiter.reset();
    gmailAnalyzeLimiter.reset();
    noticeConvertLimiter.reset();
    gmailCallbackLimiter.reset();
    globalApiLimiter.reset();
  });

  describe('Sliding-Window Rate Limiter Core Logic', () => {
    it('allows requests below the limit and tracks remaining quota', () => {
      const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 3,
        enableInTests: true,
        keyGenerator: () => 'test-client',
      });

      const req = { headers: {} } as Request;
      const resHeaders: Record<string, string | number> = {};
      const res = {
        setHeader: (name: string, value: string | number) => {
          resHeaders[name] = value;
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      let nextCalled = 0;
      const next = () => {
        nextCalled++;
      };

      // Request 1
      limiter(req, res, next);
      expect(nextCalled).toBe(1);
      expect(resHeaders['RateLimit-Limit']).toBe(3);
      expect(resHeaders['RateLimit-Remaining']).toBe(2);

      // Request 2
      limiter(req, res, next);
      expect(nextCalled).toBe(2);
      expect(resHeaders['RateLimit-Remaining']).toBe(1);

      // Request 3
      limiter(req, res, next);
      expect(nextCalled).toBe(3);
      expect(resHeaders['RateLimit-Remaining']).toBe(0);

      limiter.destroy();
    });

    it('blocks requests exceeding the limit with 429 and standard headers', () => {
      const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 2,
        enableInTests: true,
        message: 'Rate limit exceeded for test',
        keyGenerator: () => 'test-client-blocked',
      });

      const req = { headers: {} } as Request;
      const resHeaders: Record<string, string | number> = {};
      let statusCode = 200;
      let jsonBody: unknown = null;

      const res = {
        setHeader: (name: string, value: string | number) => {
          resHeaders[name] = value;
        },
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: unknown) => {
              jsonBody = body;
            },
          };
        },
      } as unknown as Response;

      const next = vi.fn();

      // Req 1 & 2 allowed
      limiter(req, res, next);
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);

      // Req 3 blocked
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(2); // not called again
      expect(statusCode).toBe(429);
      expect(resHeaders['RateLimit-Limit']).toBe(2);
      expect(resHeaders['RateLimit-Remaining']).toBe(0);
      expect(resHeaders['Retry-After']).toBeGreaterThanOrEqual(1);
      expect(jsonBody).toEqual({
        error: 'Rate limit exceeded for test',
        retryAfter: expect.any(Number),
      });

      limiter.destroy();
    });

    it('isolates different authenticated users under sliding window', () => {
      let currentUserId = 'user_A';
      const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 2,
        enableInTests: true,
        keyGenerator: () => `test:user:${currentUserId}`,
      });

      const makeReq = () => {
        let blocked = false;
        const res = {
          setHeader: () => {},
          status: () => ({
            json: () => {
              blocked = true;
            },
          }),
        } as unknown as Response;
        let nextCalled = false;
        limiter({ headers: {} } as Request, res, () => {
          nextCalled = true;
        });
        return { blocked, nextCalled };
      };

      // User A exhausts quota
      currentUserId = 'user_A';
      expect(makeReq().nextCalled).toBe(true);
      expect(makeReq().nextCalled).toBe(true);
      expect(makeReq().blocked).toBe(true);

      // User B is isolated and unaffected
      currentUserId = 'user_B';
      expect(makeReq().nextCalled).toBe(true);
      expect(makeReq().nextCalled).toBe(true);
      expect(makeReq().blocked).toBe(true);

      limiter.destroy();
    });

    it('isolates unauthenticated requests by IP', () => {
      const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 1,
        enableInTests: true,
        keyGenerator: (req) => ipOnlyRateLimitKeyGenerator(req, 'test:ip'),
      });

      const makeReq = (ip: string) => {
        let blocked = false;
        let nextCalled = false;
        const req = {
          ip,
          headers: {},
          socket: { remoteAddress: ip },
        } as unknown as Request;
        const res = {
          setHeader: () => {},
          status: () => ({
            json: () => {
              blocked = true;
            },
          }),
        } as unknown as Response;
        limiter(req, res, () => {
          nextCalled = true;
        });
        return { blocked, nextCalled };
      };

      expect(makeReq('10.0.0.1').nextCalled).toBe(true);
      expect(makeReq('10.0.0.1').blocked).toBe(true);

      // Different IP is allowed
      expect(makeReq('10.0.0.2').nextCalled).toBe(true);
      expect(makeReq('10.0.0.2').blocked).toBe(true);

      limiter.destroy();
    });

    it('prunes expired timestamps correctly on reset/cleanup', () => {
      const limiter = createRateLimiter({
        windowMs: 100,
        max: 2,
        enableInTests: true,
        keyGenerator: () => 'cleanup-test',
      });

      const req = { headers: {} } as Request;
      const res = { setHeader: () => {}, status: vi.fn() } as unknown as Response;
      const next = vi.fn();

      limiter(req, res, next);
      expect(limiter.getEntryCount()).toBe(1);

      limiter.reset();
      expect(limiter.getEntryCount()).toBe(0);

      limiter.destroy();
    });
  });

  describe('Route-Level Rate Limiting Enforcement (Supertest)', () => {
    it('enforces rate limits on POST /api/gmail/sync when activated (6 requests/min)', async () => {
      const userId = 'sync_burst_user';

      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/gmail/sync')
          .set('Authorization', `Bearer ${userId}`)
          .set('x-test-rate-limit', 'true')
          .send({});

        expect(res.status).toBe(404); // GmailNotConnectedError, passed limiter
        expect(res.headers['ratelimit-limit']).toBe('6');
      }

      // 7th request must be rejected with 429
      const blockedRes = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', `Bearer ${userId}`)
        .set('x-test-rate-limit', 'true')
        .send({});

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers['ratelimit-limit']).toBe('6');
      expect(blockedRes.headers['ratelimit-remaining']).toBe('0');
      expect(blockedRes.headers['retry-after']).toBeDefined();
      expect(blockedRes.body.error).toContain('Too many Gmail sync requests');
      expect(blockedRes.body.retryAfter).toBeGreaterThanOrEqual(1);

      // A different user is NOT blocked
      const otherRes = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer different_sync_user')
        .set('x-test-rate-limit', 'true')
        .send({});
      expect(otherRes.status).toBe(404); // Not 429
    });

    it('enforces rate limits on POST /api/notices/:id/convert-to-task (30 requests/min)', async () => {
      const userId = 'convert_burst_user';

      for (let i = 0; i < 30; i++) {
        const res = await request(app)
          .post('/api/notices/notice-test-123/convert-to-task')
          .set('Authorization', `Bearer ${userId}`)
          .set('x-test-rate-limit', 'true')
          .send({});
        expect(res.status).toBe(404);
      }

      // 31st request is blocked
      const blockedRes = await request(app)
        .post('/api/notices/notice-test-123/convert-to-task')
        .set('Authorization', `Bearer ${userId}`)
        .set('x-test-rate-limit', 'true')
        .send({});

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toContain('Task conversion rate limit reached');
    });

    it('enforces IP rate limits on GET /api/gmail/callback (10 requests/min)', async () => {
      const clientIp = '192.168.1.50';

      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .get('/api/gmail/callback?error=access_denied')
          .set('X-Forwarded-For', clientIp)
          .set('x-test-rate-limit', 'true');
        expect(res.status).toBe(302); // Redirects to settings?gmail_error=access_denied
      }

      // 11th request from same IP is blocked with 429
      const blockedRes = await request(app)
        .get('/api/gmail/callback?error=access_denied')
        .set('X-Forwarded-For', clientIp)
        .set('x-test-rate-limit', 'true');

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toContain('Too many OAuth attempts');

      // Different IP is allowed
      const otherIpRes = await request(app)
        .get('/api/gmail/callback?error=access_denied')
        .set('X-Forwarded-For', '192.168.1.51')
        .set('x-test-rate-limit', 'true');
      expect(otherIpRes.status).toBe(302);
    });
  });

  describe('Production Error Sanitization', () => {
    it('does NOT expose internal error details in POST /api/gmail/sync on failure', async () => {
      const dbError = new Error('FATAL: password authentication failed for user "postgres"');
      const { pool } = await import('./db.js');

      vi.spyOn(pool, 'query').mockRejectedValueOnce(dbError);

      const res = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer test_user_err')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: 'Failed to sync Gmail messages',
      });
      // CRITICAL: Ensure details property is NEVER leaked
      expect(res.body.details).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('FATAL');
      expect(JSON.stringify(res.body)).not.toContain('postgres');

      vi.restoreAllMocks();
    });

    it('handles malformed JSON request bodies with sanitized 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/ai/analyze')
        .set('Content-Type', 'application/json')
        .send('{ invalid_json: "missing quote }');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Malformed JSON payload',
      });
      expect(res.body.stack).toBeUndefined();
    });

    it('catches OAuth initialization errors gracefully on GET /api/gmail/auth-url', async () => {
      const res = await request(app)
        .get('/api/gmail/auth-url')
        .set('Authorization', 'Bearer student_user');

      if (res.status === 500) {
        expect(res.body).toEqual({
          error: 'Google authentication is currently unavailable',
        });
        expect(res.body.stack).toBeUndefined();
      } else {
        expect(res.status).toBe(200);
        expect(res.body.url).toBeDefined();
      }
    });
  });
});
