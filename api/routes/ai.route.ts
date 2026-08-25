import { Router } from 'express';
import { aiService } from '../services/ai.service.js';

const router = Router();

router.post('/analyze', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }
    
    const result = await aiService.analyzeNotice(text);
    res.json(result);
  } catch (error: unknown) {
    const err = error as { message?: string, status?: number } | null | undefined;
    const message = err?.message || '';
    if (err?.status === 429 || message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      res.status(429).json({ error: 'AI analysis is temporarily unavailable because the AI usage limit has been reached. Please try again later.' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
  }
});

export default router;
