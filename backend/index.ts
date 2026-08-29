import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import campusItemsRouter from './routes/campusItems.route.js';
import aiRouter from './routes/ai.route.js';

import coursesRouter from './routes/courses.route.js';
import assignmentsRouter from './routes/assignments.route.js';
import gmailRouter from './routes/gmail.route.js';

import { clerkAuth, requireAuthMiddleware } from './middleware/requireAuth.js';


const app = express();

app.use(cors());
app.use(express.json());



// Attach Clerk auth context globally
app.use(clerkAuth);

// Fully protected routes
app.use('/api/courses', requireAuthMiddleware, coursesRouter);
app.use('/api/assignments', requireAuthMiddleware, assignmentsRouter);
app.use('/api/ai', requireAuthMiddleware, aiRouter);
app.use('/api/gmail', gmailRouter);

// Partially protected route (GET is public, mutations are protected inside)
app.use('/api/campus-items', campusItemsRouter);

export default app;