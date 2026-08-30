import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock googleapis
const mockGet = vi.fn();
vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
    generateAuthUrl = vi.fn().mockReturnValue('https://mock-auth-url');
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
          messages: {
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
    getAuth: (req: Request & { auth?: { userId: string | null } }) => ({ userId: req.auth?.userId || null }),
  };
});

import app from './index.js';
import { pool } from './db.js';
import {
  setNoticeAnalyzer,
  resetNoticeAnalyzer,
  type NoticeAnalyzer,
} from './services/noticeAnalyzer.service.js';
import { NoticeValidationError } from './services/noticeValidator.js';
import type { NoticeCandidate } from './types.js';

describe('POST /api/gmail/analyze/:messageId (Phase C2)', () => {
  beforeEach(async () => {
    mockGet.mockReset();
    resetNoticeAnalyzer();
    await pool.query('DELETE FROM gmail_connections');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/gmail/analyze/msg_123');
    expect(res.status).toBe(401);
  });

  it('returns 404 when user has not connected Gmail', async () => {
    const res = await request(app)
      .post('/api/gmail/analyze/msg_123')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Gmail account is not connected');
  });

  it('returns 404 when Gmail message is not found on Google servers', async () => {
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id, user_id, google_email, access_token, refresh_token, expiry_date
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000],
    );

    mockGet.mockRejectedValueOnce({
      code: 404,
      message: 'Not found',
    });

    const res = await request(app)
      .post('/api/gmail/analyze/msg_nonexistent')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Gmail message not found');
  });

  it('successfully retrieves message, converts to StructuredGmailMessage, and returns validated NoticeCandidate', async () => {
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id, user_id, google_email, access_token, refresh_token, expiry_date
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000],
    );

    const plainText = 'CAT-1 exam begins on September 15, 2026. Hall tickets available on VTOP.';
    const encodedBody = Buffer.from(plainText).toString('base64url');

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_exam_777',
        threadId: 'thread_777',
        snippet: 'CAT-1 exam begins on September 15...',
        payload: {
          headers: [
            { name: 'From', value: 'exams@vit.ac.in' },
            { name: 'To', value: 'userA@vitstudent.ac.in' },
            { name: 'Subject', value: 'CAT-1 Schedule Released' },
            { name: 'Date', value: 'Sun, 30 Aug 2026 12:00:00 +0530' },
          ],
          mimeType: 'text/plain',
          body: { data: encodedBody },
        },
      },
    });

    const mockNoticeCandidate: NoticeCandidate = {
      title: 'CAT-1 Fall Semester Examination Schedule',
      summary: 'CAT-1 examinations will commence from September 15, 2026. Students must verify hall tickets.',
      category: 'exam',
      priority: 'important',
      audience: 'All Students',
      importantDates: [{ label: 'Exam Start', date: '2026-09-15' }],
      actionRequired: 'Download hall ticket from VTOP.',
      links: [{ label: 'VTOP Portal', url: 'https://vtop.vit.ac.in' }],
      source: {
        provider: 'gmail',
        messageId: 'msg_exam_777',
        sender: 'exams@vit.ac.in',
        subject: 'CAT-1 Schedule Released',
      },
    };

    const mockAnalyzer: NoticeAnalyzer = {
      analyze: vi.fn().mockResolvedValue(mockNoticeCandidate),
    };
    setNoticeAnalyzer(mockAnalyzer);

    const res = await request(app)
      .post('/api/gmail/analyze/msg_exam_777')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockNoticeCandidate);

    // Verify correct StructuredGmailMessage was passed to the analyzer
    expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg_exam_777',
        sender: 'exams@vit.ac.in',
        subject: 'CAT-1 Schedule Released',
        bodyText: plainText,
        sourceMessageId: 'msg_exam_777',
      }),
    );
  });

  it('isolates users: User B cannot analyze messages from User A connection', async () => {
    // Only connect user_A
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id, user_id, google_email, access_token, refresh_token, expiry_date
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000],
    );

    const res = await request(app)
      .post('/api/gmail/analyze/msg_123')
      .set('Authorization', 'Bearer user_B');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Gmail account is not connected');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('handles validation error (422) when analyzer returns malformed candidate', async () => {
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id, user_id, google_email, access_token, refresh_token, expiry_date
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000],
    );

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_bad_1',
        payload: { headers: [] },
      },
    });

    setNoticeAnalyzer({
      analyze: vi.fn().mockRejectedValue(new NoticeValidationError('Invalid notice candidate title', ['title'])),
    });

    const res = await request(app)
      .post('/api/gmail/analyze/msg_bad_1')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Invalid notice candidate title');
    expect(res.body.fieldErrors).toEqual(['title']);
  });

  it('handles unexpected analyzer errors (500) without exposing secrets', async () => {
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id, user_id, google_email, access_token, refresh_token, expiry_date
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), 'user_A', 'userA@vitstudent.ac.in', 'secret_token_abc', 'secret_refresh_def', 1700000000],
    );

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_fail_1',
        payload: { headers: [] },
      },
    });

    setNoticeAnalyzer({
      analyze: vi.fn().mockRejectedValue(new Error('AI inference timeout')),
    });

    const res = await request(app)
      .post('/api/gmail/analyze/msg_fail_1')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to analyze Gmail message');
    expect(JSON.stringify(res.body)).not.toContain('secret_token_abc');
    expect(JSON.stringify(res.body)).not.toContain('secret_refresh_def');
  });
});
