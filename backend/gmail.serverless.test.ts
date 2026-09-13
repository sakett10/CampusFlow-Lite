import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return {
    pool: createTestPool(),
    isServerlessEnvironment: vi.fn(() => false),
    getPoolConfig: vi.fn(),
  };
});

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
            data: { emailAddress: 'student@vitstudent.ac.in' },
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
      if (authHeader === 'Bearer reviewer_user') {
        req.auth = { userId: 'user_serverless_reviewer', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else {
        req.auth = { userId: 'user_serverless_student', sessionClaims: { metadata: { role: 'student' } } };
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
    getAuth: (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }) => ({
      userId: req.auth?.userId || null,
      sessionClaims: req.auth?.sessionClaims,
    }),
  };
});

import { app } from './index.js';
import { pool } from './db.js';
import { syncGmailMessagesForUser } from './services/gmail.service.js';
import { encryptToken } from './services/crypto.service.js';

describe('Serverless Gmail Sync Timeout Protection', () => {
  const originalEnv = { ...process.env };
  const testUserId = 'user_serverless_student';
  const googleEmail = 'student@vitstudent.ac.in';

  beforeEach(async () => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM gmail_connections');

    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        testUserId,
        googleEmail,
        encryptToken('mock_access_token'),
        encryptToken('mock_refresh_token'),
        Date.now() + 3600000,
      ],
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('pauses cleanly with interrupted status when deadline is exceeded before fetching messages', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg_deadline_1' }, { id: 'msg_deadline_2' }],
      },
    });

    // Pass an already expired deadline
    const stats = await syncGmailMessagesForUser(testUserId, 15, false, {
      deadlineMs: Date.now() - 50,
    });

    expect(stats.interrupted).toBe(true);
    expect(stats.message).toContain('Sync paused to avoid serverless timeout');
    expect(stats.processed).toBe(0);
    expect(stats.checked).toBe(0);
  });

  it('pauses cleanly during chunk processing when wall-clock limit expires', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg_timeout_1' }, { id: 'msg_timeout_2' }],
      },
    });

    mockGet.mockResolvedValue({
      data: {
        id: 'msg_timeout_1',
        threadId: 'thread_1',
        snippet: 'Important academic notification',
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: 'Subject', value: 'Academic update' },
            { name: 'From', value: 'dean@vit.ac.in' },
            { name: 'Date', value: new Date().toUTCString() },
          ],
          body: {
            data: Buffer.from('Academic details for students').toString('base64'),
          },
        },
      },
    });

    // Max execution budget of 1ms triggers interruption
    const stats = await syncGmailMessagesForUser(testUserId, 15, false, {
      maxExecutionTimeMs: 1,
    });

    expect(stats.interrupted).toBe(true);
    expect(stats.message).toContain('Sync paused to avoid serverless timeout');
  });

  it('defaults sync endpoint batchSize to 15 when omitted', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [],
      },
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_user')
      .send({});

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        maxResults: 15,
      }),
    );
  });
});
