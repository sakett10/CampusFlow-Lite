import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
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
        req.auth = { userId: 'user_reviewer', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer student_user') {
        req.auth = { userId: 'user_student', sessionClaims: { metadata: { role: 'student' } } };
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
import * as noticeAnalyzerModule from './services/noticeAnalyzer.service.js';
import { noticeAnalyzerService } from './services/noticeAnalyzer.service.js';
import { getHistoricalSyncQuery, reclassifyExistingCampusEmails } from './services/gmail.service.js';

describe('Phase 2C: Gmail Ingestion Reliability & AI Fallback Suite', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
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
    vi.restoreAllMocks();
  });

  it('1. Heuristic fallback succeeds and persists email when AI provider fails', async () => {
    const userId = 'user_reviewer';
    const connEmail = 'reviewer@vitstudent.ac.in';
    const msgId = 'msg_exam_deadline';

    // Seed connection
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, $3, 'tok', 'ref', 1700000000)`,
      [randomUUID(), userId, connEmail],
    );

    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: msgId, threadId: 'thread_exam' }],
      },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: msgId,
        threadId: 'thread_exam',
        snippet: 'FAT Exam Registration Deadline: 2026-10-30. Please register online.',
        payload: {
          headers: [
            { name: 'from', value: 'exams@vit.ac.in' },
            { name: 'subject', value: 'Urgent: FAT Exam Registration Last Date' },
            { name: 'date', value: new Date().toUTCString() },
          ],
          body: {
            data: Buffer.from(
              'FAT Exam Registration is now open. Last Date for registration is 2026-10-30. Complete all pending fee payments.',
            ).toString('base64url'),
          },
        },
      },
    });

    // Spy on noticeAnalyzerService.analyze to simulate AI provider outage (e.g. 429 quota exhaustion or network timeout)
    const aiSpy = vi.spyOn(noticeAnalyzerService, 'analyze').mockRejectedValueOnce(
      new Error('Google GenAI Error 429: Resource has been exhausted (e.g. check quota)'),
    );

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_user');

    expect(res.status).toBe(200);
    expect(aiSpy).toHaveBeenCalledTimes(1);

    // Verify sync stats report success, not failure
    expect(res.body.emailsPersisted).toBe(1);
    expect(res.body.processed).toBe(1);
    expect(res.body.noticesCreated).toBe(1);
    expect(res.body.failed).toBe(0);

    // Verify campus_emails updated with completed analysis status via heuristic fallback
    const { rows: emailRows } = await pool.query(
      'SELECT * FROM campus_emails WHERE source_message_id = $1',
      [msgId],
    );
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0].analysis_status).toBe('completed');
    expect(emailRows[0].category).toBe('exam');
    expect(emailRows[0].summary).toBeDefined();

    // Verify notice created on noticeboard for reviewer
    const { rows: noticeRows } = await pool.query(
      'SELECT * FROM notices WHERE source_message_id = $1',
      [msgId],
    );
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0].title).toBe('Urgent: FAT Exam Registration Last Date');
  });

  it('2. Repeated syncs do not re-invoke AI or duplicate processed messages', async () => {
    const userId = 'user_student';
    const connEmail = 'student@vitstudent.ac.in';
    const msgId = 'msg_workshop';

    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, $3, 'tok', 'ref', 1700000000)`,
      [randomUUID(), userId, connEmail],
    );

    // Mock initial message
    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: msgId, threadId: 'thread_ws' }],
      },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: msgId,
        threadId: 'thread_ws',
        snippet: 'ACM Workshop on Cloud Computing on 2026-11-10.',
        payload: {
          headers: [
            { name: 'from', value: 'acm@vit.ac.in' },
            { name: 'subject', value: 'Cloud Computing Workshop' },
            { name: 'date', value: new Date().toUTCString() },
          ],
          body: {
            data: Buffer.from('Join our cloud workshop on 2026-11-10 at CS Hall.').toString('base64url'),
          },
        },
      },
    });

    const aiSpy = vi.spyOn(noticeAnalyzerService, 'analyze').mockRejectedValueOnce(
      new Error('AI API rate limited'),
    );

    // First sync: AI fails -> heuristic succeeds -> marked processed
    const res1 = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_user');

    expect(res1.status).toBe(200);
    expect(res1.body.emailsPersisted).toBe(1);
    expect(aiSpy).toHaveBeenCalledTimes(1);

    // Second sync: Gmail still returns the message ID in list query
    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: msgId, threadId: 'thread_ws' }],
      },
    });

    const res2 = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_user');

    expect(res2.status).toBe(200);
    expect(res2.body.skipped).toBe(1);
    expect(res2.body.newMessages).toBe(0);
    // CRITICAL: AI must NOT be invoked again!
    expect(aiSpy).toHaveBeenCalledTimes(1);
    // Gmail messages.get must NOT be called again!
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('3. One failed Gmail messages.get does not abort the rest of the chunk', async () => {
    const userId = 'user_student';
    const connEmail = 'student@vitstudent.ac.in';

    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, $3, 'tok', 'ref', 1700000000)`,
      [randomUUID(), userId, connEmail],
    );

    mockList.mockResolvedValueOnce({
      data: {
        messages: [
          { id: 'msg_fail_1', threadId: 't1' },
          { id: 'msg_success_2', threadId: 't2' },
        ],
      },
    });

    // msg_fail_1 fails network get
    mockGet.mockImplementation(async ({ id }: { id: string }) => {
      if (id === 'msg_fail_1') {
        throw new Error('Google 500 Backend Error');
      }
      return {
        data: {
          id: 'msg_success_2',
          threadId: 't2',
          snippet: 'Library book return reminder.',
          payload: {
            headers: [
              { name: 'from', value: 'library@vit.ac.in' },
              { name: 'subject', value: 'Book Return Notice' },
              { name: 'date', value: new Date().toUTCString() },
            ],
            body: {
              data: Buffer.from('Please return books by 2026-10-15.').toString('base64url'),
            },
          },
        },
      };
    });

    vi.spyOn(noticeAnalyzerService, 'analyze').mockResolvedValueOnce({
      title: 'Book Return Notice',
      summary: 'Please return library books on time.',
      category: 'academic',
      priority: 'normal',
      source: {
        provider: 'gmail',
        messageId: 'msg_success_2',
        sender: 'library@vit.ac.in',
        subject: 'Book Return Notice',
      },
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_user');

    expect(res.status).toBe(200);
    expect(res.body.checked).toBe(2);
    expect(res.body.failed).toBe(1); // msg_fail_1 failed safely
    expect(res.body.processed).toBe(1); // msg_success_2 succeeded
    expect(res.body.emailsPersisted).toBe(1);

    // Verify msg_fail_1 was NOT marked processed, so it can be retried on next sync
    const { rows: processedRows } = await pool.query(
      'SELECT * FROM processed_gmail_messages WHERE user_id = $1 AND gmail_message_id = $2',
      [userId, 'msg_fail_1'],
    );
    expect(processedRows).toHaveLength(0);
  });

  it('4. Dynamic historical sync query derives valid relative dates and respects env', () => {
    const qDefault = getHistoricalSyncQuery(90);
    expect(qDefault).toMatch(/^after:\d{4}\/\d{2}\/\d{2}$/);
    expect(qDefault).toContain('after:');

    // Test custom override via env
    process.env.GMAIL_HISTORICAL_SYNC_DAYS = '60';
    const qEnv = getHistoricalSyncQuery();
    expect(qEnv).toMatch(/^after:\d{4}\/\d{2}\/\d{2}$/);
  });

  it('5. Double failure leaves message retryable, skips re-analysis in cooldown, and retries AI after cooldown', async () => {
    const userId = 'user_reviewer';
    const connEmail = 'reviewer@vitstudent.ac.in';
    const msgId = 'msg_double_fail_test';

    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, $3, 'tok', 'ref', 1700000000)`,
      [randomUUID(), userId, connEmail],
    );

    mockList.mockResolvedValue({
      data: {
        messages: [{ id: msgId, threadId: 'thread_df' }],
      },
    });

    mockGet.mockResolvedValue({
      data: {
        id: msgId,
        threadId: 'thread_df',
        snippet: 'Scholarship Application Announcement',
        payload: {
          headers: [
            { name: 'from', value: 'scholarships@vit.ac.in' },
            { name: 'subject', value: 'Merit Scholarship Application 2026' },
            { name: 'date', value: new Date().toUTCString() },
          ],
          body: {
            data: Buffer.from('Apply for Merit Scholarship before 2026-11-20.').toString('base64url'),
          },
        },
      },
    });

    // Run 1: AI fails AND Heuristic fails (simulate double failure)
    const aiSpy = vi.spyOn(noticeAnalyzerService, 'analyze').mockRejectedValueOnce(
      new Error('AI Quota Exceeded 429'),
    );
    const heuristicSpy = vi.spyOn(noticeAnalyzerModule, 'extractHeuristicCandidate').mockImplementationOnce(() => {
      throw new Error('Heuristic candidate extraction failed');
    });

    const res1 = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_user');

    expect(res1.status).toBe(200);
    expect(aiSpy).toHaveBeenCalledTimes(1);
    expect(heuristicSpy).toHaveBeenCalledTimes(1);
    expect(res1.body.failed).toBe(1);
    expect(res1.body.noticesCreated).toBe(0);

    // Verify raw email stored in campus_emails with analysis_status = 'failed'
    const { rows: emailRows1 } = await pool.query(
      'SELECT * FROM campus_emails WHERE user_id = $1 AND source_message_id = $2',
      [userId, msgId],
    );
    expect(emailRows1).toHaveLength(1);
    expect(emailRows1[0].analysis_status).toBe('failed');

    // CRITICAL: Must NOT be inserted into processed_gmail_messages so it remains recoverable!
    const { rows: procRows1 } = await pool.query(
      'SELECT * FROM processed_gmail_messages WHERE user_id = $1 AND gmail_message_id = $2',
      [userId, msgId],
    );
    expect(procRows1).toHaveLength(0);

    // Run 2: Immediate re-sync (simulating 5-min autosync inside 30-min cooldown)
    // AI and messages.get must NOT be called because of cooldown!
    mockGet.mockClear();
    aiSpy.mockClear();

    const res2 = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_user');

    expect(res2.status).toBe(200);
    expect(res2.body.skipped).toBe(1);
    expect(res2.body.newMessages).toBe(0);
    expect(mockGet).not.toHaveBeenCalled();
    expect(aiSpy).not.toHaveBeenCalled();

    // Run 3: Cooldown expires (simulate 31 minutes elapsed) -> Retry occurs and AI recovers!
    await pool.query(
      "UPDATE campus_emails SET updated_at = NOW() - INTERVAL '31 minutes' WHERE source_message_id = $1",
      [msgId],
    );

    aiSpy.mockResolvedValueOnce({
      title: 'Merit Scholarship Application 2026',
      summary: 'Apply for Merit Scholarship before 2026-11-20.',
      category: 'scholarship',
      priority: 'important',
      source: {
        provider: 'gmail',
        messageId: msgId,
        sender: 'scholarships@vit.ac.in',
        subject: 'Merit Scholarship Application 2026',
      },
    });

    const res3 = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_user');

    expect(res3.status).toBe(200);
    expect(aiSpy).toHaveBeenCalledTimes(1);
    expect(res3.body.processed).toBe(1);
    expect(res3.body.noticesCreated).toBe(1);

    // Verify campus_emails updated to completed
    const { rows: emailRows3 } = await pool.query(
      'SELECT * FROM campus_emails WHERE user_id = $1 AND source_message_id = $2',
      [userId, msgId],
    );
    expect(emailRows3).toHaveLength(1);
    expect(emailRows3[0].analysis_status).toBe('completed');

    // Verify processed_gmail_messages now records it
    const { rows: procRows3 } = await pool.query(
      'SELECT * FROM processed_gmail_messages WHERE user_id = $1 AND gmail_message_id = $2',
      [userId, msgId],
    );
    expect(procRows3).toHaveLength(1);

    // Verify notice created
    const { rows: noticeRows3 } = await pool.query(
      'SELECT * FROM notices WHERE source_message_id = $1',
      [msgId],
    );
    expect(noticeRows3).toHaveLength(1);

    // Run 4: Subsequent sync skips message without duplicating notice or re-calling AI
    aiSpy.mockClear();
    const res4 = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_user');

    expect(res4.status).toBe(200);
    expect(res4.body.skipped).toBe(1);
    expect(res4.body.noticesCreated).toBe(0);
    expect(aiSpy).not.toHaveBeenCalled();

    const { rows: noticeRows4 } = await pool.query(
      'SELECT * FROM notices WHERE source_message_id = $1',
      [msgId],
    );
    expect(noticeRows4).toHaveLength(1); // Still exactly 1 notice
  });

  it('6. reclassifyExistingCampusEmails retries AI first, updates success, and marks processed', async () => {
    const userId = 'user_student';
    const msgId = 'msg_stale_reclassify_1';

    // Insert an email in campus_emails that failed previous analysis
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, sender_email, subject,
        body_text, snippet, analysis_status, created_at, updated_at
      ) VALUES (
        $1, $2, 'student@vitstudent.ac.in', $3, 'placements@vit.ac.in',
        'Campus Placement Drive: Google',
        'Google placement drive scheduled on 2026-11-15.',
        'Google placement drive scheduled on 2026-11-15.',
        'failed', NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '40 minutes'
      )`,
      [randomUUID(), userId, msgId],
    );

    const aiSpy = vi.spyOn(noticeAnalyzerService, 'analyze').mockResolvedValueOnce({
      title: 'Campus Placement Drive: Google',
      summary: 'Google placement drive scheduled on 2026-11-15.',
      category: 'placement',
      priority: 'urgent',
      source: {
        provider: 'gmail',
        messageId: msgId,
        sender: 'placements@vit.ac.in',
        subject: 'Campus Placement Drive: Google',
      },
    });

    const stats = await reclassifyExistingCampusEmails(userId);
    expect(stats.reclassifiedCount).toBe(1);
    expect(aiSpy).toHaveBeenCalledTimes(1);

    // Verify campus_emails updated to completed
    const { rows: emailRows } = await pool.query(
      'SELECT * FROM campus_emails WHERE user_id = $1 AND source_message_id = $2',
      [userId, msgId],
    );
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0].analysis_status).toBe('completed');
    expect(emailRows[0].category).toBe('placement');

    // Verify marked as processed in processed_gmail_messages
    const { rows: procRows } = await pool.query(
      'SELECT * FROM processed_gmail_messages WHERE user_id = $1 AND gmail_message_id = $2',
      [userId, msgId],
    );
    expect(procRows).toHaveLength(1);
  });
});
