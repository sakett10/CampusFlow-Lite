import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock googleapis
const mockList = vi.fn();
const mockGet = vi.fn();
vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
    generateAuthUrl = vi.fn().mockReturnValue('https://mock-auth-url');
    revokeToken = vi.fn().mockResolvedValue({});
    getToken = vi.fn().mockResolvedValue({
      tokens: {
        access_token: 'mock_access',
        refresh_token: 'mock_refresh',
        expiry_date: 1234567890,
      },
    });
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      gmail: vi.fn().mockImplementation(() => ({
        users: {
          getProfile: vi.fn().mockResolvedValue({
            data: { emailAddress: 'user@vitstudent.ac.in' },
          }),
          messages: {
            list: mockList,
            get: mockGet,
          },
        },
      })),
    },
  };
});

// Mock auth middleware for User A, User B, Reviewer, and Admin
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
      } else if (authHeader === 'Bearer user_C') {
        req.auth = { userId: 'user_C', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer reviewer_user') {
        req.auth = { userId: 'reviewer_user', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer admin_user') {
        req.auth = { userId: 'admin_user', sessionClaims: { metadata: { role: 'admin' } } };
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
      sessionClaims: req.auth?.sessionClaims,
    }),
  };
});

import app from './index.js';
import { pool } from './db.js';
import { setNoticeAnalyzer, resetNoticeAnalyzer } from './services/noticeAnalyzer.service.js';

