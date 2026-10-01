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

describe('SEC-03: Assignment Update Course Ownership BOLA / IDOR Verification', () => {
  let aliceCourseId: string;
  let bobCourseId: string;
  let bobAssignmentId: string;

  beforeEach(async () => {
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM courses');

    // 1. Create a course owned by Alice
    const aliceCourseRes = await request(app)
      .post('/api/courses')
      .set('Authorization', 'Bearer student_alice')
      .send({
        code: 'CS101',
        title: 'Introduction to Computer Science',
        instructor: 'Dr. Turing',
        credits: 3,
      });
    aliceCourseId = aliceCourseRes.body.id;

    // 2. Create a course owned by Bob
    const bobCourseRes = await request(app)
      .post('/api/courses')
      .set('Authorization', 'Bearer student_bob')
      .send({
        code: 'CS102',
        title: 'Data Structures and Algorithms',
        instructor: 'Dr. Knuth',
        credits: 4,
      });
    bobCourseId = bobCourseRes.body.id;

    // 3. Create an assignment owned by Bob initially linked to Bob's course
    const bobAssignRes = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_bob')
      .send({
        courseId: bobCourseId,
        title: 'Original Bob Assignment Title',
        description: 'Original Bob Description',
        dueDate: '2026-11-15',
        priority: 'medium',
      });
    bobAssignmentId = bobAssignRes.body.id;
  });

  it('rejects Bob updating assignment to Alice courseId (cross-user hijacking) with 404 and preserves courseId', async () => {
    const res = await request(app)
      .put(`/api/assignments/${bobAssignmentId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        courseId: aliceCourseId,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Course not found or access denied');

    // Verify in database that Bob's assignment course_id was not modified
    const { rows } = await pool.query('SELECT course_id, title FROM assignments WHERE id = $1', [bobAssignmentId]);
    expect(rows[0].course_id).toBe(bobCourseId);
    expect(rows[0].title).toBe('Original Bob Assignment Title');
  });

  it('rejects Bob updating assignment to a non-existent courseId with identical 404 error (no leak of existence)', async () => {
    const nonexistentCourseId = randomUUID();
    const res = await request(app)
      .put(`/api/assignments/${bobAssignmentId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        courseId: nonexistentCourseId,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Course not found or access denied');

    // Verify in database that Bob's assignment course_id remains untouched
    const { rows } = await pool.query('SELECT course_id FROM assignments WHERE id = $1', [bobAssignmentId]);
    expect(rows[0].course_id).toBe(bobCourseId);
  });

  it('ensures atomic rollback: malicious update with foreign courseId and title does NOT modify title or courseId', async () => {
    const res = await request(app)
      .put(`/api/assignments/${bobAssignmentId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'MALICIOUS_HIJACKED_TITLE',
        description: 'MALICIOUS_DESCRIPTION',
        courseId: aliceCourseId,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Course not found or access denied');

    // Verify full atomic rollback: title, description, and course_id MUST remain unmodified
    const { rows } = await pool.query('SELECT title, description, course_id FROM assignments WHERE id = $1', [bobAssignmentId]);
    expect(rows[0].title).toBe('Original Bob Assignment Title');
    expect(rows[0].description).toBe('Original Bob Description');
    expect(rows[0].course_id).toBe(bobCourseId);
  });

  it('allows Bob to update assignment to Bob own courseId or another course owned by Bob', async () => {
    // Create another course owned by Bob
    const bobCourse2Res = await request(app)
      .post('/api/courses')
      .set('Authorization', 'Bearer student_bob')
      .send({
        code: 'CS103',
        title: 'Database Systems',
        instructor: 'Dr. Codd',
        credits: 3,
      });
    const bobCourse2Id = bobCourse2Res.body.id;

    const res = await request(app)
      .put(`/api/assignments/${bobAssignmentId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        courseId: bobCourse2Id,
        title: 'Updated Database Homework',
      });

    expect(res.status).toBe(200);
    expect(res.body.courseId).toBe(bobCourse2Id);
    expect(res.body.title).toBe('Updated Database Homework');

    // Verify in database
    const { rows } = await pool.query('SELECT course_id, title FROM assignments WHERE id = $1', [bobAssignmentId]);
    expect(rows[0].course_id).toBe(bobCourse2Id);
    expect(rows[0].title).toBe('Updated Database Homework');
  });

  it('allows Bob to unlink courseId by passing courseId: null', async () => {
    const res = await request(app)
      .put(`/api/assignments/${bobAssignmentId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        courseId: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.courseId).toBeNull();

    // Verify in database
    const { rows } = await pool.query('SELECT course_id FROM assignments WHERE id = $1', [bobAssignmentId]);
    expect(rows[0].course_id).toBeNull();
  });

  it('preserves existing courseId when courseId is not included in update payload', async () => {
    const res = await request(app)
      .put(`/api/assignments/${bobAssignmentId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        title: 'New Title Only',
        priority: 'urgent',
      });

    expect(res.status).toBe(200);
    expect(res.body.courseId).toBe(bobCourseId);
    expect(res.body.title).toBe('New Title Only');
    expect(res.body.priority).toBe('urgent');

    // Verify in database
    const { rows } = await pool.query('SELECT course_id, title, priority FROM assignments WHERE id = $1', [bobAssignmentId]);
    expect(rows[0].course_id).toBe(bobCourseId);
    expect(rows[0].title).toBe('New Title Only');
    expect(rows[0].priority).toBe('urgent');
  });

  it('returns 404 Not Found when assignment itself does not exist', async () => {
    const nonExistentAssignmentId = randomUUID();
    const res = await request(app)
      .put(`/api/assignments/${nonExistentAssignmentId}`)
      .set('Authorization', 'Bearer student_bob')
      .send({
        courseId: bobCourseId,
        title: 'Ghost Assignment',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
