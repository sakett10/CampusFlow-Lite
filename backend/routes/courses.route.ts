import { Router } from 'express';
import { coursesService } from '../services/courses.service.js';
import { getAuth } from '@clerk/express';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    const items = await coursesService.getAll(userId);
    res.json(items);
  } catch (error) {
    console.error('Failed to load courses:', error);
    res.status(500).json({ error: 'Failed to load courses' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user_id, userId: bodyUserId, ...itemData } = req.body;
    const newItem = await coursesService.add(userId, itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Failed to create course:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user_id, userId: bodyUserId, ...itemData } = req.body;
    const item = await coursesService.update(userId, req.params.id, itemData);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
    } else {
      res.json(item);
    }
  } catch (error) {
    console.error('Failed to update course:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

router.patch('/:id/attendance', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    // Only expect totalClasses and attendedClasses
    const { totalClasses, attendedClasses } = req.body;
    const item = await coursesService.update(userId, req.params.id, { totalClasses, attendedClasses });
    if (!item) {
      res.status(404).json({ error: 'Not found' });
    } else {
      res.json(item);
    }
  } catch (error) {
    console.error('Failed to update attendance:', error);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).send();
    const success = await coursesService.delete(userId, req.params.id);
    if (success) {
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (error) {
    console.error('Failed to delete course:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

export default router;