describe('Multi-Tenant User A vs User B Strict Isolation Integration Tests', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.REVIEWER_USER_IDS = 'reviewer_user,user_A'; // User A is in reviewer list to test that their personal Gmail notices are NOT leaked!
    process.env.ADMIN_USER_IDS = 'admin_user';

    mockList.mockReset();
    mockGet.mockReset();
    resetNoticeAnalyzer();

    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM notice_suppressions');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM campus_items');
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM notification_dismissals');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('1. User B without Gmail sync returns 404 and touches no other user data', async () => {
    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer user_B');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Gmail account is not connected|No active Gmail connection/i);
  });

  it('2. User A personal Gmail notice is strictly invisible and inaccessible to User B and reviewers', async () => {
    // 1. Connect User A's Gmail
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'user_A', 'usera@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000)
      `,
      [randomUUID()],
    );

    // 2. Mock Gmail message for User A
    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: 'msg_a_personal_1', threadId: 'thread_a_1' }],
      },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_a_personal_1',
        threadId: 'thread_a_1',
        snippet: 'Important Academic Notice for User A',
        payload: {
          headers: [
            { name: 'From', value: 'professor@vit.ac.in' },
            { name: 'To', value: 'usera@vitstudent.ac.in' },
            { name: 'Subject', value: 'Exam Reschedule Announcement' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: {
                data: Buffer.from('Midterm exam is rescheduled to 2026-10-20 in Anna Audi.').toString('base64url'),
              },
            },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Exam Reschedule Announcement',
        summary: 'Midterm exam is rescheduled to 2026-10-20',
        category: 'exam',
        priority: 'urgent',
        importantDates: [{ label: 'Exam Date', date: '2026-10-20' }],
        venue: 'Anna Audi',
        source: {
          provider: 'gmail',
          messageId: 'msg_a_personal_1',
          sender: 'professor@vit.ac.in',
          subject: 'Exam Reschedule Announcement',
        },
      }),
    });

    // 3. User A syncs Gmail
    const syncResA = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer user_A');

    expect(syncResA.status).toBe(200);
    expect(syncResA.body.noticesCreated).toBe(1);

    // Verify in DB that notice was created with source_type = 'gmail_personal'
    const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', ['user_A']);
    expect(noticeRows).toHaveLength(1);
    const noticeA = noticeRows[0];
    expect(noticeA.source_type).toBe('gmail_personal');
    expect(noticeA.created_by_user_id).toBe('user_A');
    expect(noticeA.source_message_id).toBe('msg_a_personal_1');

    // 4. User A fetches notices -> sees their notice
    const resListA = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer user_A');
    expect(resListA.status).toBe(200);
    expect(resListA.body).toHaveLength(1);
    expect(resListA.body[0].id).toBe(noticeA.id);
    expect(resListA.body[0].sourceType).toBe('gmail_personal');

    // 5. User B fetches notices -> MUST BE EMPTY (NO LEAK!)
    const resListB = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer user_B');
    expect(resListB.status).toBe(200);
    expect(resListB.body).toHaveLength(0);

    // 6. User B requests notice by ID -> MUST BE 404
    const resGetB = await request(app)
      .get(`/api/notices/${noticeA.id}`)
      .set('Authorization', 'Bearer user_B');
    expect(resGetB.status).toBe(404);

    // 7. User B attempts to convert User A's notice to task -> MUST BE 403 Forbidden!
    const resConvertB = await request(app)
      .post(`/api/notices/${noticeA.id}/convert-to-task`)
      .set('Authorization', 'Bearer user_B')
      .send({});
    expect(resConvertB.status).toBe(403);

    // 8. Reviewer user fetches notices -> MUST NOT see User A's personal Gmail notice!
    const resListReviewer = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer reviewer_user');
    expect(resListReviewer.status).toBe(200);
    expect(resListReviewer.body).toHaveLength(0);

    // 9. Reviewer user attempts to access User A's personal notice by ID -> 404
    const resGetReviewer = await request(app)
      .get(`/api/notices/${noticeA.id}`)
      .set('Authorization', 'Bearer reviewer_user');
    expect(resGetReviewer.status).toBe(404);

    // 10. Campus feed for User B -> MUST NOT contain notice A
    const resFeedB = await request(app)
      .get('/api/campus-items')
      .set('Authorization', 'Bearer user_B');
    expect(resFeedB.status).toBe(200);
    const feedItemA = resFeedB.body.find((item: { id: string }) => item.id === noticeA.id);
    expect(feedItemA).toBeUndefined();

    // 11. Notifications for User B -> MUST NOT contain deadline reminders for notice A
    const resNotifB = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user_B');
    expect(resNotifB.status).toBe(200);
    const notifA = resNotifB.body.notifications.find((n: { noticeId?: string }) => n.noticeId === noticeA.id);
    expect(notifA).toBeUndefined();
  });

  it('3. User B connects and syncs their own Gmail -> User A and User B see ONLY their respective notices', async () => {
    // 1. Setup User A connection and notice
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'user_A', 'usera@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000)
      `,
      [randomUUID()],
    );

    await pool.query(
      `
      INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_provider, source_account_email, source_message_id, source_type
      ) VALUES (
        $1, 'user_A', 'User A Exclusive Notice', 'Notice A summary', 'academic', 'normal', 'published',
        'gmail', 'usera@vitstudent.ac.in', 'msg_user_a_private', 'gmail_personal'
      )
      `,
      [randomUUID()],
    );

    // 2. Setup User B connection and notice
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'user_B', 'userb@vitstudent.ac.in', 'tok_b', 'ref_b', 1700000000)
      `,
      [randomUUID()],
    );

    await pool.query(
      `
      INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_provider, source_account_email, source_message_id, source_type
      ) VALUES (
        $1, 'user_B', 'User B Exclusive Notice', 'Notice B summary', 'academic', 'normal', 'published',
        'gmail', 'userb@vitstudent.ac.in', 'msg_user_b_private', 'gmail_personal'
      )
      `,
      [randomUUID()],
    );

    // 3. User A queries notices
    const resA = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer user_A');
    expect(resA.status).toBe(200);
    expect(resA.body).toHaveLength(1);
    expect(resA.body[0].title).toBe('User A Exclusive Notice');

    // 4. User B queries notices
    const resB = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer user_B');
    expect(resB.status).toBe(200);
    expect(resB.body).toHaveLength(1);
    expect(resB.body[0].title).toBe('User B Exclusive Notice');
  });

  it('4. Institutional notices created by reviewers are visible to all users, while personal notices remain isolated', async () => {
    // 1. Institutional notice
    const institutionalId = randomUUID();
    await pool.query(
      `
      INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_provider, source_type
      ) VALUES (
        $1, 'reviewer_user', 'Campus-Wide Institutional Circular', 'Holiday on Friday', 'announcement', 'normal', 'published',
        'manual', 'institutional'
      )
      `,
      [institutionalId],
    );

    // 2. User A's personal notice
    const userAPersonalId = randomUUID();
    await pool.query(
      `
      INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_provider, source_account_email, source_message_id, source_type
      ) VALUES (
        $1, 'user_A', 'Personal Grade Sheet', 'Grades for User A', 'academic', 'urgent', 'published',
        'gmail', 'usera@vitstudent.ac.in', 'msg_grade_1', 'gmail_personal'
      )
      `,
      [userAPersonalId],
    );

    // User A sees institutional notice + their personal notice (total: 2)
    const resA = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer user_A');
    expect(resA.status).toBe(200);
    expect(resA.body).toHaveLength(2);
    expect(resA.body.map((n: { id: string }) => n.id)).toContain(institutionalId);
    expect(resA.body.map((n: { id: string }) => n.id)).toContain(userAPersonalId);

    // User B sees ONLY institutional notice (total: 1), NEVER User A's personal notice!
    const resB = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer user_B');
    expect(resB.status).toBe(200);
    expect(resB.body).toHaveLength(1);
    expect(resB.body[0].id).toBe(institutionalId);

    // Another student User C also sees ONLY institutional notice, NEVER User A's personal notice
    const resC = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer user_C');
    expect(resC.status).toBe(200);
    expect(resC.body).toHaveLength(1);
    expect(resC.body[0].id).toBe(institutionalId);
  });
});
