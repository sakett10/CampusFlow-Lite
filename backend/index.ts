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
    origin: (origin, callback) => {
      if (!origin || process.env.NODE_ENV === 'test' || allowedOrigins.includes(origin)) {
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

// Fully protected routes
app.use('/api/courses', requireAuthMiddleware, coursesRouter);
app.use('/api/assignments', requireAuthMiddleware, assignmentsRouter);
app.use('/api/ai', requireAuthMiddleware, aiRouter);
app.use('/api/gmail', gmailRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/notifications', notificationsRouter);


// Partially protected route (GET is public, mutations are protected inside)
app.use('/api/campus-items', campusItemsRouter);


export default app;