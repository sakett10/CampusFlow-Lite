import { Router } from 'express';
import { remindersService } from '../services/reminders.service.js';

const router = Router();

const handleProcessReminders = async (req: import('express').Request, res: import('express').Response) => {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.authorization;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid cron authorization token.' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'CRON_SECRET environment variable is not configured.' });
  }

  try {
    const limit = Number(req.query.limit) || 50;
    const stats = await remindersService.processDueReminders(limit);
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...stats,
    });
  } catch (err) {
    console.error('Error in cron/process-reminders:', err);
    res.status(500).json({
      error: 'Failed to process task reminders',
      details: err instanceof Error ? err.message : String(err),
    });
  }
};

router.get('/process-reminders', handleProcessReminders);
router.post('/process-reminders', handleProcessReminders);

export default router;
