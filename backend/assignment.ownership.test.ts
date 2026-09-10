import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock auth
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer student_alice') {
        req.auth = { userId: 'student_alice' };
      } else if (authHeader === 'Bearer student_bob') {
        req.auth = { userId: 'student_bob' };
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
    getAuth: (req: Request & { auth?: { userId: string | null } }) => ({
      userId: req.auth?.userId || null,
    }),
  };
});

import app from './index.js';
import { pool } from './db.js';
import { randomUUID } from 'node:crypto';

describe('Assignment Course Ownership Hardening', () => {
  let aliceCourseId: string;

  beforeEach(async () => {
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM courses');

    // 1. Create a course as Alice
    const courseRes = await request(app)
      .post('/api/courses')
      .set('Authorization', 'Bearer student_alice')
      .send({
        code: 'CS201',
        title: 'Data Structures',
        instructor: 'Prof. Turing',
        credits: 4,
      });

    aliceCourseId = courseRes.body.id;
  });

  it('allows Alice to create an assignment linked to her own course', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_alice')
      .send({
        courseId: aliceCourseId,
        title: 'Binary Tree Homework',
        dueDate: '2026-11-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.courseId).toBe(aliceCourseId);
    expect(res.body.title).toBe('Binary Tree Homework');
  });

  it('rejects Bob when trying to create an assignment linked to Alice courseId (cross-user hijacking)', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        courseId: aliceCourseId,
        title: 'Malicious Assignment Injection',
        dueDate: '2026-11-01',
      });

    // Must be rejected with 404
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Course not found or access denied');
  });

  it('rejects creating an assignment with a non-existent courseId', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_alice')
      .send({
        courseId: '00000000-0000-0000-0000-000000000000',
        title: 'Ghost Course Assignment',
        dueDate: '2026-11-01',
      });

    expect(res.status).toBe(404);
  });

  // 1. Creating a task from a nonexistent notice → 403 / rejected
  it('1. rejects creating a task from a nonexistent notice (403)', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'Task from Ghost Notice',
        source: 'notice',
        sourceId: '00000000-0000-0000-0000-000000000000',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Notice not found or access denied');
  });

  // 2. Creating a task from an inaccessible notice → 403
  it('2. rejects creating a task from an inaccessible notice (403)', async () => {
    const noticeId = randomUUID();
    // Alice creates a private draft notice
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status, source_account_email
      ) VALUES ($1, 'student_alice', 'Alice Private Research Note', 'Private summary', 'academic', 'normal', 'pending', 'alice@vitstudent.ac.in')`,
      [noticeId],
    );

    // Bob tries to create a task referencing Alice's private pending notice
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'Unauthorized Task Injection',
        source: 'notice',
        sourceId: noticeId,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Notice not found or access denied');
  });

  // 3. Creating a task from a valid shared notice → succeeds
  it('3. allows creating a task from a valid shared notice', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status
      ) VALUES ($1, 'reviewer_1', 'Official Annual Sports Meet', 'Registration open', 'event', 'normal', 'published')`,
      [noticeId],
    );

    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'Sports Meet Volunteer',
        source: 'notice',
        sourceId: noticeId,
        dueDate: '2026-11-20',
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Sports Meet Volunteer');
    expect(res.body.source).toBe('notice');
    expect(res.body.sourceId).toBe(noticeId);
  });

  // 4. Updating a Gmail task to another user's sourceId → 403
  it('4. rejects updating a Gmail task to another user sourceId (403)', async () => {
    // Alice has an email
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, sender_email, subject,
        body_text, snippet, analysis_status
      ) VALUES ($1, 'student_alice', 'alice@vitstudent.ac.in', 'msg_alice_priv', 'prof@vit.ac.in', 'Alice Grade', 'body', 'snip', 'completed')`,
      [randomUUID()],
    );

    // Bob has an email
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, sender_email, subject,
        body_text, snippet, analysis_status
      ) VALUES ($1, 'student_bob', 'bob@vitstudent.ac.in', 'msg_bob_valid', 'prof@vit.ac.in', 'Bob Homework', 'body', 'snip', 'completed')`,
      [randomUUID()],
    );

    // Bob creates his own task
    const createRes = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'Bob Homework Task',
        source: 'gmail',
        sourceId: 'msg_bob_valid',
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    // Bob tries to update task's sourceId to Alice's message ID
    const updateRes = await request(app)
      .put(`/api/assignments/${taskId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        sourceId: 'msg_alice_priv',
      });

    expect(updateRes.status).toBe(403);
    expect(updateRes.body.error).toContain('Source email not found or access denied');

    // Reload/fetch assignment afterward to ensure source and sourceId are unchanged
    const { rows: reloadedRows } = await pool.query(
      'SELECT source, source_id FROM assignments WHERE id = $1',
      [taskId],
    );
    expect(reloadedRows[0].source).toBe('gmail');
    expect(reloadedRows[0].source_id).toBe('msg_bob_valid');

    const getRes = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer student_bob');
    const reloadedTask = getRes.body.find((a: { id: string }) => a.id === taskId);
    expect(reloadedTask.source).toBe('gmail');
    expect(reloadedTask.sourceId).toBe('msg_bob_valid');
  });

  // 5. Updating only sourceId on an existing Gmail task → ownership checked
  it('5. validates ownership when updating only sourceId on existing Gmail task', async () => {
    // Bob has two valid emails
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, sender_email, subject,
        body_text, snippet, analysis_status
      ) VALUES
      ($1, 'student_bob', 'bob@vitstudent.ac.in', 'msg_bob_a', 'prof@vit.ac.in', 'Topic A', 'body', 'snip', 'completed'),
      ($2, 'student_bob', 'bob@vitstudent.ac.in', 'msg_bob_b', 'prof@vit.ac.in', 'Topic B', 'body', 'snip', 'completed')`,
      [randomUUID(), randomUUID()],
    );

    // Create task referencing msg_bob_a
    const createRes = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'Bob Task',
        source: 'gmail',
        sourceId: 'msg_bob_a',
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    // Update only sourceId to msg_bob_b (Bob owns it -> succeeds)
    const validUpdateRes = await request(app)
      .put(`/api/assignments/${taskId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        sourceId: 'msg_bob_b',
      });
    expect(validUpdateRes.status).toBe(200);
    expect(validUpdateRes.body.sourceId).toBe('msg_bob_b');

    // Update only sourceId to nonexistent message -> rejected with 403
    const invalidUpdateRes = await request(app)
      .put(`/api/assignments/${taskId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        sourceId: 'msg_nonexistent_xyz',
      });
    expect(invalidUpdateRes.status).toBe(403);
    expect(invalidUpdateRes.body.error).toContain('Source email not found or access denied');

    // Reload/fetch assignment afterward to ensure source and sourceId are unchanged
    const { rows: reloadedRows } = await pool.query(
      'SELECT source, source_id FROM assignments WHERE id = $1',
      [taskId],
    );
    expect(reloadedRows[0].source).toBe('gmail');
    expect(reloadedRows[0].source_id).toBe('msg_bob_b');

    const getRes = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer student_bob');
    const reloadedTask = getRes.body.find((a: { id: string }) => a.id === taskId);
    expect(reloadedTask.source).toBe('gmail');
    expect(reloadedTask.sourceId).toBe('msg_bob_b');
  });

  // 6. Updating only sourceId on an existing notice task → notice access checked
  it('6. validates notice access when updating only sourceId on existing notice task', async () => {
    const pubNotice1 = randomUUID();
    const pubNotice2 = randomUUID();
    const privNoticeAlice = randomUUID();

    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
       VALUES
       ($1, 'reviewer_1', 'Notice 1', 'Summary 1', 'academic', 'normal', 'published'),
       ($2, 'reviewer_1', 'Notice 2', 'Summary 2', 'academic', 'normal', 'published')`,
      [pubNotice1, pubNotice2],
    );

    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_account_email)
       VALUES ($1, 'student_alice', 'Private Notice', 'Private', 'academic', 'normal', 'pending', 'alice@vitstudent.ac.in')`,
      [privNoticeAlice],
    );

    // Create task referencing pubNotice1
    const createRes = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'Bob Notice Task',
        source: 'notice',
        sourceId: pubNotice1,
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    // Update only sourceId to pubNotice2 (valid shared notice -> succeeds)
    const validUpdateRes = await request(app)
      .put(`/api/assignments/${taskId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        sourceId: pubNotice2,
      });
    expect(validUpdateRes.status).toBe(200);
    expect(validUpdateRes.body.sourceId).toBe(pubNotice2);

    // Update only sourceId to Alice's private notice -> rejected with 403
    const privUpdateRes = await request(app)
      .put(`/api/assignments/${taskId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        sourceId: privNoticeAlice,
      });
    expect(privUpdateRes.status).toBe(403);
    expect(privUpdateRes.body.error).toContain('Notice not found or access denied');

    // Reload/fetch assignment afterward to ensure source and sourceId are unchanged
    const { rows: reloadedRows } = await pool.query(
      'SELECT source, source_id FROM assignments WHERE id = $1',
      [taskId],
    );
    expect(reloadedRows[0].source).toBe('notice');
    expect(reloadedRows[0].source_id).toBe(pubNotice2);

    const getRes = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer student_bob');
    const reloadedTask = getRes.body.find((a: { id: string }) => a.id === taskId);
    expect(reloadedTask.source).toBe('notice');
    expect(reloadedTask.sourceId).toBe(pubNotice2);
  });

  // 7. Updating an unrelated field without changing source/sourceId → succeeds
  it('7. allows updating an unrelated field without changing source/sourceId', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
       VALUES ($1, 'reviewer_1', 'Campus Hackathon', 'Hackathon details', 'event', 'normal', 'published')`,
      [noticeId],
    );

    const createRes = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'Original Title',
        source: 'notice',
        sourceId: noticeId,
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    // Update title and priority only
    const updateRes = await request(app)
      .put(`/api/assignments/${taskId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'Updated Title Only',
        priority: 'urgent',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Updated Title Only');
    expect(updateRes.body.priority).toBe('urgent');
    expect(updateRes.body.source).toBe('notice');
    expect(updateRes.body.sourceId).toBe(noticeId);
  });
});
