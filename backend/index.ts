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


const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (
        !origin ||
        process.env.NODE_ENV === 'test' ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app')
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

export { app };
export default app;