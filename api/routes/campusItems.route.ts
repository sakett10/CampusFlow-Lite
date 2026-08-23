import { Router } from 'express';
import { storageService } from '../services/storage.service.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(storageService.getAll());
});

router.post('/', (req, res) => {
  const item = req.body;
  const newItem = storageService.add(item);
  res.status(201).json(newItem);
});

router.delete('/:id', (req, res) => {
  const success = storageService.delete(req.params.id);
  if (success) {
    res.status(204).send();
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

export default router;
