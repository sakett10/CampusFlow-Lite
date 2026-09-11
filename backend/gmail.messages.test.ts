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
const mockRevokeToken = vi.fn().mockResolvedValue({});
vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
    generateAuthUrl = vi.fn().mockReturnValue('https://mock-auth-url');
    revokeToken = mockRevokeToken;
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
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        req.auth = { userId: token };
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
  syncGmailMessagesForUser,
  deriveAdvisoryLockKeys,
  acquireUserAdvisoryLock,
  releaseUserAdvisoryLock,
} from './services/gmail.service.js';
import { encryptToken } from './services/crypto.service.js';

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

  it('derives deterministic 32-bit signed integer lock keys from userId', () => {
    const [k1, k2] = deriveAdvisoryLockKeys('user_123');
    const [k1_repeat, k2_repeat] = deriveAdvisoryLockKeys('user_123');
    expect(k1).toBe(k1_repeat);
    expect(k2).toBe(k2_repeat);
    expect(Number.isInteger(k1)).toBe(true);
    expect(Number.isInteger(k2)).toBe(true);

    const [other1, other2] = deriveAdvisoryLockKeys('user_456');
    expect(k1 !== other1 || k2 !== other2).toBe(true);
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
    beforeEach(async () => {
      mockRevokeToken.mockReset();
      mockRevokeToken.mockResolvedValue({});
      await pool.query('DELETE FROM assignments');
      await pool.query('DELETE FROM notices');
      await pool.query('DELETE FROM campus_emails');
      await pool.query('DELETE FROM processed_gmail_messages');
      await pool.query('DELETE FROM gmail_connections');
    });

    it('1. normal disconnect (purgeData: false / default) deletes connection and preserves emails, processed messages, assignments, notices, and other users', async () => {
      const userA = 'user_A';
      const userB = 'user_B';

      // Insert connections
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'a@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000),
                ($3, $4, 'b@vitstudent.ac.in', 'tok_b', 'ref_b', 1700000000)`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // Insert campus_emails for A and B
      await pool.query(
        `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject)
         VALUES ($1, $2, 'a@vitstudent.ac.in', 'msg_a_1', 'Subject A'),
                ($3, $4, 'b@vitstudent.ac.in', 'msg_b_1', 'Subject B')`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // Insert processed_gmail_messages for A and B
      await pool.query(
        `INSERT INTO processed_gmail_messages (id, user_id, gmail_message_id)
         VALUES ($1, $2, 'msg_a_1'),
                ($3, $4, 'msg_b_1')`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // Insert assignments for A and B
      await pool.query(
        `INSERT INTO assignments (id, user_id, title, status, source)
         VALUES ($1, $2, 'Assignment A', 'PENDING', 'gmail'),
                ($3, $4, 'Assignment B', 'PENDING', 'gmail')`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // Insert notices for A and B
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, $2, 'Notice A', 'Summary A', 'academic', 'medium', 'published'),
                ($3, $4, 'Notice B', 'Summary B', 'academic', 'medium', 'published')`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // User A disconnects with purgeData: false
      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', `Bearer ${userA}`)
        .send({ purgeData: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.purged).toBe(false);

      // Connection A deleted, Connection B intact
      const { rows: connsA } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [userA]);
      expect(connsA).toHaveLength(0);
      const { rows: connsB } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [userB]);
      expect(connsB).toHaveLength(1);

      // User A data PRESERVED
      const { rows: emailsA } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [userA]);
      expect(emailsA).toHaveLength(1);
      const { rows: procA } = await pool.query('SELECT * FROM processed_gmail_messages WHERE user_id = $1', [userA]);
      expect(procA).toHaveLength(1);
      const { rows: assignA } = await pool.query('SELECT * FROM assignments WHERE user_id = $1', [userA]);
      expect(assignA).toHaveLength(1);
      const { rows: noticesA } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', [userA]);
      expect(noticesA).toHaveLength(1);

      // User B data PRESERVED
      const { rows: emailsB } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [userB]);
      expect(emailsB).toHaveLength(1);
      const { rows: procB } = await pool.query('SELECT * FROM processed_gmail_messages WHERE user_id = $1', [userB]);
      expect(procB).toHaveLength(1);
      const { rows: assignB } = await pool.query('SELECT * FROM assignments WHERE user_id = $1', [userB]);
      expect(assignB).toHaveLength(1);
      const { rows: noticesB } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', [userB]);
      expect(noticesB).toHaveLength(1);
    });

    it('2. disconnect with purgeData: true deletes connection, campus_emails, and processed_gmail_messages for user while preserving assignments, notices, and user B', async () => {
      const userA = 'user_A';
      const userB = 'user_B';

      // Insert connections
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'a@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000),
                ($3, $4, 'b@vitstudent.ac.in', 'tok_b', 'ref_b', 1700000000)`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // Insert campus_emails for A and B
      await pool.query(
        `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject)
         VALUES ($1, $2, 'a@vitstudent.ac.in', 'msg_a_1', 'Subject A'),
                ($3, $4, 'b@vitstudent.ac.in', 'msg_b_1', 'Subject B')`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // Insert processed_gmail_messages for A and B
      await pool.query(
        `INSERT INTO processed_gmail_messages (id, user_id, gmail_message_id)
         VALUES ($1, $2, 'msg_a_1'),
                ($3, $4, 'msg_b_1')`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // Insert assignments for A and B
      await pool.query(
        `INSERT INTO assignments (id, user_id, title, status, source)
         VALUES ($1, $2, 'Assignment A', 'PENDING', 'gmail'),
                ($3, $4, 'Assignment B', 'PENDING', 'gmail')`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // Insert notices for A and B
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, $2, 'Notice A', 'Summary A', 'academic', 'medium', 'published'),
                ($3, $4, 'Notice B', 'Summary B', 'academic', 'medium', 'published')`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // User A disconnects with purgeData: true
      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', `Bearer ${userA}`)
        .send({ purgeData: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.purged).toBe(true);

      // User A connection deleted
      const { rows: connsA } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [userA]);
      expect(connsA).toHaveLength(0);

      // User A emails and processed messages PURGED
      const { rows: emailsA } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [userA]);
      expect(emailsA).toHaveLength(0);
      const { rows: procA } = await pool.query('SELECT * FROM processed_gmail_messages WHERE user_id = $1', [userA]);
      expect(procA).toHaveLength(0);

      // User A assignments and notices PRESERVED
      const { rows: assignA } = await pool.query('SELECT * FROM assignments WHERE user_id = $1', [userA]);
      expect(assignA).toHaveLength(1);
      const { rows: noticesA } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', [userA]);
      expect(noticesA).toHaveLength(1);

      // User B data completely untouched
      const { rows: connsB } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [userB]);
      expect(connsB).toHaveLength(1);
      const { rows: emailsB } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [userB]);
      expect(emailsB).toHaveLength(1);
      const { rows: procB } = await pool.query('SELECT * FROM processed_gmail_messages WHERE user_id = $1', [userB]);
      expect(procB).toHaveLength(1);
      const { rows: assignB } = await pool.query('SELECT * FROM assignments WHERE user_id = $1', [userB]);
      expect(assignB).toHaveLength(1);
      const { rows: noticesB } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', [userB]);
      expect(noticesB).toHaveLength(1);
    });

    it('treats string truthy values like "false" strictly as non-purge', async () => {
      const user = 'user_string_false';
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'f@vitstudent.ac.in', 'tok', 'ref', 1700000000)`,
        [randomUUID(), user],
      );
      await pool.query(
        `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject)
         VALUES ($1, $2, 'f@vitstudent.ac.in', 'msg_f_1', 'Subject F')`,
        [randomUUID(), user],
      );

      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', `Bearer ${user}`)
        .send({ purgeData: 'false' });

      expect(res.status).toBe(200);
      expect(res.body.purged).toBe(false);

      const { rows: emails } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [user]);
      expect(emails).toHaveLength(1);
    });

    it('3. prefers decrypted refresh_token when calling Google token revocation', async () => {
      const rawRefreshToken = 'plain_refresh_token_value_xyz';
      const encryptedRefreshToken = encryptToken(rawRefreshToken);
      const encryptedAccessToken = encryptToken('plain_access_token_abc');

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'user_A', 'a@vitstudent.ac.in', $2, $3, 1700000000)`,
        [randomUUID(), encryptedAccessToken, encryptedRefreshToken],
      );

      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(mockRevokeToken).toHaveBeenCalledTimes(1);
      expect(mockRevokeToken).toHaveBeenCalledWith(rawRefreshToken);
    });

    it('4. falls back to decrypted access_token when refresh_token is missing or empty', async () => {
      const rawAccessToken = 'plain_access_token_only_123';
      const encryptedAccessToken = encryptToken(rawAccessToken);

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'user_A', 'a@vitstudent.ac.in', $2, '', 1700000000)`,
        [randomUUID(), encryptedAccessToken],
      );

      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(mockRevokeToken).toHaveBeenCalledTimes(1);
      expect(mockRevokeToken).toHaveBeenCalledWith(rawAccessToken);
    });

    it('5. handles Google revocation failure gracefully by logging a warning and completing local cleanup', async () => {
      mockRevokeToken.mockRejectedValueOnce(new Error('Google 500 internal revocation failure'));

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'user_A', 'a@vitstudent.ac.in', 'access_tok', 'refresh_tok', 1700000000)`,
        [randomUUID()],
      );

      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { rows } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', ['user_A']);
      expect(rows).toHaveLength(0);
    });

    it('6. returns 200 OK idempotently when already disconnected (no connection row)', async () => {
      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockRevokeToken).not.toHaveBeenCalled();
    });

    it('7. returns 401 when unauthenticated', async () => {
      const res = await request(app).post('/api/gmail/disconnect');
      expect(res.status).toBe(401);
    });

    it('8. blocks concurrent sync operations for the same user', async () => {
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'user_concurrent', 'conc@vitstudent.ac.in', 'tok', 'ref', 1700000000)`,
        [randomUUID()],
      );

      let resolveFirstList: (value: unknown) => void;
      const firstListPromise = new Promise((resolve) => {
        resolveFirstList = resolve;
      });

      // Hang the first sync call in mockList
      mockList.mockImplementationOnce(() => firstListPromise);

      // Start first sync
      const sync1Promise = syncGmailMessagesForUser('user_concurrent');

      // Attempt second sync concurrently for the same user
      const sync2Result = await syncGmailMessagesForUser('user_concurrent');

      expect(sync2Result.inProgress).toBe(true);
      expect(sync2Result.message).toBe('Sync already in progress for this user');

      // Unblock first sync
      resolveFirstList!({ data: { messages: [] } });
      const sync1Result = await sync1Promise;
      expect(sync1Result.checked).toBe(0);

      // After first finishes, another sync can run without being blocked
      mockList.mockResolvedValueOnce({ data: { messages: [] } });
      const sync3Result = await syncGmailMessagesForUser('user_concurrent');
      expect(sync3Result.inProgress).toBeUndefined();
    });

    it('10. maintains strict cross-user isolation during disconnect and sync operations', async () => {
      const user1 = 'user_iso_1';
      const user2 = 'user_iso_2';

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'iso1@vitstudent.ac.in', 'tok1', 'ref1', 1700000000),
                ($3, $4, 'iso2@vitstudent.ac.in', 'tok2', 'ref2', 1700000000)`,
        [randomUUID(), user1, randomUUID(), user2],
      );

      await pool.query(
        `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject)
         VALUES ($1, $2, 'iso1@vitstudent.ac.in', 'msg_iso_1', 'Email 1'),
                ($3, $4, 'iso2@vitstudent.ac.in', 'msg_iso_2', 'Email 2')`,
        [randomUUID(), user1, randomUUID(), user2],
      );

      // User 1 disconnects with purgeData: true
      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', `Bearer ${user1}`)
        .send({ purgeData: true });

      expect(res.status).toBe(200);

      // User 1 data is gone
      const { rows: conns1 } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [user1]);
      expect(conns1).toHaveLength(0);
      const { rows: emails1 } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [user1]);
      expect(emails1).toHaveLength(0);

      // User 2 data is completely intact
      const { rows: conns2 } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [user2]);
      expect(conns2).toHaveLength(1);
      const { rows: emails2 } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [user2]);
      expect(emails2).toHaveLength(1);
      expect(emails2[0].subject).toBe('Email 2');
    });

    it('11. disconnect cannot run concurrently with active sync for the same user', async () => {
      const user = 'user_sync_disconn';

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'syncdis@vitstudent.ac.in', 'tok', 'ref', 1700000000)`,
        [randomUUID(), user],
      );

      let resolveSyncList: (value: unknown) => void;
      const syncListPromise = new Promise((resolve) => {
        resolveSyncList = resolve;
      });

      // Hang sync in mockList while holding the advisory lock
      mockList.mockImplementationOnce(() => syncListPromise);

      const syncPromise = syncGmailMessagesForUser(user);

      // Verify that while sync is running, the user's advisory lock is held
      const probeClient = await pool.connect();
      try {
        const canLock = await acquireUserAdvisoryLock(probeClient, user, true);
        expect(canLock).toBe(false);
      } finally {
        probeClient.release();
      }

      // Start disconnect; it will block on the advisory lock until sync completes
      let disconnectFinished = false;
      const disconnectPromise = request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', `Bearer ${user}`)
        .then((res) => {
          disconnectFinished = true;
          return res;
        });

      // Give event loop time to verify disconnect is blocked waiting for lock
      await new Promise((r) => setTimeout(r, 50));
      expect(disconnectFinished).toBe(false);

      // Finish sync
      resolveSyncList!({ data: { messages: [] } });
      await syncPromise;

      // Disconnect completes cleanly after sync finishes
      const disconnRes = await disconnectPromise;
      expect(disconnRes.status).toBe(200);
      expect(disconnectFinished).toBe(true);

      const { rows } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [user]);
      expect(rows).toHaveLength(0);
    });

    it('12. purge cannot be followed by an in-flight sync writing zombie Gmail rows', async () => {
      const user = 'user_zombie_prevent';

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'zombie@vitstudent.ac.in', 'tok', 'ref', 1700000000)`,
        [randomUUID(), user],
      );

      // External client holds the user's advisory lock (simulating an active disconnect / purge in another instance)
      const disconnectLockClient = await pool.connect();
      await acquireUserAdvisoryLock(disconnectLockClient, user, false);

      // Simulate the purge deleting connection and any data
      await pool.query('DELETE FROM gmail_connections WHERE user_id = $1', [user]);

      // While disconnect lock is held, a sync attempt in another instance fails fast with inProgress
      const syncResult = await syncGmailMessagesForUser(user);
      expect(syncResult.inProgress).toBe(true);
      expect(syncResult.checked).toBe(0);
      expect(syncResult.emailsPersisted).toBe(0);

      // Disconnect finishes and releases lock
      await releaseUserAdvisoryLock(disconnectLockClient, user);
      disconnectLockClient.release();

      // Subsequent sync attempt now sees no connection and throws GmailNotConnectedError instead of inserting zombie rows
      await expect(syncGmailMessagesForUser(user)).rejects.toThrow('Gmail account is not connected');

      const { rows: emails } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [user]);
      expect(emails).toHaveLength(0);
    });

    it('13. User A advisory lock does not block User B independent Gmail sync or disconnect', async () => {
      const userA = 'user_independent_A';
      const userB = 'user_independent_B';

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'a@vit.ac.in', 'tok_a', 'ref_a', 1700000000),
                ($3, $4, 'b@vit.ac.in', 'tok_b', 'ref_b', 1700000000)`,
        [randomUUID(), userA, randomUUID(), userB],
      );

      // User A acquires lock
      const clientA = await pool.connect();
      const lockA = await acquireUserAdvisoryLock(clientA, userA, true);
      expect(lockA).toBe(true);

      // User B can independently acquire its own lock without blocking
      const clientB = await pool.connect();
      const lockB = await acquireUserAdvisoryLock(clientB, userB, true);
      expect(lockB).toBe(true);

      // User B can sync without issue
      mockList.mockResolvedValueOnce({ data: { messages: [] } });
      await releaseUserAdvisoryLock(clientB, userB);
      clientB.release();

      const syncB = await syncGmailMessagesForUser(userB);
      expect(syncB.inProgress).toBeUndefined();

      // Clean up User A lock
      await releaseUserAdvisoryLock(clientA, userA);
      clientA.release();
    });

    it('14. advisory lock is guaranteed to be released on sync failure / exception', async () => {
      const user = 'user_sync_fail';

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'fail@vit.ac.in', 'tok', 'ref', 1700000000)`,
        [randomUUID(), user],
      );

      // Force an exception during sync
      mockList.mockRejectedValueOnce(new Error('Fatal API crash'));

      await expect(syncGmailMessagesForUser(user)).rejects.toThrow('Fatal API crash');

      // Verify that the advisory lock was released in finally
      const checkClient = await pool.connect();
      try {
        const canLock = await acquireUserAdvisoryLock(checkClient, user, true);
        expect(canLock).toBe(true);
        await releaseUserAdvisoryLock(checkClient, user);
      } finally {
        checkClient.release();
      }
    });

    it('15. advisory lock is guaranteed to be released on disconnect failure / exception', async () => {
      const user = 'user_disconn_fail';

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, $2, 'disconnfail@vit.ac.in', 'tok', 'ref', 1700000000)`,
        [randomUUID(), user],
      );

      // Mock pool.connect to return a client whose query throws inside transaction
      const origConnect = pool.connect.bind(pool);
      const spyConnect = vi.spyOn(pool, 'connect').mockImplementationOnce(async () => {
        const client = await origConnect();
        const origQuery = client.query.bind(client);
        client.query = (async (...args: unknown[]) => {
          const text = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text || '';
          if (text.includes('DELETE FROM gmail_connections')) {
            throw new Error('Database disk error');
          }
          return (origQuery as (...args: unknown[]) => unknown)(...args);
        }) as typeof client.query;
        return client;
      });

      const res = await request(app)
        .post('/api/gmail/disconnect')
        .set('Authorization', `Bearer ${user}`);

      expect(res.status).toBe(500);
      spyConnect.mockRestore();

      // Verify that the advisory lock was released in finally
      const checkClient = await pool.connect();
      try {
        const canLock = await acquireUserAdvisoryLock(checkClient, user, true);
        expect(canLock).toBe(true);
        await releaseUserAdvisoryLock(checkClient, user);
      } finally {
        checkClient.release();
      }
    });
  });
});

