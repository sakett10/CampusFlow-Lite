import { Router } from 'express';
import { getAuth } from '@clerk/express';
import { remindersService, type ReminderType } from '../services/reminders.service.js';

const router = Router();

// GET /api/reminders/preferences
router.get('/preferences', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const prefs = await remindersService.getUserPreferences(userId);
    res.json(prefs);
  } catch (err) {
    console.error('Failed to get user reminder preferences:', err);
    res.status(500).json({ error: 'Failed to get reminder preferences' });
  }
});

// PUT /api/reminders/preferences
router.put('/preferences', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { defaultReminderOffset, timezone } = req.body;
    const updated = await remindersService.setUserPreferences(userId, {
      defaultReminderOffset,
      timezone,
    });
    res.json(updated);
  } catch (err) {
    console.error('Failed to update user reminder preferences:', err);
    res.status(500).json({ error: 'Failed to update reminder preferences' });
  }
});

// GET /api/reminders/task/:taskId
router.get('/task/:taskId', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const reminder = await remindersService.getByTaskId(userId, req.params.taskId);
    if (!reminder) {
      return res.status(404).json({ error: 'No reminder found for this task' });
    }
    res.json(reminder);
  } catch (err) {
    console.error('Failed to get task reminder:', err);
    res.status(500).json({ error: 'Failed to get task reminder' });
  }
});

// PUT /api/reminders/task/:taskId
router.put('/task/:taskId', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { reminderType, customRemindAt, customDate, customTime, timezone } = req.body;

    if (!reminderType) {
      return res.status(400).json({ error: 'reminderType is required' });
    }

    const updated = await remindersService.upsertTaskReminder({
      userId,
      taskId: req.params.taskId,
      reminderType: reminderType as ReminderType,
      customRemindAt,
      customDate,
      customTime,
      timezone,
    });

    res.json({ reminder: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') || msg.includes('access denied')) {
      return res.status(404).json({ error: msg });
    }
    console.error('Failed to set task reminder:', err);
    res.status(400).json({ error: msg });
  }
});

// DELETE /api/reminders/task/:taskId
router.delete('/task/:taskId', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const deleted = await remindersService.deleteReminder(userId, req.params.taskId);
    res.json({ success: deleted });
  } catch (err) {
    console.error('Failed to delete task reminder:', err);
    res.status(500).json({ error: 'Failed to delete task reminder' });
  }
});

export default router;
