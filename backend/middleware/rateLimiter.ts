/**
 * In-Memory Sliding-Window Rate Limiter
 *
 * SERVERLESS CONSTRAINTS & ARCHITECTURAL CAVEAT:
 * This rate limiter is process-local (in-memory) and maintains request timestamps within
 * the running Node.js process / warm container instance. In horizontally scaled serverless
 * environments such as Vercel, memory state is not synchronized across concurrent or newly
 * spun-up container instances. It provides effective per-instance burst and denial-of-service
 * protection without external infrastructure dependencies, but is not a complete distributed
 * rate-limiting tier (e.g. Redis / Upstash).
 */

import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';

export interface RateLimiterOptions {
  /** Time window in milliseconds (default: 60,000ms = 1 minute) */
  windowMs?: number;
  /** Maximum number of allowed requests in the window */
  max: number;
  /** Custom error message returned in the 429 response */
  message?: string;
  /** Custom key generator (default: user ID if authenticated, else IP) */
  keyGenerator?: (req: Request) => string;
  /** Custom skip predicate */
  skip?: (req: Request) => boolean;
  /** Key prefix to namespace stores across different endpoints */
  prefix?: string;
  /** Explicitly enable limiter in test environment */
  enableInTests?: boolean;
}

export interface RateLimiterMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
  reset: () => void;
  destroy: () => void;
  getEntryCount: () => number;
}

/**
 * Derives a rate limit identity key:
 * - For authenticated requests: Clerk userId (`user:<userId>`)
 * - For unauthenticated requests: Client IP (`ip:<ip>`)
 */
export function defaultRateLimitKeyGenerator(req: Request, prefix = 'rl'): string {
  try {
    const auth = getAuth(req);
    if (auth?.userId) {
      return `${prefix}:user:${auth.userId}`;
    }
  } catch {
    // If Clerk auth extraction fails or is unmounted, fall back to IP
  }

  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  return `${prefix}:ip:${clientIp}`;
}

/**
 * Derives an IP-only rate limit identity key (for unauthenticated endpoints like OAuth callbacks).
 */
export function ipOnlyRateLimitKeyGenerator(req: Request, prefix = 'rl:ip'): string {
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  return `${prefix}:${clientIp}`;
}

/**
 * Factory to create an in-memory sliding-window rate limiter middleware.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiterMiddleware {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max;
  const message = options.message ?? 'Too many requests. Please try again later.';
  const prefix = options.prefix ?? 'rl';
  const keyGen = options.keyGenerator ?? ((req: Request) => defaultRateLimitKeyGenerator(req, prefix));

  // In-memory sliding-window store: key -> array of request timestamps (ms)
  const store = new Map<string, number[]>();

  // Prune expired entries periodically to prevent memory leaks
  const cleanupInterval = Math.max(windowMs, 10_000);
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store.entries()) {
      const valid = timestamps.filter((t) => t > now - windowMs);
      if (valid.length === 0) {
        store.delete(key);
      } else {
        store.set(key, valid);
      }
    }
  }, cleanupInterval);

  // Unref timer so Node process and test runners can exit cleanly
  if (timer.unref) {
    timer.unref();
  }

  const middleware: RateLimiterMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    // Allow skipping (e.g. in test runs unless explicitly enabled)
    if (options.skip?.(req)) {
      next();
      return;
    }

    const isTestEnv = process.env.NODE_ENV === 'test';
    if (isTestEnv && !options.enableInTests && req.headers['x-test-rate-limit'] !== 'true') {
      next();
      return;
    }

    const key = keyGen(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    const existingTimestamps = store.get(key) || [];
    const validTimestamps = existingTimestamps.filter((t) => t > windowStart);

    if (validTimestamps.length >= max) {
      const oldestTimestamp = validTimestamps[0];
      const resetMs = Math.max(0, oldestTimestamp + windowMs - now);
      const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));

      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', 0);
      res.setHeader('RateLimit-Reset', retryAfterSeconds);
      res.setHeader('Retry-After', retryAfterSeconds);

      res.status(429).json({
        error: message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    // Record new request
    validTimestamps.push(now);
    store.set(key, validTimestamps);

    const remaining = Math.max(0, max - validTimestamps.length);
    const oldestTimestamp = validTimestamps[0];
    const resetSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    next();
  };

  middleware.reset = () => {
    store.clear();
  };

  middleware.destroy = () => {
    clearInterval(timer);
    store.clear();
  };

  middleware.getEntryCount = () => {
    return store.size;
  };

  return middleware;
}

// Pre-configured rate limiters per Phase 2B specification

/**
 * Rate limiter for POST /api/gmail/sync: 6 requests per minute per user.
 */
export const gmailSyncLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 6,
  prefix: 'sync',
  message: 'Too many Gmail sync requests. Please wait a moment before syncing again.',
});

/**
 * Rate limiter for POST /api/ai/analyze: 10 requests per minute per user.
 */
export const aiAnalyzeLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  prefix: 'ai',
  message: 'AI analysis rate limit reached. Please wait a moment before analyzing more notices.',
});

/**
 * Rate limiter for POST /api/gmail/analyze/:messageId: 10 requests per minute per user.
 */
export const gmailAnalyzeLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  prefix: 'gmail-ai',
  message: 'Notice analysis rate limit reached. Please wait a moment before analyzing more messages.',
});

/**
 * Rate limiter for POST /api/notices/:id/convert-to-task: 30 requests per minute per user.
 */
export const noticeConvertLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  prefix: 'convert',
  message: 'Task conversion rate limit reached. Please wait before converting more notices.',
});

/**
 * Rate limiter for GET /api/gmail/callback: 10 requests per minute per IP.
 */
export const gmailCallbackLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  prefix: 'oauth',
  keyGenerator: (req) => ipOnlyRateLimitKeyGenerator(req, 'rl:oauth'),
  message: 'Too many OAuth attempts. Please wait before trying again.',
});

/**
 * General rate limiter for /api/*:
 * - Authenticated requests: 120 requests per minute per user
 * - Unauthenticated fallback: 300 requests per minute per IP (wide NAT-friendly ceiling)
 */
export const globalApiLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  prefix: 'api',
  keyGenerator: (req) => {
    try {
      const auth = getAuth(req);
      if (auth?.userId) {
        return `api:user:${auth.userId}`;
      }
    } catch {
      // Fall through to IP
    }
    return ipOnlyRateLimitKeyGenerator(req, 'api:ip');
  },
  skip: (req) => {
    // Health checks do not consume standard API quota
    return req.path === '/health' || req.path === '/api/health';
  },
  message: 'Too many API requests. Please slow down.',
});

/**
 * Rate limiter for POST /api/webhooks/clerk: 60 requests per minute per IP.
 */
export const clerkWebhookLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  prefix: 'webhook',
  keyGenerator: (req) => ipOnlyRateLimitKeyGenerator(req, 'rl:webhook'),
  message: 'Too many webhook requests. Please wait before retrying.',
});
