import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { notificationsService } from './services/notifications.service.js';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock auth before importing app
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer user_A') {
        req.auth = { userId: 'user_A', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer user_B') {
        req.auth = { userId: 'user_B', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer reviewer_1') {
        req.auth = { userId: 'reviewer_1', sessionClaims: { metadata: { role: 'reviewer' } } };
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
    getAuth: (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
    ) => ({
      userId: req.auth?.userId || null,
    }),
  };
});

import app from './index.js';

describe('Notifications Read State & Multi-Tenant Isolation', () => {
  beforeEach(async () => {
    // Clear notifications before each test
    const { pool } = await import('./db.js');
    await pool.query('DELETE FROM notifications');
  });

  it('marks broadcast notification as read for User A without affecting User B', async () => {
    // 1. Create a campus-wide broadcast notification (user_id is null)
    const broadcastNotif = await notificationsService.create({
      recipientRole: 'all',
      type: 'notice_published',
      title: 'Hackathon Announcement',
      message: 'Registration is open for HackCampus 2026',
    });

    // 2. User A and User B both view notifications: both should see isRead: false
    const resA1 = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_A');
    expect(resA1.status).toBe(200);
    expect(resA1.body.unreadCount).toBe(1);
    expect(resA1.body.notifications[0].isRead).toBe(false);

    const resB1 = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_B');
    expect(resB1.status).toBe(200);
    expect(resB1.body.unreadCount).toBe(1);
    expect(resB1.body.notifications[0].isRead).toBe(false);

    // 3. User A marks all notifications as read
    const markAllRes = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', 'Bearer user_A');
    expect(markAllRes.status).toBe(200);
    expect(markAllRes.body.success).toBe(true);

    // 4. User A checks again: unreadCount should be 0, isRead: true
    const resA2 = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_A');
    expect(resA2.status).toBe(200);
    expect(resA2.body.unreadCount).toBe(0);
    expect(resA2.body.notifications[0].isRead).toBe(true);

    // 5. User B checks again: User B must STILL see unreadCount 1, isRead: false
    const resB2 = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_B');
    expect(resB2.status).toBe(200);
    expect(resB2.body.unreadCount).toBe(1);
    expect(resB2.body.notifications[0].isRead).toBe(false);

    // 6. User B marks single notification as read
    const markSingleRes = await request(app)
      .post(`/api/notifications/${broadcastNotif.id}/read`)
      .set('Authorization', 'Bearer user_B');
    expect(markSingleRes.status).toBe(200);

    // 7. Now User B sees unreadCount 0, isRead: true
    const resB3 = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_B');
    expect(resB3.status).toBe(200);
    expect(resB3.body.unreadCount).toBe(0);
    expect(resB3.body.notifications[0].isRead).toBe(true);
  });

  it('correctly handles personal notification isolation', async () => {
    // 1. Create personal notification for User A
    const personalNotifA = await notificationsService.create({
      userId: 'user_A',
      recipientRole: 'student',
      type: 'system',
      title: 'Personal Alert A',
      message: 'Your profile has been updated',
    });

    // 2. User A sees it
    const resA = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_A');
    expect(resA.body.unreadCount).toBe(1);
    expect(resA.body.notifications[0].id).toBe(personalNotifA.id);

    // 3. User B does NOT see User A personal notification
    const resB = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_B');
    expect(resB.body.unreadCount).toBe(0);
    expect(resB.body.notifications).toHaveLength(0);
  });

  it('enforces student security: students cannot see pending_review notifications', async () => {
    // Reviewer notification
    await notificationsService.create({
      recipientRole: 'reviewer',
      type: 'pending_review',
      title: 'Pending Notice Review',
      message: 'A new circular requires approval',
    });

    // Student request
    const studentRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_A');
    expect(studentRes.body.notifications).toHaveLength(0);

    // Reviewer request
    const reviewerRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer reviewer_1');
    expect(reviewerRes.body.notifications).toHaveLength(1);
    expect(reviewerRes.body.notifications[0].type).toBe('pending_review');
  });
});
