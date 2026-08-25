import { Router } from 'express';
import { storageService } from '../services/storage.service.js';
import { getAuth } from '@clerk/express';
import { requireAuthMiddleware } from '../middleware/requireAuth.js';

const router = Router();

router.get('/', requireAuthMiddleware, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    const items = await storageService.getAll(userId);
    res.json(items);
  } catch (error) {
    console.error('Failed to load campus items:', error);
    res.status(500).json({ error: 'Failed to load campus items' });
  }
});

router.post('/', requireAuthMiddleware, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user_id, userId: bodyUserId, ...itemData } = req.body;
    const newItem = await storageService.add(userId, itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Failed to create campus item:', error);
    res.status(500).json({ error: 'Failed to create campus item' });
  }
});

router.delete('/:id', requireAuthMiddleware, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    const success = await storageService.delete(userId, req.params.id);

    if (success) {
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (error) {
    console.error('Failed to delete campus item:', error);
    res.status(500).json({ error: 'Failed to delete campus item' });
  }
});

export default router;