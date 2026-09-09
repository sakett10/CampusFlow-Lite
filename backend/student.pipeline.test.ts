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
            data: { emailAddress: 'studentA@vitstudent.ac.in' },
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
import { storageService } from './services/storage.service.js';
import { setNoticeAnalyzer, resetNoticeAnalyzer } from './services/noticeAnalyzer.service.js';

describe('End-to-End Student Gmail Pipeline & Multi-Tenant Feed Isolation', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    mockList.mockReset();
    mockGet.mockReset();
    resetNoticeAnalyzer();

    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM campus_items');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('1. Student A connects Gmail, syncs messages, and views them in their campus feed', async () => {
    // 1. Connect Student A
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000)
      `,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: 'msg_hack_2026', threadId: 'thread_hack_2026' }],
      },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_hack_2026',
        threadId: 'thread_hack_2026',
        snippet: 'Hackathon 2026 Circular',
        payload: {
          headers: [
            { name: 'From', value: 'techclub@vit.ac.in' },
            { name: 'To', value: 'studentA@vitstudent.ac.in' },
            { name: 'Subject', value: 'Annual Codeathon 2026' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: {
                data: Buffer.from('Register by 2026-10-15 for the annual codeathon').toString('base64url'),
              },
            },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Annual Codeathon 2026',
        summary: 'Annual hackathon and programming contest',
        category: 'event',
        priority: 'urgent',
        importantDates: [{ label: 'Registration Deadline', date: '2026-10-15' }],
        venue: 'Technology Tower Aud',
        source: {
          provider: 'gmail',
          messageId: 'msg_hack_2026',
          sender: 'techclub@vit.ac.in',
          subject: 'Annual Codeathon 2026',
        },
      }),
    });

    // Student A triggers sync via API
    const syncRes = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_A');

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.emailsPersisted).toBe(1);

    // Verify storageService.getAll for Student A returns the parsed item
    const studentAItems = await storageService.getAll('student_A');
    expect(studentAItems).toHaveLength(1);
    expect(studentAItems[0].title).toBe('Annual Codeathon 2026');
    expect(studentAItems[0].sourceType).toBe('email');
    expect(studentAItems[0].registrationDeadline).toBe('2026-10-15');

    // Verify HTTP GET /api/campus-items for Student A
    const feedResA = await request(app)
      .get('/api/campus-items')
      .set('Authorization', 'Bearer student_A');

    expect(feedResA.status).toBe(200);
    expect(feedResA.body).toHaveLength(1);
    expect(feedResA.body[0].title).toBe('Annual Codeathon 2026');
  });

  it('2. Strict Isolation: Student B cannot see Student A email notices in Campus Feed', async () => {
    // Insert an email for Student A directly
    const emailId = randomUUID();
    await pool.query(
      `
      INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, subject, summary, category, deadline, analysis_status
      ) VALUES (
        $1, 'student_A', 'studentA@vit.ac.in', 'msg_secret_1', 'Student A Project Review', 'Confidential presentation', 'assignment', '2026-11-01', 'completed'
      )
      `,
      [emailId],
    );

    // Student A can see it
    const feedA = await storageService.getAll('student_A');
    expect(feedA).toHaveLength(1);
    expect(feedA[0].title).toBe('Student A Project Review');

    // Student B CANNOT see it via storageService
    const feedB = await storageService.getAll('student_B');
    expect(feedB).toHaveLength(0);

    // Student B CANNOT see it via HTTP endpoint
    const httpResB = await request(app)
      .get('/api/campus-items')
      .set('Authorization', 'Bearer student_B');

    expect(httpResB.status).toBe(200);
    expect(httpResB.body).toHaveLength(0);
  });

  it('3. Cross-User Delete Protection: Student B cannot delete Student A email item, but Student A can', async () => {
    const emailId = randomUUID();
    await pool.query(
      `
      INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, subject, summary, category, analysis_status
      ) VALUES (
        $1, 'student_A', 'studentA@vit.ac.in', 'msg_delete_test', 'Delete Test Notice', 'Test description', 'event', 'completed'
      )
      `,
      [emailId],
    );

    // Student B attempts to delete Student A's email item -> 404
    const deleteBRes = await request(app)
      .delete(`/api/campus-items/${emailId}`)
      .set('Authorization', 'Bearer student_B');

    expect(deleteBRes.status).toBe(404);

    // Verify item is still in DB
    const { rows: checkRows } = await pool.query('SELECT * FROM campus_emails WHERE id = $1', [emailId]);
    expect(checkRows).toHaveLength(1);

    // Student A deletes their own email item -> 204
    const deleteARes = await request(app)
      .delete(`/api/campus-items/${emailId}`)
      .set('Authorization', 'Bearer student_A');

    expect(deleteARes.status).toBe(204);

    // Verify item is deleted from DB
    const { rows: postDeleteRows } = await pool.query('SELECT * FROM campus_emails WHERE id = $1', [emailId]);
    expect(postDeleteRows).toHaveLength(0);

    // Verify Student A's feed is now empty
    const finalFeed = await storageService.getAll('student_A');
    expect(finalFeed).toHaveLength(0);
  });
});
