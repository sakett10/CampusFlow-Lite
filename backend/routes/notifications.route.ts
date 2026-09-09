import { Router } from 'express';
import { getAuth } from '@clerk/express';
import { isReviewer, requireAuth } from '../middleware/requireAuth.js';
import { notificationsService } from '../services/notifications.service.js';

const router = Router();

/**
 * Get in-app notifications for authenticated user
 * GET /api/notifications
 */
router.get('/', requireAuth(), async (req, res) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  try {
    const reviewer = isReviewer(req);
    const notifications = await notificationsService.getAllForUser(auth.userId, reviewer);
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return res.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Failed to get notifications:', error);
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * Mark a single notification as read
 * POST /api/notifications/:id/read or PATCH /api/notifications/:id/read
 */
const markReadHandler = async (req: import('express').Request, res: import('express').Response) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  try {
    await notificationsService.markAsRead(auth.userId, id);
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

router.post('/:id/read', requireAuth(), markReadHandler);
router.patch('/:id/read', requireAuth(), markReadHandler);

/**
 * Mark all notifications as read
 * POST /api/notifications/read-all
 */
router.post('/read-all', requireAuth(), async (req, res) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  try {
    await notificationsService.markAllAsRead(auth.userId);
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    return res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

export default router;
