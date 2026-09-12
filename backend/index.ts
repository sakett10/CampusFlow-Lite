import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import campusItemsRouter from './routes/campusItems.route.js';
import aiRouter from './routes/ai.route.js';

import coursesRouter from './routes/courses.route.js';
import assignmentsRouter from './routes/assignments.route.js';
import gmailRouter from './routes/gmail.route.js';
import noticesRouter from './routes/notices.route.js';
import notificationsRouter from './routes/notifications.route.js';

import { clerkAuth, requireAuthMiddleware } from './middleware/requireAuth.js';
import { globalApiLimiter } from './middleware/rateLimiter.js';
import type { Request, Response, NextFunction } from 'express';

const app = express();

export const normalizeOrigin = (url?: string | null): string => {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '');
};

export function getAllowedOrigins(): string[] {
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);

  return Array.from(
    new Set(
      [
        normalizeOrigin(process.env.FRONTEND_URL),
        ...envOrigins,
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:4173',
      ].filter(Boolean),
    ),
  );
}

export function isOriginAllowed(origin?: string | null): boolean {
  const cleanOrigin = normalizeOrigin(origin);
  if (!cleanOrigin) return true;
  return getAllowedOrigins().includes(cleanOrigin);
}

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (
        !origin ||
        process.env.NODE_ENV === 'test' ||
        isOriginAllowed(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
  }),
);
app.use(express.json());

// Attach Clerk auth context globally
app.use(clerkAuth);

// Define API router
const apiRouter = express.Router();

// Apply global API rate limiter to all API endpoints
apiRouter.use(globalApiLimiter);

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

apiRouter.use('/courses', requireAuthMiddleware, coursesRouter);
apiRouter.use('/assignments', requireAuthMiddleware, assignmentsRouter);
apiRouter.use('/tasks', requireAuthMiddleware, assignmentsRouter);
apiRouter.use('/ai', requireAuthMiddleware, aiRouter);
apiRouter.use('/gmail', gmailRouter);
apiRouter.use('/notices', noticesRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/campus-items', campusItemsRouter);

// Mount under both /api and / to handle both direct /api routes and Vercel serverless rewrites
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Centralized production error handler
// Note: Express requires all 4 parameters (err, req, res, next) for error-handling middleware signature
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const errorObj = err as { type?: string; status?: number; statusCode?: number; message?: string } | null;

  // Handle JSON parse errors from body-parser/express.json()
  if (errorObj?.type === 'entity.parse.failed' || (errorObj?.status === 400 && 'body' in (err as object))) {
    res.status(400).json({ error: 'Malformed JSON payload' });
    return;
  }

  // Log full error details securely on the server
  console.error('Unhandled server error:', err);

  // Return generic sanitized error response to client without leaking internal stacks/details
  const statusCode = typeof errorObj?.statusCode === 'number'
    ? errorObj.statusCode
    : typeof errorObj?.status === 'number'
      ? errorObj.status
      : 500;

  res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
    error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
  });
});

export { app };
export default app;