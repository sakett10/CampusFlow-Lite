import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock Clerk middleware to allow switching identities dynamically
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        if (token === 'reviewer_legit') {
          req.auth = { userId: 'user_legit_reviewer', sessionClaims: { metadata: { role: 'reviewer' } } };
        } else if (token === 'admin_legit') {
          req.auth = { userId: 'user_legit_admin', sessionClaims: { metadata: { role: 'admin' } } };
        } else if (token === 'reviewer_fake') {
          req.auth = { userId: 'reviewer_fake', sessionClaims: { metadata: { role: 'student' } } };
        } else if (token === 'student_A') {
          req.auth = { userId: 'student_A', sessionClaims: { metadata: { role: 'student' } } };
        } else if (token === 'student_B') {
          req.auth = { userId: 'student_B', sessionClaims: { metadata: { role: 'student' } } };
        } else if (token === 'student_C') {
          req.auth = { userId: 'student_C', sessionClaims: { metadata: { role: 'student' } } };
        } else {
          req.auth = { userId: token, sessionClaims: {} };
        }
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    getAuth: (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }) => {
      return req.auth || { userId: null };
    },
  };
});

import { app } from './index.js';
import { pool } from './db.js';
import { storageService } from './services/storage.service.js';

describe('Phase 2A Regression Suite: H-03 (Notice Conversion) & H-01 (Reviewer Authorization)', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM notice_suppressions');

    // Configure explicit reviewers/admins
    process.env.REVIEWER_USER_IDS = 'user_legit_reviewer';
    process.env.ADMIN_USER_IDS = 'user_legit_admin';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('H-03: Shared Institutional Notice -> Task Conversion Isolation', () => {
    it('Test 1 — Student A conversion on shared notice creates private assignment and leaves notices table unmutated', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, source_account_email
        ) VALUES (
          $1, 'user_legit_reviewer', 'Hackathon 2026 Registration', 'Institutional Hackathon', 'event', 'urgent', 'published', 'reviewer@vit.ac.in'
        )`,
        [noticeId],
      );

      // Student A converts notice
      const res = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_A')
        .send({ dueDate: '2026-10-20', title: 'Register for Hackathon' });

      expect(res.status).toBe(201);
      expect(res.body.alreadyConverted).toBe(false);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.source).toBe('notice');
      expect(res.body.task.sourceId).toBe(noticeId);
      expect(res.body.notice.isConverted).toBe(true);
      expect(res.body.notice.convertedToTaskId).toBe(res.body.task.id);

      // Verify exactly 1 assignment exists for student_A
      const { rows: studentATasks } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_A'",
      );
      expect(studentATasks).toHaveLength(1);
      expect(studentATasks[0].id).toBe(res.body.task.id);
      expect(studentATasks[0].source).toBe('notice');
      expect(studentATasks[0].source_id).toBe(noticeId);

      // Crucial H-03 Invariant: The shared notices row in PostgreSQL MUST NOT contain student_A's task UUID
      const { rows: noticeRows } = await pool.query(
        'SELECT is_converted, converted_to_task_id, converted_at FROM notices WHERE id = $1',
        [noticeId],
      );
      expect(noticeRows).toHaveLength(1);
      expect(noticeRows[0].is_converted).toBe(false);
      expect(noticeRows[0].converted_to_task_id).toBeNull();
      expect(noticeRows[0].converted_at).toBeNull();
    });

    it('Test 2 — Student B conversion creates separate assignment without mutating or overwriting Student A', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, source_account_email
        ) VALUES (
          $1, 'user_legit_reviewer', 'Campus Symposium 2026', 'All students welcome', 'event', 'important', 'published', 'reviewer@vit.ac.in'
        )`,
        [noticeId],
      );

      // Student A converts
      const resA = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_A')
        .send({ dueDate: '2026-11-01', title: 'Symposium Student A' });
      expect(resA.status).toBe(201);
      const taskAId = resA.body.task.id;

      // Student B converts the exact same shared notice
      const resB = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_B')
        .send({ dueDate: '2026-11-02', title: 'Symposium Student B' });
      expect(resB.status).toBe(201);
      const taskBId = resB.body.task.id;

      // Task IDs must be completely distinct
      expect(taskAId).not.toBe(taskBId);

      // Student A's assignment is unmodified
      const { rows: studentATasks } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_A'",
      );
      expect(studentATasks).toHaveLength(1);
      expect(studentATasks[0].id).toBe(taskAId);
      expect(studentATasks[0].title).toBe('Symposium Student A');

      // Student B's assignment exists independently
      const { rows: studentBTasks } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_B'",
      );
      expect(studentBTasks).toHaveLength(1);
      expect(studentBTasks[0].id).toBe(taskBId);
      expect(studentBTasks[0].title).toBe('Symposium Student B');

      // Shared notice row in notices table still has NO student task UUID
      const { rows: sharedNoticeRows } = await pool.query(
        'SELECT is_converted, converted_to_task_id FROM notices WHERE id = $1',
        [noticeId],
      );
      expect(sharedNoticeRows[0].is_converted).toBe(false);
      expect(sharedNoticeRows[0].converted_to_task_id).toBeNull();
    });

    it('Test 3 — Cross-user retrieval isolation: Student A sees converted, Student B and C see unconverted', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, source_account_email
        ) VALUES (
          $1, 'user_legit_reviewer', 'Midterm Schedule Announced', 'Check your slots', 'academic', 'urgent', 'published', 'reviewer@vit.ac.in'
        )`,
        [noticeId],
      );

      // Student A converts notice
      const convertRes = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_A')
        .send({ dueDate: '2026-10-10' });
      const taskAId = convertRes.body.task.id;

      // Student A views via GET /api/notices/:id
      const getSingleA = await request(app)
        .get(`/api/notices/${noticeId}`)
        .set('Authorization', 'Bearer student_A');
      expect(getSingleA.status).toBe(200);
      expect(getSingleA.body.isConverted).toBe(true);
      expect(getSingleA.body.convertedToTaskId).toBe(taskAId);

      // Student A views via GET /api/notices
      const getAllA = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_A');
      const noticeForA = getAllA.body.find((n: { id: string }) => n.id === noticeId);
      expect(noticeForA).toBeDefined();
      expect(noticeForA.isConverted).toBe(true);
      expect(noticeForA.convertedToTaskId).toBe(taskAId);

      // Student B (who did not convert) views via GET /api/notices/:id
      const getSingleB = await request(app)
        .get(`/api/notices/${noticeId}`)
        .set('Authorization', 'Bearer student_B');
      expect(getSingleB.status).toBe(200);
      expect(getSingleB.body.isConverted).toBe(false);
      expect(getSingleB.body.convertedToTaskId).toBeNull();

      // Student B views via GET /api/notices
      const getAllB = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_B');
      const noticeForB = getAllB.body.find((n: { id: string }) => n.id === noticeId);
      expect(noticeForB).toBeDefined();
      expect(noticeForB.isConverted).toBe(false);
      expect(noticeForB.convertedToTaskId).toBeNull();

      // Student C views: also unconverted, zero leakage
      const getSingleC = await request(app)
        .get(`/api/notices/${noticeId}`)
        .set('Authorization', 'Bearer student_C');
      expect(getSingleC.status).toBe(200);
      expect(getSingleC.body.isConverted).toBe(false);
      expect(getSingleC.body.convertedToTaskId).toBeNull();
    });

    it('Test 4 — Idempotency: Duplicate conversion returns alreadyConverted: true and existing assignment without creating duplicates', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, source_account_email
        ) VALUES (
          $1, 'user_legit_reviewer', 'Workshop on AI', 'Hands on session', 'event', 'normal', 'published', 'reviewer@vit.ac.in'
        )`,
        [noticeId],
      );

      // First conversion
      const res1 = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_A')
        .send({ dueDate: '2026-10-05' });
      expect(res1.status).toBe(201);
      expect(res1.body.alreadyConverted).toBe(false);
      const originalTaskId = res1.body.task.id;

      // Second conversion (idempotent attempt)
      const res2 = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_A')
        .send({ dueDate: '2026-10-05' });
      expect(res2.status).toBe(200);
      expect(res2.body.alreadyConverted).toBe(true);
      expect(res2.body.task.id).toBe(originalTaskId);
      expect(res2.body.notice.isConverted).toBe(true);
      expect(res2.body.notice.convertedToTaskId).toBe(originalTaskId);

      // Only 1 assignment exists in assignments table
      const { rows: tasks } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_A' AND source_id = $1",
        [noticeId],
      );
      expect(tasks).toHaveLength(1);
    });

    it('Test 5 — NULL source account: Private notice with source_account_email = NULL does NOT become institutional', async () => {
      const privateNoticeId = randomUUID();
      // Student A creates a private notice where source_account_email is NULL
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, source_account_email
        ) VALUES (
          $1, 'student_A', 'Student A Secret Plan', 'Personal study plan', 'academic', 'normal', 'published', NULL
        )`,
        [privateNoticeId],
      );

      // Student B requests all notices: MUST NOT see Student A's private notice despite source_account_email being NULL
      const listResB = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_B');
      expect(listResB.body.some((n: { id: string }) => n.id === privateNoticeId)).toBe(false);

      // Student B attempts direct fetch: MUST receive 404 (not found / inaccessible)
      const singleResB = await request(app)
        .get(`/api/notices/${privateNoticeId}`)
        .set('Authorization', 'Bearer student_B');
      expect(singleResB.status).toBe(404);

      // Student B attempts to convert it to task: MUST receive 403 Forbidden
      const convertResB = await request(app)
        .post(`/api/notices/${privateNoticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_B');
      expect(convertResB.status).toBe(403);

      // Student A (the owner) CAN view it
      const singleResA = await request(app)
        .get(`/api/notices/${privateNoticeId}`)
        .set('Authorization', 'Bearer student_A');
      expect(singleResA.status).toBe(200);

      // Student A CAN convert their own private notice
      const convertResA = await request(app)
        .post(`/api/notices/${privateNoticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_A');
      expect(convertResA.status).toBe(201);

      // Because Student A owns this private notice, notices table row is updated for this private notice
      const { rows: privateNoticeRows } = await pool.query(
        'SELECT is_converted, converted_to_task_id FROM notices WHERE id = $1',
        [privateNoticeId],
      );
      expect(privateNoticeRows[0].is_converted).toBe(true);
      expect(privateNoticeRows[0].converted_to_task_id).toBe(convertResA.body.task.id);
    });
  });

  describe('H-01: Production Reviewer Authorization Hardening', () => {
    it('Test 1 — Fake reviewer: In NODE_ENV=production, "reviewer_fake" is denied reviewer privileges and excluded from campus feed', async () => {
      process.env.NODE_ENV = 'production';

      // 1. Attempt to create notice via reviewer route POST /api/notices
      const postRes = await request(app)
        .post('/api/notices')
        .set('Authorization', 'Bearer reviewer_fake')
        .send({
          title: 'Fake Announcement',
          summary: 'Should be rejected',
          category: 'general',
          priority: 'normal',
          source: { provider: 'manual', messageId: 'm1', sender: 'attacker', subject: 'fake' },
        });
      expect(postRes.status).toBe(403);
      expect(postRes.body.error).toContain('Forbidden: Reviewer or Admin access required');

      // 2. Insert a notice with created_by_user_id = 'reviewer_fake' and status = 'published'
      const fakeNoticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status
        ) VALUES (
          $1, 'reviewer_fake', 'Malicious Injected Notice', 'Should not appear in campus feed', 'general', 'normal', 'published'
        )`,
        [fakeNoticeId],
      );

      // Student B fetches campus items via storageService and API
      const campusItems = await storageService.getAll('student_B');
      const hasFakeNotice = campusItems.some((item) => (item.title || '').includes('Malicious Injected Notice'));
      expect(hasFakeNotice).toBe(false);

      const campusItemsRes = await request(app)
        .get('/api/campus-items')
        .set('Authorization', 'Bearer student_B');
      expect(campusItemsRes.body.some((item: { title?: string }) => (item.title || '').includes('Malicious Injected Notice'))).toBe(false);

      // Student B fetches notices via API
      const noticesRes = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_B');
      const hasFakeInNotices = noticesRes.body.some((n: { id: string }) => n.id === fakeNoticeId);
      expect(hasFakeInNotices).toBe(false);
    });

    it('Test 2 — Legitimate reviewer: User in REVIEWER_USER_IDS retains full reviewer privileges', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REVIEWER_USER_IDS = 'user_legit_reviewer';

      const postRes = await request(app)
        .post('/api/notices')
        .set('Authorization', 'Bearer reviewer_legit')
        .send({
          title: 'Legitimate Reviewer Circular',
          summary: 'Official circular from reviewer',
          category: 'academic',
          priority: 'important',
          source: { provider: 'manual', messageId: 'legit_m1', sender: 'dean@vit.ac.in', subject: 'Circular' },
        });
      expect(postRes.status).toBe(201);
      expect(postRes.body.title).toBe('Legitimate Reviewer Circular');
      expect(postRes.body.status).toBe('pending');
    });

    it('Test 3 — Legitimate admin: User in ADMIN_USER_IDS retains full privileges in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_USER_IDS = 'user_legit_admin';

      const postRes = await request(app)
        .post('/api/notices')
        .set('Authorization', 'Bearer admin_legit')
        .send({
          title: 'Admin Campus Alert',
          summary: 'Official alert from admin',
          category: 'general',
          priority: 'urgent',
          source: { provider: 'manual', messageId: 'admin_m1', sender: 'admin@vit.ac.in', subject: 'Alert' },
        });
      expect(postRes.status).toBe(201);
      expect(postRes.body.title).toBe('Admin Campus Alert');
    });

    it('Test 4 — Ordinary student: Normal Clerk user ID cannot perform reviewer operations', async () => {
      process.env.NODE_ENV = 'production';

      const postRes = await request(app)
        .post('/api/notices')
        .set('Authorization', 'Bearer student_A')
        .send({
          title: 'Student Attempting Admin Post',
          summary: 'Unauthorized',
          category: 'general',
          priority: 'normal',
          source: { provider: 'manual', messageId: 's_m1', sender: 'student@vit.ac.in', subject: 'Attempt' },
        });
      expect(postRes.status).toBe(403);
      expect(postRes.body.error).toContain('Forbidden');
    });

    it('Test 5 — NULL source email security: source_account_email = NULL does NOT bypass reviewer authorization', async () => {
      process.env.NODE_ENV = 'production';

      // Insert a notice created by student_A with NULL source_account_email
      const studentNoticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, source_account_email
        ) VALUES (
          $1, 'student_A', 'Student Unverified Post', 'Should not become campus-wide', 'general', 'normal', 'published', NULL
        )`,
        [studentNoticeId],
      );

      // Another student fetching campus feed does NOT see it
      const campusFeed = await storageService.getAll('student_B');
      expect(campusFeed.some((item) => (item.title || '').includes('Student Unverified Post'))).toBe(false);

      // Another student querying notices API does NOT see it
      const noticesRes = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_B');
      expect(noticesRes.body.some((n: { id: string }) => n.id === studentNoticeId)).toBe(false);
    });
  });
});
