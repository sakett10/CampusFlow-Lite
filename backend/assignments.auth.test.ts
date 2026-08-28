import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock auth before importing app
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (req: Request & { auth?: { userId: string | null } }, _res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer user_A') {
        req.auth = { userId: 'user_A' };
      } else if (authHeader === 'Bearer user_B') {
        req.auth = { userId: 'user_B' };
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    requireAuth: () => (req: Request & { auth?: { userId: string | null } }, res: Response, next: NextFunction) => {
      if (!req.auth || !req.auth.userId) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
      next();
    },
    getAuth: (req: Request & { auth?: { userId: string | null } }) => ({ userId: req.auth?.userId || null })
  };
});

import app from './index.js';

describe('Assignments Cross-User Isolation', () => {
  let userACourseId: string;
  let userAAssignmentId: string;

  beforeEach(async () => {
    // We create a mock course for User A since assignments require a course_id
    // This assumes courses API works and isolates by user. Let's create it via HTTP to be sure.
    
    // Create course as user A
    const courseRes = await request(app)
      .post('/api/courses')
      .set('Authorization', 'Bearer user_A')
      .send({
        code: 'CS101',
        title: 'Intro',
        instructor: 'Dr. Smith',
        credits: 3
      });
    
    userACourseId = courseRes.body.id;

    // Create assignment as user A
    const assignRes = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer user_A')
      .send({
        courseId: userACourseId,
        title: 'User A Assignment',
        dueDate: '2026-10-10'
      });
      
    userAAssignmentId = assignRes.body.id;
  });

  afterEach(async () => {
    // Clean up
    if (userACourseId) {
      await request(app).delete(`/api/courses/${userACourseId}`).set('Authorization', 'Bearer user_A');
    }
  });

  it('User A can see their own assignment', async () => {
    const res = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer user_A');
    
    expect(res.status).toBe(200);
    const found = res.body.find((a: { id: string, title: string }) => a.id === userAAssignmentId);
    expect(found).toBeDefined();
    expect(found.title).toBe('User A Assignment');
  });

  it('User B cannot see User A assignment', async () => {
    const res = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer user_B');
    
    expect(res.status).toBe(200);
    const found = res.body.find((a: { id: string }) => a.id === userAAssignmentId);
    expect(found).toBeUndefined(); // Should not be in the list
  });

  it('User B cannot update User A assignment', async () => {
    const res = await request(app)
      .put(`/api/assignments/${userAAssignmentId}`)
      .set('Authorization', 'Bearer user_B')
      .send({
        title: 'Hacked Title'
      });
    
    // The service returns null if it doesn't match the user_id, which the route handles as 404 Not found
    expect(res.status).toBe(404);

    // Verify it wasn't actually updated
    const verifyRes = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer user_A');
    const found = verifyRes.body.find((a: { id: string, title: string }) => a.id === userAAssignmentId);
    expect(found.title).toBe('User A Assignment');
  });

  it('User B cannot update status of User A assignment', async () => {
    const res = await request(app)
      .patch(`/api/assignments/${userAAssignmentId}/status`)
      .set('Authorization', 'Bearer user_B')
      .send({
        status: 'COMPLETED'
      });
    
    expect(res.status).toBe(404);
  });

  it('User B cannot delete User A assignment', async () => {
    const res = await request(app)
      .delete(`/api/assignments/${userAAssignmentId}`)
      .set('Authorization', 'Bearer user_B');
    
    expect(res.status).toBe(404);

    // Verify it wasn't deleted
    const verifyRes = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer user_A');
    const found = verifyRes.body.find((a: { id: string }) => a.id === userAAssignmentId);
    expect(found).toBeDefined();
  });
});
