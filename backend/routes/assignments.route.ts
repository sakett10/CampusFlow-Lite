import { Router } from 'express';
import { assignmentsService } from '../services/assignments.service.js';
import { getAuth } from '@clerk/express';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    const items = await assignmentsService.getAll(userId);
    res.json(items);
  } catch (error) {
    console.error('Failed to load assignments:', error);
    res.status(500).json({ error: 'Failed to load assignments' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    // Do not accept user_id from body
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user_id, userId: bodyUserId, ...itemData } = req.body;
    const newItem = await assignmentsService.add(userId, itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Failed to create assignment:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user_id, userId: bodyUserId, ...itemData } = req.body;
    const item = await assignmentsService.update(userId, req.params.id, itemData);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
    } else {
      res.json(item);
    }
  } catch (error) {
    console.error('Failed to update assignment:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    const { status } = req.body;
    const item = await assignmentsService.update(userId, req.params.id, { status });
    if (!item) {
      res.status(404).json({ error: 'Not found' });
    } else {
      res.json(item);
    }
  } catch (error) {
    console.error('Failed to update assignment status:', error);
    res.status(500).json({ error: 'Failed to update assignment status' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    const success = await assignmentsService.delete(userId, req.params.id);
    if (success) {
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (error) {
    console.error('Failed to delete assignment:', error);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

export default router;
