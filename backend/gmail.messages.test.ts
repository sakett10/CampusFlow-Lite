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
  createAuthenticatedGmailClient,
  getHeaderValue,
  extractMessageBodyText,
  parseGmailMessageDetails,
} from './services/gmail.service.js';

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

  it('correctly extracts header values case-insensitively', () => {
    const headers = [
      { name: 'From', value: 'dean@vit.ac.in' },
      { name: 'TO', value: 'student@vitstudent.ac.in' },
      { name: 'Subject', value: 'Hackathon Announcement' },
      { name: 'date', value: 'Sun, 30 Aug 2026 00:00:00 GMT' },
    ];

    expect(getHeaderValue(headers, 'from')).toBe('dean@vit.ac.in');
    expect(getHeaderValue(headers, 'FROM')).toBe('dean@vit.ac.in');
    expect(getHeaderValue(headers, 'to')).toBe('student@vitstudent.ac.in');
    expect(getHeaderValue(headers, 'subject')).toBe('Hackathon Announcement');
    expect(getHeaderValue(headers, 'Date')).toBe('Sun, 30 Aug 2026 00:00:00 GMT');
    expect(getHeaderValue(headers, 'cc')).toBe('');
    expect(getHeaderValue(undefined, 'from')).toBe('');
  });

  it('extracts and decodes body text from single and multipart payloads', () => {
    const plainText = 'Hello student, this is a vital update.';
    const encodedPlain = Buffer.from(plainText).toString('base64url');

    // Single part
    expect(
      extractMessageBodyText({
        mimeType: 'text/plain',
        body: { data: encodedPlain },
      }),
    ).toBe(plainText);

    // Multipart with text/plain
    expect(
      extractMessageBodyText({
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: encodedPlain },
          },
          {
            mimeType: 'text/html',
            body: { data: Buffer.from('<p>Html</p>').toString('base64url') },
          },
        ],
      }),
    ).toBe(plainText);

    // Multipart fallback to html
    const htmlText = '<p>Important event notice</p>';
    expect(
      extractMessageBodyText({
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/html',
            body: { data: Buffer.from(htmlText).toString('base64url') },
          },
        ],
      }),
    ).toBe(htmlText);

    // Null/empty payload
    expect(extractMessageBodyText(null)).toBe('');
  });

  it('parses complete message details safely', () => {
    const plainText = 'Orientation tomorrow at 9 AM in Auditorium.';
    const encodedPlain = Buffer.from(plainText).toString('base64url');

    const parsed = parseGmailMessageDetails(
      {
        id: 'msg_999',
        threadId: 'thread_999',
        snippet: 'Orientation tomorrow...',
        payload: {
          headers: [
            { name: 'From', value: 'events@vit.ac.in' },
            { name: 'To', value: 'all@vitstudent.ac.in' },
            { name: 'Subject', value: 'Orientation 2026' },
            { name: 'Date', value: '2026-08-30' },
          ],
          mimeType: 'text/plain',
          body: { data: encodedPlain },
        },
      },
      'fallback_id',
    );

    expect(parsed).toEqual({
      id: 'msg_999',
      threadId: 'thread_999',
      from: 'events@vit.ac.in',
      to: 'all@vitstudent.ac.in',
      subject: 'Orientation 2026',
      date: '2026-08-30',
      snippet: 'Orientation tomorrow...',
      body: plainText,
      bodyText: plainText,
    });
  });
});

