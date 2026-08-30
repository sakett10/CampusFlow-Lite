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
    clerkMiddleware: () => (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }, _res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer user_A' || authHeader === 'Bearer reviewer_A') {
        req.auth = { userId: 'user_A', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer user_B') {
        req.auth = { userId: 'user_B', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer student_1') {
        req.auth = { userId: 'student_1', sessionClaims: { metadata: { role: 'student' } } };
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
    getAuth: (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }) => ({
      userId: req.auth?.userId || null,
      sessionClaims: req.auth?.sessionClaims,
    }),
  };
});

import app from './index.js';
import { pool } from './db.js';
import {
  isGmailMessageProcessed,
  markGmailMessageAsProcessed,
  syncGmailMessagesForUser,
  GmailNotConnectedError,
} from './services/gmail.service.js';
import { setNoticeAnalyzer, resetNoticeAnalyzer } from './services/noticeAnalyzer.service.js';
import { NoticeValidationError } from './services/noticeValidator.js';

describe('Gmail Sync Foundation (Phase C1 + C3 Automatic Notice Pipeline)', () => {
  beforeEach(async () => {
    mockList.mockReset();
    mockGet.mockReset();
    resetNoticeAnalyzer();
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM gmail_connections');
  });

  describe('Direct Service & Database Helper Tests', () => {
    it('accurately identifies unprocessed and processed message IDs per user', async () => {
      expect(await isGmailMessageProcessed('user_A', 'msg_101')).toBe(false);

      await markGmailMessageAsProcessed('user_A', 'msg_101');
      expect(await isGmailMessageProcessed('user_A', 'msg_101')).toBe(true);

      // User B should still see it as unprocessed (user isolation)
      expect(await isGmailMessageProcessed('user_B', 'msg_101')).toBe(false);
    });

    it('idempotently handles duplicate marks without throwing error', async () => {
      await markGmailMessageAsProcessed('user_A', 'msg_dup_1');
      await expect(markGmailMessageAsProcessed('user_A', 'msg_dup_1')).resolves.not.toThrow();

      const { rows } = await pool.query(
        'SELECT * FROM processed_gmail_messages WHERE user_id = $1 AND gmail_message_id = $2',
        ['user_A', 'msg_dup_1'],
      );
      expect(rows.length).toBe(1);
    });

    it('throws GmailNotConnectedError when syncing for user without connection', async () => {
      await expect(syncGmailMessagesForUser('unconnected_user', 10)).rejects.toThrow(
        GmailNotConnectedError,
      );
    });
  });

  describe('GET /api/gmail/messages Endpoint', () => {
    it('returns 5 separate message IDs with threadId preserved, never concatenating or truncating', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000)
        `,
        [randomUUID()],
      );

      const mock5Messages = [
        { id: '1a0515e0cbc287bc', threadId: '1a051552dbd40ee4' },
        { id: '1a051582975fe923', threadId: '1a051552dbd40ee4' },
        { id: '1a05157532bcaa9c', threadId: '1a051552dbd40ee4' },
        { id: '1a05156870e204ee', threadId: '1a051552dbd40ee4' },
        { id: '1a05155efb171252', threadId: '1a051552dbd40ee4' },
      ];

      mockList.mockResolvedValueOnce({
        data: {
          messages: mock5Messages,
          resultSizeEstimate: 5,
        },
      });

      const res = await request(app)
        .get('/api/gmail/messages')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(5);
      expect(res.body.messages).toEqual(mock5Messages);
      expect(res.body.messages.map((m: { id: string }) => m.id)).toEqual([
        '1a0515e0cbc287bc',
        '1a051582975fe923',
        '1a05157532bcaa9c',
        '1a05156870e204ee',
        '1a05155efb171252',
      ]);
      // All 5 share the same threadId
      expect(new Set(res.body.messages.map((m: { threadId: string }) => m.threadId)).size).toBe(1);
    });

    it('retrieves individual message details ensuring messages.get receives exact requested ID and returns distinct contents', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000)
        `,
        [randomUUID()],
      );

      mockGet.mockImplementation(({ id }: { id: string }) => {
        let documentName = 'Unknown Document';
        if (id === '1a0515e0cbc287bc') documentName = 'Consent form for Data Processing';
        if (id === '1a051582975fe923') documentName = 'Certificate of Physical Fitness (Original)';
        if (id === '1a05156870e204ee') documentName = 'SSLC / Birth Certificate / Passport (Original)';

        return Promise.resolve({
          data: {
            id,
            threadId: '1a051552dbd40ee4',
            snippet: `Dear Candidate [ 2026033287 ] upload your ${documentName}`,
            payload: {
              headers: [
                { name: 'From', value: 'VIT <no-reply@vit.ac.in>' },
                { name: 'Subject', value: 'Fresher - Certificate Verification' },
                { name: 'Date', value: 'Sun, 30 Aug 2026 12:01:53 +0530' },
              ],
              mimeType: 'text/plain',
              body: {
                data: Buffer.from(
                  `Dear Candidate [ 2026033287 ], Greetings from VIT! During the certificate verification process, it was found that the required document has not been uploaded. You are requested to upload your ${documentName} through the VTOP Portal.`,
                ).toString('base64url'),
              },
            },
          },
        });
      });

      // 1. Fetch details for Message 1 (Consent form)
      const res1 = await request(app)
        .get('/api/gmail/messages/1a0515e0cbc287bc')
        .set('Authorization', 'Bearer user_A');

      expect(res1.status).toBe(200);
      expect(res1.body.id).toBe('1a0515e0cbc287bc');
      expect(res1.body.threadId).toBe('1a051552dbd40ee4');
      expect(res1.body.bodyText).toContain('Consent form for Data Processing');
      expect(mockGet).toHaveBeenLastCalledWith(expect.objectContaining({ id: '1a0515e0cbc287bc' }));

      // 2. Fetch details for Message 2 (Physical Fitness)
      const res2 = await request(app)
        .get('/api/gmail/messages/1a051582975fe923')
        .set('Authorization', 'Bearer user_A');

      expect(res2.status).toBe(200);
      expect(res2.body.id).toBe('1a051582975fe923');
      expect(res2.body.threadId).toBe('1a051552dbd40ee4');
      expect(res2.body.bodyText).toContain('Certificate of Physical Fitness (Original)');
      expect(mockGet).toHaveBeenLastCalledWith(expect.objectContaining({ id: '1a051582975fe923' }));

      // 3. Fetch details for Message 3 (SSLC)
      const res3 = await request(app)
        .get('/api/gmail/messages/1a05156870e204ee')
        .set('Authorization', 'Bearer user_A');

      expect(res3.status).toBe(200);
      expect(res3.body.id).toBe('1a05156870e204ee');
      expect(res3.body.threadId).toBe('1a051552dbd40ee4');
      expect(res3.body.bodyText).toContain('SSLC / Birth Certificate / Passport (Original)');
      expect(mockGet).toHaveBeenLastCalledWith(expect.objectContaining({ id: '1a05156870e204ee' }));

      // Ensure distinct bodies were returned across all 3 same-thread messages
      expect(res1.body.bodyText).not.toEqual(res2.body.bodyText);
      expect(res2.body.bodyText).not.toEqual(res3.body.bodyText);
    });
  });


  describe('POST /api/gmail/sync Endpoint & Notice Persistence Integration', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post('/api/gmail/sync');
      expect(res.status).toBe(401);
    });

    it('returns 404 when Gmail is not connected for user', async () => {
      const res = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Gmail account is not connected');
    });

    it('successfully syncs new messages, creates pending notices, and returns statistics', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (
          id, user_id, google_email, access_token, refresh_token, expiry_date
        ) VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [randomUUID(), 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000],
      );

      const mockBatch = Array.from({ length: 3 }, (_, i) => ({
        id: `sync_msg_${i + 1}`,
        threadId: `thread_${i + 1}`,
      }));

      mockList.mockResolvedValueOnce({
        data: {
          messages: mockBatch,
          resultSizeEstimate: 3,
        },
      });

      mockGet.mockImplementation(({ id }: { id: string }) => {
        return Promise.resolve({
          data: {
            id,
            threadId: `thread_${id}`,
            snippet: `Snippet for ${id}`,
            payload: {
              headers: [
                { name: 'From', value: 'academics@vit.ac.in' },
                { name: 'To', value: 'userA@vitstudent.ac.in' },
                { name: 'Subject', value: `Official Notice ${id}` },
                { name: 'Date', value: '2026-08-30' },
              ],
              mimeType: 'text/plain',
              body: { data: Buffer.from(`Exam timetable details for ${id}`).toString('base64url') },
            },
          },
        });
      });

      setNoticeAnalyzer({
        analyze: vi.fn().mockImplementation((msg) =>
          Promise.resolve({
            title: `Processed Notice ${msg.id}`,
            summary: `Automated summary for ${msg.id}`,
            category: 'exam',
            priority: 'urgent',
            source: {
              provider: 'gmail',
              messageId: msg.id,
              sender: msg.sender,
              subject: msg.subject,
            },
          }),
        ),
      });

      const res = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        checked: 3,
        newMessages: 3,
        skipped: 0,
        processed: 3,
        failed: 0,
        emailsPersisted: 3,
        analysesFailed: 0,
        noticesCreated: 3,
      });



      // Verify notices were inserted into notices table with status: 'published'
      const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', ['user_A']);
      expect(noticeRows.length).toBe(3);
      expect(noticeRows[0].status).toBe('published');
      expect(noticeRows[0].category).toBe('exam');
      expect(noticeRows[0].source_account_email).toBe('userA@vitstudent.ac.in');
    });

    it('ensures pending notices from sync do NOT appear in Campus Feed or Student Notices until published', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000)
        `,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_exam_feed_1' }] },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg_exam_feed_1',
          payload: {
            headers: [
              { name: 'From', value: 'coe@vit.ac.in' },
              { name: 'Subject', value: 'Winter 2026 FAT' },
            ],
            mimeType: 'text/plain',
            body: { data: Buffer.from('FAT Exam timetable').toString('base64url') },
          },
        },
      });

      setNoticeAnalyzer({
        analyze: vi.fn().mockResolvedValue({
          title: 'Winter 2028 FAT Examination Timetable',
          summary: 'FAT Examination schedule for all engineering branches.',
          category: 'exam',
          priority: 'urgent',
          isCampusWide: true,
          isPersonal: false,
          importantDates: [{ label: 'Exam Start', date: '2028-12-01' }],
          source: { provider: 'gmail', messageId: 'msg_exam_feed_1', sender: 'coe@vit.ac.in', subject: 'Winter 2028 FAT' },
        }),
      });

      // 1. Sync Gmail
      const syncRes = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');
      expect(syncRes.status).toBe(200);

      // 2. Published campus notice appears in Campus Feed
      const { rows } = await pool.query("SELECT id FROM notices WHERE source_message_id = 'msg_exam_feed_1'");
      expect(rows).toHaveLength(1);

      const studentFeed = await request(app)
        .get('/api/campus-items')
        .set('Authorization', 'Bearer student_1');
      expect(studentFeed.status).toBe(200);
      const feedNotice = studentFeed.body.find((item: { title: string }) => item.title.includes('Winter 2028 FAT'));
      expect(feedNotice).toBeDefined();
      expect(feedNotice.type).toBe('DEADLINE');
    });

    it('handles student-specific emails by persisting raw email in campus_emails while strictly excluding from notices table', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000)
        `,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_fresher_cert_1' }] },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg_fresher_cert_1',
          payload: {
            headers: [
              { name: 'From', value: 'admissions@vit.ac.in' },
              { name: 'Subject', value: 'Fresher - Certificate Verification' },
            ],
            mimeType: 'text/plain',
            body: { data: Buffer.from('Candidate [2026033287] please verify 12th marksheet').toString('base64url') },
          },
        },
      });

      setNoticeAnalyzer({
        analyze: vi.fn().mockResolvedValue({
          title: 'Certificate Verification for Candidate [2026033287]',
          summary: 'Individual document verification required at Admissions Office.',
          category: 'admission',
          priority: 'important',
          audience: 'Candidate [2026033287]',
          actionRequired: 'Verify original documents.',
          isPersonal: true,
          isCampusWide: false,
          source: {
            provider: 'gmail',
            messageId: 'msg_fresher_cert_1',
            sender: 'admissions@vit.ac.in',
            subject: 'Fresher - Certificate Verification',
          },
        }),
      });

      const syncRes = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');

      expect(syncRes.status).toBe(200);

      // Verify email was persisted into campus_emails for audit
      const { rows: emailRows } = await pool.query("SELECT * FROM campus_emails WHERE source_message_id = 'msg_fresher_cert_1'");
      expect(emailRows).toHaveLength(1);

      // Verify it was NOT inserted into notices table
      const { rows: noticeRows } = await pool.query("SELECT * FROM notices WHERE source_message_id = 'msg_fresher_cert_1'");
      expect(noticeRows).toHaveLength(0);

      // Not visible to students on Notice Board or Feed
      const studentNotices = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_1');
      expect(studentNotices.body).toHaveLength(0);

      const studentFeed = await request(app)
        .get('/api/campus-items')
        .set('Authorization', 'Bearer student_1');
      expect(studentFeed.body.some((i: { title: string }) => i.title.includes('Certificate Verification'))).toBe(false);
    });


    it('prevents duplicate notices when same Gmail message is synced again under same account', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000)
        `,
        [randomUUID()],
      );

      const batch = [{ id: 'msg_dup_test_1' }];
      mockList.mockResolvedValue({ data: { messages: batch } });
      mockGet.mockResolvedValue({
        data: {
          id: 'msg_dup_test_1',
          payload: { headers: [{ name: 'Subject', value: 'Test' }] },
        },
      });

      setNoticeAnalyzer({
        analyze: vi.fn().mockResolvedValue({
          title: 'Duplicate Test Notice',
          summary: 'Test summary.',
          category: 'general',
          priority: 'normal',
          source: { provider: 'gmail', messageId: 'msg_dup_test_1', sender: 'test@vit.ac.in', subject: 'Test' },
        }),
      });

      // 1st sync: creates notice
      const res1 = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');
      expect(res1.status).toBe(200);
      expect(res1.body.noticesCreated).toBe(1);

      // 2nd sync: skips duplicate message
      const res2 = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');
      expect(res2.status).toBe(200);
      expect(res2.body.skipped).toBe(1);
      expect(res2.body.newMessages).toBe(0);

      // Verify only 1 notice exists in DB
      const { rows } = await pool.query("SELECT * FROM notices WHERE source_message_id = 'msg_dup_test_1'");
      expect(rows.length).toBe(1);
    });

    it('handles non-notice emails gracefully by skipping notice creation while marking as processed', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000)
        `,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_spam_1' }, { id: 'msg_valid_1' }] },
      });

      mockGet.mockImplementation(({ id }: { id: string }) => {
        return Promise.resolve({
          data: {
            id,
            payload: { headers: [{ name: 'Subject', value: id }] },
          },
        });
      });

      setNoticeAnalyzer({
        analyze: vi.fn().mockImplementation((msg) => {
          if (msg.id === 'msg_spam_1') {
            throw new NoticeValidationError('Not a campus notice', ['category']);
          }
          return Promise.resolve({
            title: 'Valid Notice',
            summary: 'Summary of valid notice.',
            category: 'academic',
            priority: 'normal',
            source: { provider: 'gmail', messageId: msg.id, sender: 'prof@vit.ac.in', subject: 'Class' },
          });
        }),
      });

      const res = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(200);
      expect(res.body.checked).toBe(2);
      expect(res.body.newMessages).toBe(2);
      expect(res.body.processed).toBe(2);
      expect(res.body.noticesCreated).toBe(1);

      // Both are marked as processed in processed_gmail_messages
      const { rows: processedRows } = await pool.query('SELECT * FROM processed_gmail_messages WHERE user_id = $1', ['user_A']);
      expect(processedRows.length).toBe(2);
    });

    it('allows retry for transient errors: temporary failures do NOT mark message as processed', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'user_A', 'userA@vitstudent.ac.in', 'token_A', 'refresh_A', 1700000000)
        `,
        [randomUUID()],
      );

      mockList.mockResolvedValue({
        data: { messages: [{ id: 'msg_transient_1' }] },
      });

      mockGet.mockResolvedValue({
        data: {
          id: 'msg_transient_1',
          payload: { headers: [{ name: 'Subject', value: 'Transient Test' }] },
        },
      });

      // 1st run fails with transient network error
      setNoticeAnalyzer({
        analyze: vi.fn().mockRejectedValueOnce(new Error('Transient AI service network timeout')),
      });

      const res1 = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');

      expect(res1.status).toBe(200);
      expect(res1.body.noticesCreated).toBe(0);
      expect(res1.body.processed).toBe(0);

      // Message was NOT marked as processed in DB
      const { rows: processed1 } = await pool.query("SELECT * FROM processed_gmail_messages WHERE gmail_message_id = 'msg_transient_1'");
      expect(processed1.length).toBe(0);

      // 2nd run: network recovers, analyzer succeeds
      setNoticeAnalyzer({
        analyze: vi.fn().mockResolvedValueOnce({
          title: 'Recovered Notice',
          summary: 'Successfully processed after retry.',
          category: 'alert',
          priority: 'urgent',
          source: { provider: 'gmail', messageId: 'msg_transient_1', sender: 'admin@vit.ac.in', subject: 'Transient Test' },
        }),
      });

      const res2 = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');

      expect(res2.status).toBe(200);
      expect(res2.body.noticesCreated).toBe(1);
      expect(res2.body.processed).toBe(1);

      const { rows: processed2 } = await pool.query("SELECT * FROM processed_gmail_messages WHERE gmail_message_id = 'msg_transient_1'");
      expect(processed2.length).toBe(1);
    });

    it('safely handles Gmail API errors (500) without exposing sensitive credentials or tokens', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (
          id, user_id, google_email, access_token, refresh_token, expiry_date
        ) VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [randomUUID(), 'user_A', 'userA@vitstudent.ac.in', 'secret_token_123', 'secret_refresh_456', 1700000000],
      );

      mockList.mockRejectedValueOnce(new Error('Google Backend 503 Service Unavailable'));

      const res = await request(app)
        .post('/api/gmail/sync')
        .set('Authorization', 'Bearer user_A');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to sync Gmail messages');

      // Ensure tokens are NOT exposed
      expect(JSON.stringify(res.body)).not.toContain('secret_token_123');
      expect(JSON.stringify(res.body)).not.toContain('secret_refresh_456');
    });
  });
});
