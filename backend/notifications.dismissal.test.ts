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
      if (authHeader === 'Bearer student_eva') {
        req.auth = { userId: 'student_eva' };
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

describe('Notification Dismissal Persistence & Deadlines', () => {
  beforeEach(async () => {
    const { pool } = await import('./db.js');
    await pool.query('DELETE FROM notification_dismissals');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM notices');
  });

  it('marks dynamic deadline reminder as read and keeps it read on subsequent polls', async () => {
    const { pool } = await import('./db.js');
    const noticeId = randomUUID();
    const todayStr = new Date().toISOString().split('T')[0];

    // Create a published notice with a deadline today
    await pool.query(
      `
      INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status, important_dates
      )
      VALUES ($1, 'admin_1', 'Hackathon Submission', 'Submit code', 'academic', 'urgent', 'published', $2)
      `,
      [
        noticeId,
        JSON.stringify([{ label: 'Final Code Submission', date: todayStr }]),
      ],
    );

    // 1. Initial fetch: should have 1 unread dynamic reminder
    const res1 = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer student_eva');

    expect(res1.status).toBe(200);
    expect(res1.body.unreadCount).toBe(1);
    const deadlineNotif = res1.body.notifications.find(
      (n: { type: string }) => n.type === 'deadline_reminder',
    );
    expect(deadlineNotif).toBeDefined();
    expect(deadlineNotif.isRead).toBe(false);

    // 2. Mark dynamic deadline notification as read
    const markRes = await request(app)
      .post(`/api/notifications/${deadlineNotif.id}/read`)
      .set('Authorization', 'Bearer student_eva');

    expect(markRes.status).toBe(200);

    // 3. Second fetch (subsequent 30s poll cycle): MUST STAY READ
    const res2 = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer student_eva');

    expect(res2.status).toBe(200);
    expect(res2.body.unreadCount).toBe(0);

    const refreshedDeadlineNotif = res2.body.notifications.find(
      (n: { id: string }) => n.id === deadlineNotif.id,
    );
    expect(refreshedDeadlineNotif).toBeDefined();
    expect(refreshedDeadlineNotif.isRead).toBe(true);
  });
});
