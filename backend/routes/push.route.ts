import { Router } from 'express';
import { getAuth } from '@clerk/express';
import { pushService } from '../services/push.service.js';

const router = Router();

// GET /api/notifications/push/vapid-key
router.get('/vapid-key', (_req, res) => {
  try {
    const publicKey = pushService.getVapidPublicKey();
    if (!publicKey) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ error: 'Push notifications are not configured on this server.' });
      }
      return res.json({ publicKey: '' });
    }
    res.json({ publicKey });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to retrieve VAPID key' });
  }
});

// POST /api/notifications/push/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription payload. endpoint, keys.p256dh, and keys.auth are required.' });
    }

    const saved = await pushService.saveSubscription(userId, {
      endpoint,
      keys,
      userAgent: userAgent || req.headers['user-agent'],
    });

    res.status(201).json({ success: true, subscription: saved });
  } catch (err) {
    console.error('Error saving push subscription:', err);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// POST /api/notifications/push/unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required to unsubscribe.' });
    }

    const deleted = await pushService.deleteSubscription(userId, endpoint);
    res.json({ success: deleted });
  } catch (err) {
    console.error('Error removing push subscription:', err);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

// POST /api/notifications/push/test
router.post('/test', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pushService.testPushNotification(userId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Error sending test push notification:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send test push notification' });
  }
});

export default router;
