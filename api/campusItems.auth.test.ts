import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

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

describe('Campus Items Cross-User Isolation', () => {
  let userAItemId: string;

  it('Unauthenticated POST returns 401', async () => {
    const res = await request(app)
      .post('/api/campus-items')
      .send({
        title: 'Unauthorized Event',
        type: 'EVENT',
        date: '2026-09-01'
      });
    
    expect(res.status).toBe(401);
  });

  it('User A creates an item', async () => {
    const res = await request(app)
      .post('/api/campus-items')
      .set('Authorization', 'Bearer user_A')
      .send({
        title: 'User A Event',
        type: 'EVENT',
        date: '2026-10-10'
      });
      
    expect(res.status).toBe(201);
    userAItemId = res.body.id;
    expect(userAItemId).toBeDefined();
  });

  it('Public GET continues to work and shows item', async () => {
    const res = await request(app).get('/api/campus-items');
    
    expect(res.status).toBe(200);
    const found = res.body.find((a: { id: string, title: string }) => a.id === userAItemId);
    expect(found).toBeDefined();
    expect(found.title).toBe('User A Event');
  });

  it('User B cannot delete User A item', async () => {
    const res = await request(app)
      .delete(`/api/campus-items/${userAItemId}`)
      .set('Authorization', 'Bearer user_B');
    
    expect(res.status).toBe(404);

    // Verify it wasn't deleted
    const verifyRes = await request(app).get('/api/campus-items');
    const found = verifyRes.body.find((a: { id: string }) => a.id === userAItemId);
    expect(found).toBeDefined();
  });

  it('Unauthenticated DELETE returns 401', async () => {
    const res = await request(app)
      .delete(`/api/campus-items/${userAItemId}`);
    
    expect(res.status).toBe(401);
  });

  it('User A can delete their own item', async () => {
    const res = await request(app)
      .delete(`/api/campus-items/${userAItemId}`)
      .set('Authorization', 'Bearer user_A');
    
    expect(res.status).toBe(204);

    // Verify it was deleted
    const verifyRes = await request(app).get('/api/campus-items');
    const found = verifyRes.body.find((a: { id: string }) => a.id === userAItemId);
    expect(found).toBeUndefined();
  });
});
