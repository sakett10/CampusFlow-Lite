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

// Mock Clerk auth
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer user_normal') {
        req.auth = { userId: 'user_normal', sessionClaims: {} };
      } else if (authHeader === 'Bearer reviewer_allowlisted') {
        req.auth = { userId: 'user_prod_reviewer', sessionClaims: {} };
      } else if (authHeader === 'Bearer reviewer_snake_claims') {
        req.auth = { userId: 'user_snake', sessionClaims: { public_metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer student_other') {
        req.auth = { userId: 'student_other', sessionClaims: {} };
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
import { noticesService } from './services/notices.service.js';

describe('Gmail Notice Recovery & Visibility Regression Tests', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.REVIEWER_USER_IDS = 'user_prod_reviewer';

    mockList.mockReset();
    mockGet.mockReset();

    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM notice_suppressions');
    await pool.query('DELETE FROM gmail_connections');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('1. GET /api/notices responds with no-store Cache-Control headers', async () => {
    const res = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer student_other');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('2. Missing notice is safely recovered from campus_emails when authorized reviewer syncs', async () => {
    const userId = 'user_prod_reviewer';
    const connEmail = 'sakett.pankaj2026@vitstudent.ac.in';
    const msgId = 'msg_hackathon_99';

    // Seed connection
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, $3, 'tok', 'ref', 1700000000)`,
      [randomUUID(), userId, connEmail],
    );

    // Seed an academic email that was previously analyzed and stored in campus_emails
    // but never published as a notice (e.g. prior to reviewer configuration)
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, subject, snippet,
        analysis_status, category, importance, summary, event_date, organizer
       ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'event', 'urgent', 'Hackathon 2026 Registration Open', '2026-10-15', 'CS Dept')`,
      [randomUUID(), userId, connEmail, msgId, 'graVITas Hackathon 2026', 'Hackathon registration snippet'],
    );

    // Message exists in campus_emails with analysis completed, but not yet processed into notice

    // Gmail returns the message ID in list
    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: msgId, threadId: 'thread_99' }],
      },
    });

    // Reviewer triggers sync - notice mockGet should NOT even be called because existingEmail is in campus_emails!
    const syncRes = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_allowlisted');

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.noticesCreated).toBe(1);
    expect(mockGet).not.toHaveBeenCalled();

    // Verify notice exists in DB
    const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE source_message_id = $1', [msgId]);
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0].title).toBe('graVITas Hackathon 2026');
    expect(noticeRows[0].status).toBe('published');

    // On subsequent sync, it should NOT duplicate the notice
    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: msgId, threadId: 'thread_99' }],
      },
    });
    const syncRes2 = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_allowlisted');

    expect(syncRes2.status).toBe(200);
    expect(syncRes2.body.noticesCreated).toBe(0);

    const { rows: noticeRowsAfter } = await pool.query('SELECT * FROM notices WHERE source_message_id = $1', [msgId]);
    expect(noticeRowsAfter).toHaveLength(1);
  });

  it('3. Students can see notices created by reviewer in REVIEWER_USER_IDS in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REVIEWER_USER_IDS = 'user_prod_reviewer';

    // Insert notice created by user_prod_reviewer
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_account_email, source_message_id, published_at
       ) VALUES ($1, 'user_prod_reviewer', 'Official Circular', 'Official holiday notice', 'administrative', 'normal', 'published', 'sakett@vit.ac.in', 'msg_1', NOW())`,
      [randomUUID()],
    );

    // Insert notice created by unprivileged user
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_account_email, source_message_id, published_at
       ) VALUES ($1, 'unprivileged_user', 'Private Email', 'Personal notice', 'general', 'normal', 'published', 'priv@vit.ac.in', 'msg_2', NOW())`,
      [randomUUID()],
    );

    // Student queries notices
    const notices = await noticesService.getAll({
      isReviewer: false,
      userId: 'student_other',
    });

    // Student sees official reviewer notice, but NOT unprivileged user notice
    expect(notices.map((n) => n.title)).toContain('Official Circular');
    expect(notices.map((n) => n.title)).not.toContain('Private Email');
  });

  it('4. Clerk claims with public_metadata (snake_case) grant reviewer access', async () => {
    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_snake_claims');

    // 404 because user_snake has no gmail connection, NOT 403 Forbidden!
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not connected');
  });
});
