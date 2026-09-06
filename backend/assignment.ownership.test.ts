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

describe('Assignment Course Ownership Hardening', () => {
  let aliceCourseId: string;

  beforeEach(async () => {
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
});
