import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import campusItemsRouter from './routes/campusItems.route.js';
import aiRouter from './routes/ai.route.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/campus-items', campusItemsRouter);
app.use('/api/ai', aiRouter);

export default app;