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

// Mock auth before importing app
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer student_A') {
        req.auth = { userId: 'student_A', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer student_B') {
        req.auth = { userId: 'student_B', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer reviewer_1') {
        req.auth = { userId: 'reviewer_1', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer allowlist_admin') {
        // Simulates production Clerk user with NO role in session claims, but in ADMIN_USER_IDS
        req.auth = { userId: 'allowlist_admin_user', sessionClaims: {} };
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

describe('Gmail Multi-Tenant Security & Role-Scoped Notice Ingestion', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.REVIEWER_USER_IDS = 'reviewer_1,reviewer_2';
    process.env.ADMIN_USER_IDS = 'allowlist_admin_user';

    mockList.mockReset();
    mockGet.mockReset();
    resetNoticeAnalyzer();

    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM notice_suppressions');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM campus_items');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('A. Student Gmail sync persists to campus_emails but MUST NOT create a global notice', async () => {
    // Connect Student A
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000)
      `,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: 'msg_hackathon_1', threadId: 'thread_1' }],
      },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_hackathon_1',
        threadId: 'thread_1',
        snippet: 'Hackathon Registration Open for all students',
        payload: {
          headers: [
            { name: 'From', value: 'cs_dept@vit.ac.in' },
            { name: 'To', value: 'studentA@vitstudent.ac.in' },
            { name: 'Subject', value: 'Hackathon 2026 Registration' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: {
                data: Buffer.from('Join the annual hackathon on 2026-10-15 in Anna Audi.').toString('base64url'),
              },
            },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Hackathon 2026 Registration',
        summary: 'Annual campus hackathon',
        category: 'event',
        priority: 'urgent',
        importantDates: [{ label: 'Event Date', date: '2026-10-15' }],
        venue: 'Anna Audi',
        source: {
          provider: 'gmail',
          messageId: 'msg_hackathon_1',
          sender: 'cs_dept@vit.ac.in',
          subject: 'Hackathon 2026 Registration',
        },
      }),
    });

    // Student A triggers sync
    const syncRes = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_A');

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.emailsPersisted).toBe(1);
    expect(syncRes.body.noticesCreated).toBe(0); // Zero global notices created!

    // Email is persisted in campus_emails for Student A
    const { rows: emailRows } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', ['student_A']);
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0].source_message_id).toBe('msg_hackathon_1');

    // Global notices table remains EMPTY
    const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
    expect(noticeRows).toHaveLength(0);
  });

  it("B. Student A Gmail-derived data cannot appear in Student B's campus feed", async () => {
    // 1. Student A syncs Gmail
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000)
      `,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: 'msg_ai_club_1', threadId: 'thread_1' }],
      },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_ai_club_1',
        threadId: 'thread_1',
        snippet: 'AI Club Workshop Announcement',
        payload: {
          headers: [
            { name: 'From', value: 'aiclub@vit.ac.in' },
            { name: 'To', value: 'studentA@vitstudent.ac.in' },
            { name: 'Subject', value: 'AI Workshop' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('AI Workshop details').toString('base64url'),
          },
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'AI Workshop',
        summary: 'AI workshop on 2026-09-20',
        category: 'event',
        priority: 'normal',
        importantDates: [{ label: 'Event Date', date: '2026-09-20' }],
        source: {
          provider: 'gmail',
          messageId: 'msg_ai_club_1',
          sender: 'aiclub@vit.ac.in',
          subject: 'AI Workshop',
        },
      }),
    });

    await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_A');

    // 2. Student B loads Campus Feed
    const feedRes = await request(app)
      .get('/api/campus-items')
      .set('Authorization', 'Bearer student_B');

    expect(feedRes.status).toBe(200);
    expect(feedRes.body).toHaveLength(0); // Zero items from Student A!
  });

  it('C. Authorized reviewer Gmail sync DOES create an institutional notice published to campus feed', async () => {
    // Connect Reviewer 1
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'reviewer_1', 'notices@vit.ac.in', 'tok_rev', 'ref_rev', 1700000000)
      `,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: 'msg_official_circular_1', threadId: 'thread_rev_1' }],
      },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_official_circular_1',
        threadId: 'thread_rev_1',
        snippet: 'Official Holiday Announcement for Gandhi Jayanti',
        payload: {
          headers: [
            { name: 'From', value: 'registrar@vit.ac.in' },
            { name: 'To', value: 'all@vit.ac.in' },
            { name: 'Subject', value: 'Circular: Gandhi Jayanti Holiday' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('Holiday on 2026-10-02').toString('base64url'),
          },
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Circular: Gandhi Jayanti Holiday',
        summary: 'University will remain closed on 2026-10-02',
        category: 'administrative',
        priority: 'normal',
        importantDates: [{ label: 'Holiday Date', date: '2026-10-02' }],
        source: {
          provider: 'gmail',
          messageId: 'msg_official_circular_1',
          sender: 'registrar@vit.ac.in',
          subject: 'Circular: Gandhi Jayanti Holiday',
        },
      }),
    });

    // Reviewer 1 triggers sync
    const syncRes = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_1');

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.noticesCreated).toBe(1);

    // Global notice is created with status published
    const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0].title).toBe('Circular: Gandhi Jayanti Holiday');
    expect(noticeRows[0].status).toBe('published');

    // Both Student A and Student B see the official institutional notice
    const studentResA = await request(app).get('/api/campus-items').set('Authorization', 'Bearer student_A');
    expect(studentResA.body).toHaveLength(1);
    expect(studentResA.body[0].title).toBe('Circular: Gandhi Jayanti Holiday');

    const studentResB = await request(app).get('/api/campus-items').set('Authorization', 'Bearer student_B');
    expect(studentResB.body).toHaveLength(1);
    expect(studentResB.body[0].title).toBe('Circular: Gandhi Jayanti Holiday');
  });

  it('D & E. Student cannot DELETE a notice (403), but authorized reviewer CAN delete a notice (204)', async () => {
    // 1. Create a published notice in DB
    const noticeId = randomUUID();
    await pool.query(
      `
      INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, published_at)
      VALUES ($1, 'reviewer_1', 'Exam Schedule Published', 'Semester exam schedule', 'exam', 'urgent', 'published', NOW())
      `,
      [noticeId],
    );

    // 2. Student attempts DELETE -> 403 Forbidden
    const studentDeleteRes = await request(app)
      .delete(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer student_A');

    expect(studentDeleteRes.status).toBe(403);
    expect(studentDeleteRes.body.error).toContain('Forbidden');

    // Notice still exists in DB
    const { rows: checkRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [noticeId]);
    expect(checkRows).toHaveLength(1);

    // 3. Reviewer attempts DELETE -> 204 No Content
    const reviewerDeleteRes = await request(app)
      .delete(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer reviewer_1');

    expect(reviewerDeleteRes.status).toBe(204);

    // Notice is removed from notices table
    const { rows: postDeleteRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [noticeId]);
    expect(postDeleteRows).toHaveLength(0);
  });

  it('F. Deleted Gmail notice remains suppressed on subsequent reviewer sync', async () => {
    // 1. Connect Reviewer 1
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'reviewer_1', 'notices@vit.ac.in', 'tok_rev', 'ref_rev', 1700000000)
      `,
      [randomUUID()],
    );

    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg_suppress_test', threadId: 'thread_suppress' }],
      },
    });

    mockGet.mockResolvedValue({
      data: {
        id: 'msg_suppress_test',
        threadId: 'thread_suppress',
        snippet: 'Sports Meet Announcement',
        payload: {
          headers: [
            { name: 'From', value: 'sports@vit.ac.in' },
            { name: 'To', value: 'all@vit.ac.in' },
            { name: 'Subject', value: 'Annual Sports Meet 2026' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('Sports meet on 2026-11-01').toString('base64url'),
          },
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Annual Sports Meet 2026',
        summary: 'Sports meet in stadium',
        category: 'event',
        priority: 'normal',
        importantDates: [{ label: 'Event Date', date: '2026-11-01' }],
        venue: 'Main Stadium',
        source: {
          provider: 'gmail',
          messageId: 'msg_suppress_test',
          sender: 'sports@vit.ac.in',
          subject: 'Annual Sports Meet 2026',
        },
      }),
    });

    // 2. Initial sync creates the notice
    const firstSync = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_1');
    expect(firstSync.body.noticesCreated).toBe(1);

    const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
    expect(noticeRows).toHaveLength(1);
    const noticeId = noticeRows[0].id;

    // 3. Reviewer deletes the notice
    const deleteRes = await request(app)
      .delete(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer reviewer_1');
    expect(deleteRes.status).toBe(204);

    // Suppression row is present
    const { rows: suppressRows } = await pool.query('SELECT * FROM notice_suppressions WHERE source_message_id = $1', [
      'msg_suppress_test',
    ]);
    expect(suppressRows).toHaveLength(1);

    // Reset processed message table so sync looks at the message again
    await pool.query('DELETE FROM processed_gmail_messages');

    // 4. Second sync does NOT re-create the notice
    const secondSync = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_1');
    expect(secondSync.body.noticesCreated).toBe(0);

    const { rows: postSyncNoticeRows } = await pool.query('SELECT * FROM notices');
    expect(postSyncNoticeRows).toHaveLength(0);
  });

  it('G. Reviewer authorization works through ADMIN_USER_IDS allowlist even without Clerk JWT role claims', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `
      INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, published_at)
      VALUES ($1, 'admin_creator', 'Hostel Mess Fee Circular', 'Hostel fee payment instructions', 'administrative', 'normal', 'published', NOW())
      `,
      [noticeId],
    );

    // allowlist_admin has NO role in JWT claims, but userId 'allowlist_admin_user' is in ADMIN_USER_IDS
    const deleteRes = await request(app)
      .delete(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer allowlist_admin');

    expect(deleteRes.status).toBe(204);

    const { rows } = await pool.query('SELECT * FROM notices WHERE id = $1', [noticeId]);
    expect(rows).toHaveLength(0);
  });
});
