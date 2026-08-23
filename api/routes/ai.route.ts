import { Router } from 'express';
import { aiService } from '../services/ai.service';

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
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
  }
});

export default router;