describe('GET /api/gmail/messages', () => {
  beforeEach(async () => {
    mockList.mockReset();
    mockGet.mockReset();
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

describe('GET /api/gmail/messages/:messageId', () => {
  beforeEach(async () => {
    mockList.mockReset();
    mockGet.mockReset();
    await pool.query('DELETE FROM gmail_connections');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/gmail/messages/msg_123');
    expect(res.status).toBe(401);
  });

  it('returns 404 if Gmail is not connected for user', async () => {
    const res = await request(app)
      .get('/api/gmail/messages/msg_123')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Gmail account is not connected');
  });

  it('authenticated connected user can retrieve message details', async () => {
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
        'secret_access_token_A',
        'secret_refresh_token_A',
        1700000000,
      ],
    );

    const bodyContent = 'Important update regarding university examinations.';
    const encodedBody = Buffer.from(bodyContent).toString('base64url');

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_test_100',
        threadId: 'thread_test_100',
        snippet: 'Important update regarding...',
        payload: {
          headers: [
            { name: 'From', value: 'controller.exams@vit.ac.in' },
            { name: 'To', value: 'student@vitstudent.ac.in' },
            { name: 'Subject', value: 'FAT Examination Schedule 2026' },
            { name: 'Date', value: 'Sun, 30 Aug 2026 10:00:00 +0530' },
          ],
          mimeType: 'text/plain',
          body: {
            data: encodedBody,
          },
        },
      },
    });

    const res = await request(app)
      .get('/api/gmail/messages/msg_test_100')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'msg_test_100',
      threadId: 'thread_test_100',
      from: 'controller.exams@vit.ac.in',
      to: 'student@vitstudent.ac.in',
      subject: 'FAT Examination Schedule 2026',
      date: 'Sun, 30 Aug 2026 10:00:00 +0530',
      snippet: 'Important update regarding...',
      body: bodyContent,
      bodyText: bodyContent,
    });

    // Ensure correct Gmail API params were passed
    expect(mockGet).toHaveBeenCalledWith({
      userId: 'me',
      id: 'msg_test_100',
      format: 'full',
    });

    // Ensure NO secrets/tokens are leaked in the response
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.refresh_token).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('secret_access_token_A');
    expect(JSON.stringify(res.body)).not.toContain('secret_refresh_token_A');
  });

  it('handles missing/malformed message fields gracefully', async () => {
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

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_empty_1',
        snippet: 'Fallback snippet text',
      },
    });

    const res = await request(app)
      .get('/api/gmail/messages/msg_empty_1')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('msg_empty_1');
    expect(res.body.from).toBe('');
    expect(res.body.to).toBe('');
    expect(res.body.subject).toBe('');
    expect(res.body.date).toBe('');
    expect(res.body.snippet).toBe('Fallback snippet text');
    expect(res.body.body).toBe('Fallback snippet text');
  });

  it('handles Gmail API 404 (message not found) safely', async () => {
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

    mockGet.mockRejectedValueOnce({
      code: 404,
      message: 'Requested entity was not found.',
    });

    const res = await request(app)
      .get('/api/gmail/messages/msg_nonexistent')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Gmail message not found');
  });

  it('handles Gmail API generic failure (500) without exposing secrets', async () => {
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

    mockGet.mockRejectedValueOnce(new Error('Google Backend 503 Service Unavailable'));

    const res = await request(app)
      .get('/api/gmail/messages/msg_error')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to retrieve Gmail message');
  });

  it('isolates connections across users (User B cannot retrieve User A message)', async () => {
    // Only connect User A
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
      .get('/api/gmail/messages/msg_123')
      .set('Authorization', 'Bearer user_B');

    expect(res.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  describe('GET /api/gmail/auth-url', () => {
    it('returns Google OAuth URL when authenticated', async () => {
      const res = await request(app)
        .get('/api/gmail/auth-url')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(res.body.url).toBeDefined();
      expect(typeof res.body.url).toBe('string');
      expect(res.body.url).toContain('https://mock-auth-url');
    });

    it('returns 401 Unauthenticated when not authenticated', async () => {
      const res = await request(app).get('/api/gmail/auth-url');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/gmail/disconnect', () => {
    it('disconnects and deletes user connection without affecting other users', async () => {
      // Connect User A and User B
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES
          ($1, 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000),
          ($2, 'user_B', 'userB@vitstudent.ac.in', 'token_B', 'refresh_B', 1700000000)
        `,
        [randomUUID(), randomUUID()],
      );

      // User A disconnects
      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // User A is disconnected
      const { rows: rowsA } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', ['user_A']);
      expect(rowsA).toHaveLength(0);

      // User B remains connected
      const { rows: rowsB } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', ['user_B']);
      expect(rowsB).toHaveLength(1);
      expect(rowsB[0].user_id).toBe('user_B');
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).post('/api/gmail/disconnect');
      expect(res.status).toBe(401);
    });
  });
});

