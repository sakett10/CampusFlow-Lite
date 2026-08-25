import { Router } from 'express';
import { assignmentsService } from '../services/assignments.service.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const items = await assignmentsService.getAll();
    res.json(items);
  } catch (error) {
    console.error('Failed to load assignments:', error);
    res.status(500).json({ error: 'Failed to load assignments' });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = req.body;
    const newItem = await assignmentsService.add(item);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Failed to create assignment:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await assignmentsService.update(req.params.id, req.body);
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
    const { status } = req.body;
    const item = await assignmentsService.update(req.params.id, { status });
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
    const success = await assignmentsService.delete(req.params.id);
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
