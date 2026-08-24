import { Router } from 'express';
import { storageService } from '../services/storage.service.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const items = await storageService.getAll();
    res.json(items);
  } catch (error) {
    console.error('Failed to load campus items:', error);
    res.status(500).json({ error: 'Failed to load campus items' });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = req.body;
    const newItem = await storageService.add(item);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Failed to create campus item:', error);
    res.status(500).json({ error: 'Failed to create campus item' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await storageService.delete(req.params.id);

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