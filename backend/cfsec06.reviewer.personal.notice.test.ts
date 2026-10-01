import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock auth
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer reviewer_1') {
        req.auth = { userId: 'reviewer_1', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer student_1') {
        req.auth = { userId: 'student_1', sessionClaims: { metadata: { role: 'student' } } };
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    requireAuth: () => (
      req: Request & { auth?: { userId: string | null } },
      res: Response,
      next: NextFunction,
    ) => {
      if (!req.auth || !req.auth.userId) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
      next();
    },
    getAuth: (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }) => ({
      userId: req.auth?.userId || null,
      sessionClaims: req.auth?.sessionClaims,
    }),
  };
});

import app from './index.js';
import { pool } from './db.js';
import { notificationsService } from './services/notifications.service.js';
import { noticesService } from './services/notices.service.js';

describe('CF-SEC-06: Reviewer Personal Notice Moderation & Notification Safety Invariant', () => {
  let personalNoticeId: string;
  let institutionalNoticeId: string;

  beforeEach(async () => {
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM notice_suppressions');
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');

    personalNoticeId = randomUUID();
    institutionalNoticeId = randomUUID();

    // 1. Seed personal Gmail notice owned by student_1
    await pool.query(
      `
      INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_provider, source_account_email, source_message_id, source_type, created_at
      ) VALUES (
        $1, 'student_1', 'Student Personal Grade Alert', 'Private email from professor',
        'academic', 'urgent', 'pending', 'gmail', 'student1@vitstudent.ac.in', 'msg_personal_100',
        'gmail_personal', CURRENT_TIMESTAMP
      )
      `,
      [personalNoticeId],
    );

    // 2. Seed institutional pending notice created by reviewer_1
    await pool.query(
      `
      INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_provider, source_account_email, source_message_id, source_type, created_at
      ) VALUES (
        $1, 'reviewer_1', 'Campus Holiday Notice', 'Official university holiday circular',
        'general', 'normal', 'pending', 'gmail', 'admin@vit.ac.in', 'msg_inst_200',
        'institutional', CURRENT_TIMESTAMP
      )
      `,
      [institutionalNoticeId],
    );
  });

  it('rejects reviewer PATCH update on a gmail_personal notice with 403 Forbidden', async () => {
    const res = await request(app)
      .patch(`/api/notices/${personalNoticeId}`)
      .set('Authorization', 'Bearer reviewer_1')
      .send({
        title: 'Reviewer Modified Title',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Personal Gmail notices cannot be moderated');

    // Verify title in DB was not changed
    const { rows } = await pool.query('SELECT title FROM notices WHERE id = $1', [personalNoticeId]);
    expect(rows[0].title).toBe('Student Personal Grade Alert');
  });

  it('rejects reviewer approve on a gmail_personal notice with 403 Forbidden', async () => {
    const res = await request(app)
      .post(`/api/notices/${personalNoticeId}/approve`)
      .set('Authorization', 'Bearer reviewer_1');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Personal Gmail notices cannot be moderated');

    const { rows } = await pool.query('SELECT status FROM notices WHERE id = $1', [personalNoticeId]);
    expect(rows[0].status).toBe('pending');
  });

  it('rejects reviewer publish on a gmail_personal notice with 403 Forbidden', async () => {
    // First manually set status to approved in DB
    await pool.query("UPDATE notices SET status = 'approved' WHERE id = $1", [personalNoticeId]);

    const res = await request(app)
      .post(`/api/notices/${personalNoticeId}/publish`)
      .set('Authorization', 'Bearer reviewer_1');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Personal Gmail notices cannot be moderated');

    // Verify notice was NOT published
    const { rows } = await pool.query('SELECT status FROM notices WHERE id = $1', [personalNoticeId]);
    expect(rows[0].status).toBe('approved');

    // Invariant: No notification was created
    const { rows: notifRows } = await pool.query('SELECT * FROM notifications WHERE notice_id = $1', [personalNoticeId]);
    expect(notifRows).toHaveLength(0);
  });

  it('rejects reviewer reject on a gmail_personal notice with 403 Forbidden', async () => {
    const res = await request(app)
      .post(`/api/notices/${personalNoticeId}/reject`)
      .set('Authorization', 'Bearer reviewer_1');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Personal Gmail notices cannot be moderated');
  });

  it('rejects reviewer archive on a gmail_personal notice with 403 Forbidden', async () => {
    const res = await request(app)
      .post(`/api/notices/${personalNoticeId}/archive`)
      .set('Authorization', 'Bearer reviewer_1');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Personal Gmail notices cannot be moderated');
  });

  it('rejects reviewer DELETE on a gmail_personal notice with 403 Forbidden and preserves notice & suppression', async () => {
    const res = await request(app)
      .delete(`/api/notices/${personalNoticeId}`)
      .set('Authorization', 'Bearer reviewer_1');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Personal Gmail notices cannot be deleted');

    // Verify notice still exists in PostgreSQL
    const { rows: noticeRows } = await pool.query('SELECT id FROM notices WHERE id = $1', [personalNoticeId]);
    expect(noticeRows).toHaveLength(1);

    // Verify notice was NOT added to suppressions
    const { rows: suppRows } = await pool.query('SELECT id FROM notice_suppressions WHERE source_message_id = $1', ['msg_personal_100']);
    expect(suppRows).toHaveLength(0);
  });

  it('allows reviewer to moderate an institutional notice normally', async () => {
    // 1. Approve
    const approveRes = await request(app)
      .post(`/api/notices/${institutionalNoticeId}/approve`)
      .set('Authorization', 'Bearer reviewer_1');
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('approved');

    // 2. Publish
    const publishRes = await request(app)
      .post(`/api/notices/${institutionalNoticeId}/publish`)
      .set('Authorization', 'Bearer reviewer_1');
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe('published');

    // Verify broadcast notification was generated
    const { rows: notifRows } = await pool.query('SELECT * FROM notifications WHERE notice_id = $1', [institutionalNoticeId]);
    expect(notifRows).toHaveLength(1);
    expect(notifRows[0].recipient_role).toBe('all');
    expect(notifRows[0].type).toBe('notice_published');

    // 3. Delete
    const deleteRes = await request(app)
      .delete(`/api/notices/${institutionalNoticeId}`)
      .set('Authorization', 'Bearer reviewer_1');
    expect(deleteRes.status).toBe(204);

    const { rows: checkRows } = await pool.query('SELECT id FROM notices WHERE id = $1', [institutionalNoticeId]);
    expect(checkRows).toHaveLength(0);
  });

  it('preserves personal owner student operations (view and convert-to-task)', async () => {
    // Student 1 can view their personal notice
    const getRes = await request(app)
      .get(`/api/notices/${personalNoticeId}`)
      .set('Authorization', 'Bearer student_1');
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(personalNoticeId);
    expect(getRes.body.sourceType).toBe('gmail_personal');

    // Student 1 can convert personal notice to task
    const convertRes = await request(app)
      .post(`/api/notices/${personalNoticeId}/convert-to-task`)
      .set('Authorization', 'Bearer student_1')
      .send({
        dueDate: '2026-11-20',
      });
    expect(convertRes.status).toBe(201);
    expect(convertRes.body.task.title).toBe('Student Personal Grade Alert');
  });

  it('notification safety invariant: notifyNoticePublished queries persisted notice and rejects gmail_personal', async () => {
    const personalNotice = await noticesService.getById(personalNoticeId, true, 'student_1');
    expect(personalNotice).not.toBeNull();

    // Call notifyNoticePublished directly with personal notice
    await notificationsService.notifyNoticePublished(personalNotice!);

    // Verify 0 notifications in database
    const { rows: notifRows1 } = await pool.query('SELECT * FROM notifications WHERE notice_id = $1', [personalNoticeId]);
    expect(notifRows1).toHaveLength(0);

    // Call notifyNoticePublished with spoofed in-memory sourceType: 'institutional'
    const spoofedNotice = { ...personalNotice!, sourceType: 'institutional' as const };
    await notificationsService.notifyNoticePublished(spoofedNotice);

    // Because DB has source_type = 'gmail_personal', DB check catches it and still 0 notifications!
    const { rows: notifRows2 } = await pool.query('SELECT * FROM notifications WHERE notice_id = $1', [personalNoticeId]);
    expect(notifRows2).toHaveLength(0);
  });
});
