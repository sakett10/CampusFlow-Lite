import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import campusItemsRouter from './routes/campusItems.route.js';
import aiRouter from './routes/ai.route.js';

import coursesRouter from './routes/courses.route.js';
import assignmentsRouter from './routes/assignments.route.js';

import { clerkAuth, requireAuthMiddleware } from './middleware/requireAuth.js';


const app = express();

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log({ method: req.method, url: req.url, originalUrl: req.originalUrl, path: req.path });
  next();
});

// Attach Clerk auth context globally with safe error handling
app.use((req, res, next) => {
  try {
    clerkAuth(req, res, (err) => {
      if (err) {
        console.error('[CLERK_ERROR]', {
          route: req.path,
          method: req.method,
          errorClass: err.name,
          message: err.message,
          secretExists: !!process.env.CLERK_SECRET_KEY,
          authHeaderExists: !!req.headers.authorization
        });
        return next(err);
      }
      next();
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[CLERK_SYNC_ERROR]', {
      route: req.path,
      method: req.method,
      errorClass: error.name,
      message: error.message,
      secretExists: !!process.env.CLERK_SECRET_KEY,
      authHeaderExists: !!req.headers.authorization
    });
    next(err);
  }
});

// Fully protected routes
app.use('/api/courses', requireAuthMiddleware, coursesRouter);
app.use('/api/assignments', requireAuthMiddleware, assignmentsRouter);
app.use('/api/ai', requireAuthMiddleware, aiRouter);

// Partially protected route (GET is public, mutations are protected inside)
app.use('/api/campus-items', campusItemsRouter);

export default app;