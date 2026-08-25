import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

// We must mock @clerk/express BEFORE importing app, so we hoist it.
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (req: Request & { auth?: { userId: string | null } }, _res: Response, next: NextFunction) => {
      // Mock attaching auth context
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer valid_token') {
        req.auth = { userId: 'user_123' };
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

describe('Authentication Middleware', () => {
  it('rejects unauthenticated requests to protected route (Courses)', async () => {
    const res = await request(app).get('/api/courses');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthenticated');
  });

  it('allows authenticated requests to protected route (Courses)', async () => {
    const res = await request(app)
      .get('/api/courses')
      .set('Authorization', 'Bearer valid_token');
    
    // We expect 200 because the route is reached and returns an empty array or existing courses
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects unauthenticated requests to protected mutation (Campus Items POST)', async () => {
    const res = await request(app)
      .post('/api/campus-items')
      .send({ title: 'Test' });
    
    expect(res.status).toBe(401);
  });

  it('allows public access to Campus Items GET', async () => {
    const res = await request(app).get('/api/campus-items');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
