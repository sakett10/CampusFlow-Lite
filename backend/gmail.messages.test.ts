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
const mockList = vi.fn();
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
          getProfile: vi.fn().mockResolvedValue({
            data: { emailAddress: 'user@vitstudent.ac.in' },
          }),
          messages: {
            list: mockList,
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
import { createAuthenticatedGmailClient } from './services/gmail.service.js';

describe('Gmail Service Helper', () => {
  it('throws an error if access_token or refresh_token is missing', () => {
    expect(() => {
      createAuthenticatedGmailClient({
        accessToken: '',
        refreshToken: 'valid_refresh',
      });
    }).toThrow('Access token and refresh token are required');

    expect(() => {
      createAuthenticatedGmailClient({
        accessToken: 'valid_access',
        refreshToken: '',
      });
    }).toThrow('Access token and refresh token are required');
  });

  it('creates an authenticated Gmail client when given valid tokens', () => {
    const client = createAuthenticatedGmailClient({
      accessToken: 'test_access_token',
      refreshToken: 'test_refresh_token',
      expiryDate: 1700000000,
    });

    expect(client).toBeDefined();
    expect(client.users).toBeDefined();
    expect(client.users.messages).toBeDefined();
  });
});

describe('GET /api/gmail/messages', () => {
  beforeEach(async () => {
    mockList.mockReset();
    await pool.query('DELETE FROM gmail_connections');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/gmail/messages');
    expect(res.status).toBe(401);
  });

  it('returns 404 if Gmail is not connected for user', async () => {
    const res = await request(app)
      .get('/api/gmail/messages')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Gmail account is not connected');
  });

  it('retrieves at most 5 messages with safe metadata when user is connected', async () => {
    // Insert connection for User A
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id,
        user_id,
        google_email,
        access_token,
        refresh_token,
        expiry_date
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        randomUUID(),
        'user_A',
        'userA@vitstudent.ac.in',
        'access_token_A',
        'refresh_token_A',
        1700000000,
      ],
    );

    const mockMessages = [
      { id: 'msg_1', threadId: 'thread_1' },
      { id: 'msg_2', threadId: 'thread_2' },
      { id: 'msg_3', threadId: 'thread_3' },
    ];

    mockList.mockResolvedValueOnce({
      data: {
        messages: mockMessages,
        resultSizeEstimate: 3,
        nextPageToken: 'token_page_2',
      },
    });

    const res = await request(app)
      .get('/api/gmail/messages')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual(mockMessages);
    expect(res.body.resultSizeEstimate).toBe(3);
    expect(res.body.nextPageToken).toBe('token_page_2');

    // Ensure tokens are NOT exposed
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.refresh_token).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('access_token_A');
    expect(JSON.stringify(res.body)).not.toContain('refresh_token_A');

    // Verify Gmail API was called with userId: 'me' and maxResults: 5
    expect(mockList).toHaveBeenCalledWith({
      userId: 'me',
      maxResults: 5,
    });
  });

  it('handles empty inbox gracefully', async () => {
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id,
        user_id,
        google_email,
        access_token,
        refresh_token,
        expiry_date
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        randomUUID(),
        'user_A',
        'userA@vitstudent.ac.in',
        'access_token_A',
        'refresh_token_A',
        1700000000,
      ],
    );

    mockList.mockResolvedValueOnce({
      data: {
        resultSizeEstimate: 0,
      },
    });

    const res = await request(app)
      .get('/api/gmail/messages')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
    expect(res.body.resultSizeEstimate).toBe(0);
  });

  it('isolates connections across users (User B cannot access User A messages)', async () => {
    // Only connect user A
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id,
        user_id,
        google_email,
        access_token,
        refresh_token,
        expiry_date
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        randomUUID(),
        'user_A',
        'userA@vitstudent.ac.in',
        'access_token_A',
        'refresh_token_A',
        1700000000,
      ],
    );

    const res = await request(app)
      .get('/api/gmail/messages')
      .set('Authorization', 'Bearer user_B');

    expect(res.status).toBe(404);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('handles Gmail API errors safely without crashing or exposing secrets', async () => {
    await pool.query(
      `
      INSERT INTO gmail_connections (
        id,
        user_id,
        google_email,
        access_token,
        refresh_token,
        expiry_date
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        randomUUID(),
        'user_A',
        'userA@vitstudent.ac.in',
        'access_token_A',
        'refresh_token_A',
        1700000000,
      ],
    );

    mockList.mockRejectedValueOnce(new Error('Google API network timeout'));

    const res = await request(app)
      .get('/api/gmail/messages')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to retrieve Gmail messages');
  });
});
