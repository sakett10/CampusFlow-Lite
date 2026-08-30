import { Router } from 'express';
import { getAuth, requireAuth } from '@clerk/express';
import {
  isReviewer,
  requireReviewerMiddleware,
} from '../middleware/requireAuth.js';
import {
  noticesService,
  DuplicateNoticeError,
  InvalidNoticeStateTransitionError,
  NoticeNotFoundError,
} from '../services/notices.service.js';
import { NoticeValidationError } from '../services/noticeValidator.js';
import { GmailNotConnectedError } from '../services/gmail.service.js';
import type { NoticeCategory, NoticePriority, NoticeStatus } from '../types.js';

const router = Router();

/**
 * List campus notices (Students: published only; Reviewers: all or filtered status)
 * GET /api/notices
 */
router.get('/', requireAuth(), async (req, res) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  try {
    const reviewer = isReviewer(req);
    const { status, category, priority, search } = req.query;

    const notices = await noticesService.getAll({
      isReviewer: reviewer,
      status: typeof status === 'string' ? (status as NoticeStatus) : undefined,
      category: typeof category === 'string' ? (category as NoticeCategory) : undefined,
      priority: typeof priority === 'string' ? (priority as NoticePriority) : undefined,
      search: typeof search === 'string' ? search : undefined,
    });

    return res.json(notices);
  } catch (error) {
    console.error('Failed to load notices:', error);
    return res.status(500).json({ error: 'Failed to load notices' });
  }
});

/**
 * Get notice by ID (Students: published only; Reviewers: any status)
 * GET /api/notices/:id
 */
router.get('/:id', requireAuth(), async (req, res) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid notice ID' });
  }

  try {
    const reviewer = isReviewer(req);
    const notice = await noticesService.getById(id, reviewer);

    if (!notice) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    return res.json(notice);
  } catch (error) {
    console.error('Failed to get notice:', error);
    return res.status(500).json({ error: 'Failed to get notice' });
  }
});

/**
 * Create notice manually as pending (Reviewer only)
 * POST /api/notices
 */
router.post('/', requireReviewerMiddleware, async (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  try {
    const notice = await noticesService.createFromCandidate(userId, req.body);
    return res.status(201).json(notice);
  } catch (error) {
    if (error instanceof NoticeValidationError) {
      return res.status(422).json({
        error: error.message,
        fieldErrors: error.fieldErrors,
      });
    }
    if (error instanceof DuplicateNoticeError) {
      return res.status(409).json({
        error: error.message,
        existingNoticeId: error.existingNoticeId,
      });
    }

    console.error('Failed to create notice:', error);
    return res.status(500).json({ error: 'Failed to create notice' });
  }
});

/**
 * Ingest notice from Gmail message (Reviewer only)
 * POST /api/notices/from-gmail/:messageId
 */
router.post('/from-gmail/:messageId', requireReviewerMiddleware, async (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { messageId } = req.params;

  if (!messageId || typeof messageId !== 'string') {
    return res.status(400).json({ error: 'Invalid message ID' });
  }

  try {
    const notice = await noticesService.createFromGmailMessage(userId, messageId);
    return res.status(201).json(notice);
  } catch (error) {
    if (error instanceof DuplicateNoticeError) {
      return res.status(409).json({
        error: error.message,
        existingNoticeId: error.existingNoticeId,
      });
    }
    if (error instanceof GmailNotConnectedError) {
      return res.status(404).json({ error: 'Gmail account is not connected' });
    }
    if (
      error &&
      typeof error === 'object' &&
      ('code' in error || 'status' in error)
    ) {
      const statusCode =
        (error as { code?: number; status?: number }).code ||
        (error as { code?: number; status?: number }).status;
      if (statusCode === 404) {
        return res.status(404).json({ error: 'Gmail message not found' });
      }
    }
    if (error instanceof NoticeValidationError) {
      return res.status(422).json({
        error: error.message,
        fieldErrors: error.fieldErrors,
      });
    }

    console.error('Failed to ingest notice from Gmail:', error);
    return res.status(500).json({ error: 'Failed to ingest notice from Gmail' });
  }
});

/**
 * Update notice fields (Reviewer only)
 * PATCH /api/notices/:id
 */
router.patch('/:id', requireReviewerMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid notice ID' });
  }

  try {
    const updated = await noticesService.update(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    return res.json(updated);
  } catch (error) {
    if (error instanceof NoticeValidationError) {
      return res.status(422).json({
        error: error.message,
        fieldErrors: error.fieldErrors,
      });
    }
    if (error instanceof InvalidNoticeStateTransitionError) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Failed to update notice:', error);
    return res.status(500).json({ error: 'Failed to update notice' });
  }
});

/**
 * Approve pending notice (Reviewer only)
 * POST /api/notices/:id/approve
 */
router.post('/:id/approve', requireReviewerMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const notice = await noticesService.approve(id);
    return res.json(notice);
  } catch (error) {
    if (error instanceof NoticeNotFoundError) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    if (error instanceof InvalidNoticeStateTransitionError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Failed to approve notice:', error);
    return res.status(500).json({ error: 'Failed to approve notice' });
  }
});

/**
 * Publish approved notice (Reviewer only)
 * POST /api/notices/:id/publish
 */
router.post('/:id/publish', requireReviewerMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const notice = await noticesService.publish(id);
    return res.json(notice);
  } catch (error) {
    if (error instanceof NoticeNotFoundError) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    if (error instanceof InvalidNoticeStateTransitionError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Failed to publish notice:', error);
    return res.status(500).json({ error: 'Failed to publish notice' });
  }
});

/**
 * Reject pending/approved notice (Reviewer only)
 * POST /api/notices/:id/reject
 */
router.post('/:id/reject', requireReviewerMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const notice = await noticesService.reject(id);
    return res.json(notice);
  } catch (error) {
    if (error instanceof NoticeNotFoundError) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    if (error instanceof InvalidNoticeStateTransitionError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Failed to reject notice:', error);
    return res.status(500).json({ error: 'Failed to reject notice' });
  }
});

/**
 * Archive published/rejected notice (Reviewer only)
 * POST /api/notices/:id/archive
 */
router.post('/:id/archive', requireReviewerMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const notice = await noticesService.archive(id);
    return res.json(notice);
  } catch (error) {
    if (error instanceof NoticeNotFoundError) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    if (error instanceof InvalidNoticeStateTransitionError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Failed to archive notice:', error);
    return res.status(500).json({ error: 'Failed to archive notice' });
  }
});

/**
 * Delete notice (Reviewer only)
 * DELETE /api/notices/:id
 */
router.delete('/:id', requireReviewerMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await noticesService.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Failed to delete notice:', error);
    return res.status(500).json({ error: 'Failed to delete notice' });
  }
});

export default router;
