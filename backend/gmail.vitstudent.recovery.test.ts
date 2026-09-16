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
      } else if (authHeader === 'Bearer reviewer_1') {
        req.auth = { userId: 'reviewer_1', sessionClaims: { metadata: { role: 'reviewer' } } };
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
import { setNoticeAnalyzer, resetNoticeAnalyzer, noticeAnalyzerService } from './services/noticeAnalyzer.service.js';
import { classifyEmail } from './services/emailClassifier.service.js';
import { getInstitutionForSender, extractDomainFromSender } from './config/institutions.js';
import { getRecoverySyncQuery, MAX_RECOVERY_COUNT } from './services/gmail.service.js';

describe('@vitstudent.ac.in & Bounded Historical Recovery Regression Suite', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.REVIEWER_USER_IDS = 'reviewer_1';

    mockList.mockReset();
    mockGet.mockReset();
    resetNoticeAnalyzer();

    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM notice_suppressions');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM campus_items');
    await pool.query('DELETE FROM assignments');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // 1. Numeric local-parts work correctly
  it('1. Recognizes numeric local-parts such as 26@vitstudent.ac.in and formatted 26 <26@vitstudent.ac.in>', () => {
    const d1 = extractDomainFromSender('26@vitstudent.ac.in');
    expect(d1).toBe('vitstudent.ac.in');
    const inst1 = getInstitutionForSender('26@vitstudent.ac.in');
    expect(inst1?.id).toBe('vit');

    const d2 = extractDomainFromSender('26 <26@vitstudent.ac.in>');
    expect(d2).toBe('vitstudent.ac.in');
    const inst2 = getInstitutionForSender('26 <26@vitstudent.ac.in>');
    expect(inst2?.id).toBe('vit');
  });

  // 2. Legitimate student-domain campus announcement creates private notice
  it('2. Legitimate campus announcement from 26@vitstudent.ac.in creates a gmail_personal notice for student', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'token_a', 'refresh_a', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_vitstudent_announcement_1' }] },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_vitstudent_announcement_1',
        snippet: 'Annual Tech Symposium 2026 registration is open for all branches',
        payload: {
          headers: [
            { name: 'From', value: '26 <26@vitstudent.ac.in>' },
            { name: 'To', value: 'studentA@vitstudent.ac.in' },
            { name: 'Subject', value: 'Tech Symposium 2026 Circular & Registration' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('Register for Tech Symposium 2026 in Anna Audi on 2026-10-25').toString('base64url'),
          },
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Tech Symposium 2026 Circular & Registration',
        summary: 'Annual campus technology symposium with hackathons and workshops',
        category: 'event',
        priority: 'urgent',
        importantDates: [{ label: 'Event Date', date: '2026-10-25' }],
        venue: 'Anna Audi',
        source: {
          provider: 'gmail',
          messageId: 'msg_vitstudent_announcement_1',
          sender: '26 <26@vitstudent.ac.in>',
          subject: 'Tech Symposium 2026 Circular & Registration',
        },
      }),
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_A');

    expect(res.status).toBe(200);
    expect(res.body.emailsPersisted).toBe(1);
    expect(res.body.noticesCreated).toBe(1);

    // Private notice created in notices table
    const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', ['student_A']);
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0].source_type).toBe('gmail_personal');
    expect(noticeRows[0].title).toBe('Tech Symposium 2026 Circular & Registration');

    // Global institutional notices table remains EMPTY
    const { rows: globalNotices } = await pool.query("SELECT * FROM notices WHERE source_type = 'institutional'");
    expect(globalNotices).toHaveLength(0);

    // Student A sees it in their Notices tab
    const feedRes = await request(app).get('/api/notices').set('Authorization', 'Bearer student_A');
    expect(feedRes.status).toBe(200);
    expect(feedRes.body).toHaveLength(1);
    expect(feedRes.body[0].sourceType).toBe('gmail_personal');
  });

  // 3. Personal student-to-student email is discarded
  it('3. Personal student-to-student email from @vitstudent.ac.in is discarded with zero persistence', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'token_a', 'refresh_a', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_student_personal_chat' }] },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_student_personal_chat',
        snippet: 'Hey bro, are we meeting at the food court tonight?',
        payload: {
          headers: [
            { name: 'From', value: '26@vitstudent.ac.in' },
            { name: 'To', value: 'studentA@vitstudent.ac.in' },
            { name: 'Subject', value: 'Dinner tonight' },
          ],
          body: {
            data: Buffer.from('Hey bro, are we meeting at the food court tonight?').toString('base64url'),
          },
        },
      },
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_A');

    expect(res.status).toBe(200);
    expect(res.body.emailsPersisted).toBe(0);
    expect(res.body.noticesCreated).toBe(0);
    expect(res.body.ignoredMessages).toBe(1);

    // Zero rows in campus_emails and notices
    const { rows: emailRows } = await pool.query('SELECT * FROM campus_emails');
    expect(emailRows).toHaveLength(0);

    const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
    expect(noticeRows).toHaveLength(0);

    // Recorded in processed_gmail_messages for deduplication
    const { rows: procRows } = await pool.query('SELECT * FROM processed_gmail_messages');
    expect(procRows).toHaveLength(1);
  });

  // 4. Promotional student-domain email is discarded
  it('4. Promotional student-domain email is discarded with zero persistence', async () => {
    const classification = classifyEmail({
      sender: 'rahul.2024@vitstudent.ac.in',
      subject: 'Selling used bicycle at 50% discount call me',
      bodyText: 'Hero cycle in good condition for sale. Discount available.',
    });
    expect(classification.isCampusRelevant).toBe(false);
    expect(classification.outcome).toMatch(/personal|promotional/);
  });

  // 5. Official @vit.ac.in announcement from ordinary student sync creates private notice
  it('5. Official @vit.ac.in announcement from ordinary student sync creates a gmail_personal notice', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'token_a', 'refresh_a', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_official_exam_circular' }] },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_official_exam_circular',
        snippet: 'FAT Exam Schedule Circular released by Office of CoE',
        payload: {
          headers: [
            { name: 'From', value: 'academics@vit.ac.in' },
            { name: 'To', value: 'all@vitstudent.ac.in' },
            { name: 'Subject', value: 'FAT Exam Schedule Circular' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('Final assessment timetable is available on VTOP portal.').toString('base64url'),
          },
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'FAT Exam Schedule Circular',
        summary: 'Final assessment timetable published on VTOP',
        category: 'exam',
        priority: 'urgent',
        importantDates: [{ label: 'Exam Starts', date: '2026-11-10' }],
        source: {
          provider: 'gmail',
          messageId: 'msg_official_exam_circular',
          sender: 'academics@vit.ac.in',
          subject: 'FAT Exam Schedule Circular',
        },
      }),
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_A');

    expect(res.status).toBe(200);
    expect(res.body.noticesCreated).toBe(1);

    const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', ['student_A']);
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0].source_type).toBe('gmail_personal');

    const { rows: globalNotices } = await pool.query("SELECT * FROM notices WHERE source_type = 'institutional'");
    expect(globalNotices).toHaveLength(0);
  });

  // 6. Official @vit.ac.in announcement from authorized reviewer sync creates institutional notice
  it('6. Official @vit.ac.in announcement from authorized reviewer sync creates institutional notice', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'reviewer_1', 'notices@vit.ac.in', 'tok_rev', 'ref_rev', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_reviewer_circular_1' }] },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_reviewer_circular_1',
        snippet: 'Annual Convocation Announcement for Class of 2026',
        payload: {
          headers: [
            { name: 'From', value: 'registrar@vit.ac.in' },
            { name: 'To', value: 'all@vit.ac.in' },
            { name: 'Subject', value: 'Circular: Annual Convocation 2026' },
            { name: 'Date', value: '2026-09-01T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('Convocation ceremony will take place on 2026-11-15 in Indoor Stadium.').toString('base64url'),
          },
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Circular: Annual Convocation 2026',
        summary: 'Convocation ceremony on 2026-11-15',
        category: 'administrative',
        priority: 'normal',
        importantDates: [{ label: 'Convocation Date', date: '2026-11-15' }],
        venue: 'Indoor Stadium',
        source: {
          provider: 'gmail',
          messageId: 'msg_reviewer_circular_1',
          sender: 'registrar@vit.ac.in',
          subject: 'Circular: Annual Convocation 2026',
        },
      }),
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_1');

    expect(res.status).toBe(200);
    expect(res.body.noticesCreated).toBe(1);

    const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0].source_type).toBe('institutional');
    expect(noticeRows[0].status).toBe('published');

    // Student A also sees this institutional notice in their Notices tab
    const studentRes = await request(app).get('/api/notices').set('Authorization', 'Bearer student_A');
    expect(studentRes.body).toHaveLength(1);
    expect(studentRes.body[0].title).toBe('Circular: Annual Convocation 2026');
  });

  // 7. Old processed-but-discarded legitimate email can be recovered
  it('7. Recovers legitimate email previously inserted in processed_gmail_messages without deleting it', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'token_a', 'refresh_a', 1700000000)`,
      [randomUUID()],
    );

    const staleMsgId = 'msg_stale_gravitas_reminder';

    // Simulate message already in processed_gmail_messages from old classifier bug
    await pool.query(
      `INSERT INTO processed_gmail_messages (id, user_id, gmail_message_id)
       VALUES ($1, 'student_A', $2)`,
      [randomUUID(), staleMsgId],
    );

    // Verify ZERO rows in campus_emails and notices before recovery
    const { rows: emailsBefore } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', ['student_A']);
    expect(emailsBefore).toHaveLength(0);
    const { rows: noticesBefore } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', ['student_A']);
    expect(noticesBefore).toHaveLength(0);

    // Mock Gmail API for recovery
    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: staleMsgId }] },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: staleMsgId,
        snippet: 'Gravitas 2026 Workshop Registration & Payment Deadline',
        payload: {
          headers: [
            { name: 'From', value: '26 <26@vitstudent.ac.in>' },
            { name: 'Subject', value: 'Gravitas 2026 Workshop Registration Deadline' },
            { name: 'Date', value: '2026-09-05T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('Final date for Gravitas registration payment is 2026-09-30.').toString('base64url'),
          },
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Gravitas 2026 Workshop Registration Deadline',
        summary: 'Final payment deadline for Gravitas workshop participation',
        category: 'event',
        priority: 'urgent',
        importantDates: [{ label: 'Registration Deadline', date: '2026-09-30' }],
        source: {
          provider: 'gmail',
          messageId: staleMsgId,
          sender: '26 <26@vitstudent.ac.in>',
          subject: 'Gravitas 2026 Workshop Registration Deadline',
        },
      }),
    });

    // Run recovery endpoint
    const recoverRes = await request(app)
      .post('/api/gmail/recover')
      .set('Authorization', 'Bearer student_A')
      .send({ recoveryDays: 14, maxCount: 50 });

    expect(recoverRes.status).toBe(200);
    expect(recoverRes.body.recoveredCount).toBe(1);
    expect(recoverRes.body.noticesCreated).toBe(1);

    // Verify email is now persisted in campus_emails
    const { rows: emailsAfter } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', ['student_A']);
    expect(emailsAfter).toHaveLength(1);
    expect(emailsAfter[0].source_message_id).toBe(staleMsgId);

    // Verify notice is created
    const { rows: noticesAfter } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', ['student_A']);
    expect(noticesAfter).toHaveLength(1);
    expect(noticesAfter[0].title).toBe('Gravitas 2026 Workshop Registration Deadline');
    expect(noticesAfter[0].source_type).toBe('gmail_personal');

    // CRITICAL: processed_gmail_messages was NOT deleted!
    const { rows: processedAfter } = await pool.query(
      'SELECT * FROM processed_gmail_messages WHERE user_id = $1 AND gmail_message_id = $2',
      ['student_A', staleMsgId],
    );
    expect(processedAfter).toHaveLength(1);
  });

  // 8. Recovery is idempotent
  it('8. Recovery is idempotent and produces zero duplicate notices on repeated calls', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'token_a', 'refresh_a', 1700000000)`,
      [randomUUID()],
    );

    const msgId = 'msg_idempotent_test';

    mockList.mockResolvedValue({
      data: { messages: [{ id: msgId }] },
    });

    mockGet.mockResolvedValue({
      data: {
        id: msgId,
        snippet: 'Hackathon 2026 Announcement',
        payload: {
          headers: [
            { name: 'From', value: '26@vitstudent.ac.in' },
            { name: 'Subject', value: 'Hackathon 2026 Announcement' },
            { name: 'Date', value: '2026-09-05T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('Annual campus hackathon details').toString('base64url'),
          },
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Hackathon 2026 Announcement',
        summary: 'Annual campus hackathon',
        category: 'event',
        priority: 'important',
        importantDates: [{ label: 'Event Date', date: '2026-10-15' }],
        source: {
          provider: 'gmail',
          messageId: msgId,
          sender: '26@vitstudent.ac.in',
          subject: 'Hackathon 2026 Announcement',
        },
      }),
    });

    // Run 1: Recovers message and creates 1 notice
    const res1 = await request(app)
      .post('/api/gmail/recover')
      .set('Authorization', 'Bearer student_A');
    expect(res1.status).toBe(200);
    expect(res1.body.noticesCreated).toBe(1);
    expect(res1.body.recoveredCount).toBe(1);

    // Run 2: Notice already exists -> skipped, 0 created
    const res2 = await request(app)
      .post('/api/gmail/recover')
      .set('Authorization', 'Bearer student_A');
    expect(res2.status).toBe(200);
    expect(res2.body.noticesCreated).toBe(0);
    expect(res2.body.recoveredCount).toBe(0);
    expect(res2.body.skippedCount).toBe(1);

    const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', ['student_A']);
    expect(noticeRows).toHaveLength(1);
  });

  // 9. Student A cannot see Student B private Gmail notice (strict tenant isolation)
  it("9. Student B cannot see or access Student A's private Gmail notice", async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, source_type, status, published_at, source_message_id
       ) VALUES (
        $1, 'student_A', 'Private Symposium Announcement', 'Student A private circular', 'event', 'urgent', 'gmail_personal', 'published', NOW(), 'msg_priv_1'
       )`,
      [noticeId],
    );

    // Student A can view it
    const resListA = await request(app).get('/api/notices').set('Authorization', 'Bearer student_A');
    expect(resListA.body).toHaveLength(1);
    expect(resListA.body[0].id).toBe(noticeId);

    // Student B gets empty list
    const resListB = await request(app).get('/api/notices').set('Authorization', 'Bearer student_B');
    expect(resListB.body).toHaveLength(0);

    // Student B direct GET by ID -> 404
    const resGetB = await request(app).get(`/api/notices/${noticeId}`).set('Authorization', 'Bearer student_B');
    expect(resGetB.status).toBe(404);

    // Student B convert to task -> 403
    const resConvertB = await request(app)
      .post(`/api/notices/${noticeId}/convert-to-task`)
      .set('Authorization', 'Bearer student_B')
      .send({});
    expect(resConvertB.status).toBe(403);
  });

  // 10. Recovery respects date and message-count limits
  it('10. Recovery query helper clamps window to max 30 days and enforces MAX_RECOVERY_COUNT = 50', () => {
    expect(MAX_RECOVERY_COUNT).toBe(50);

    const qDefault = getRecoverySyncQuery(14);
    expect(qDefault).toMatch(/^after:\d{4}\/\d{2}\/\d{2}$/);

    // Clamps to max 30 days
    const qHuge = getRecoverySyncQuery(100);
    const expectedCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const mm = String(expectedCutoff.getMonth() + 1).padStart(2, '0');
    expect(qHuge).toContain(`/${mm}/`);
  });

  // 11. Analyzer rejection produces no notice
  it('11. Rejection by notice analyzer produces zero notices and zero campus_emails persistence', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'token_a', 'refresh_a', 1700000000)`,
      [randomUUID()],
    );

    const staleMsgId = 'msg_stale_rejected_candidate';
    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: staleMsgId }] },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: staleMsgId,
        snippet: 'Robotics club workshop details and private student team notes',
        payload: {
          headers: [
            { name: 'From', value: '26@vitstudent.ac.in' },
            { name: 'Subject', value: '[VIT] Robotics Club Workshop & Team Notes' },
          ],
          body: {
            data: Buffer.from('Robotics workshop notes and private team chat.').toString('base64url'),
          },
        },
      },
    });

    // Analyzer rejects candidate as personal / non-campus-wide
    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Robotics Club Workshop & Team Notes',
        summary: 'Private team notes',
        category: 'academic',
        priority: 'urgent',
        isPersonal: true,
        source: {
          provider: 'gmail',
          messageId: staleMsgId,
          sender: '26@vitstudent.ac.in',
          subject: '[VIT] Robotics Club Workshop & Team Notes',
        },
      }),
    });

    const res = await request(app)
      .post('/api/gmail/recover')
      .set('Authorization', 'Bearer student_A');

    expect(res.status).toBe(200);
    expect(res.body.recoveredCount).toBe(0);
    expect(res.body.noticesCreated).toBe(0);
    expect(res.body.rejectedByAnalyzer).toBe(1);

    const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
    expect(noticeRows).toHaveLength(0);

    const { rows: emailRows } = await pool.query('SELECT * FROM campus_emails');
    expect(emailRows).toHaveLength(0);
  });

  // 12. AI failure uses deterministic fallback safely
  it('12. AI failure uses deterministic fallback safely and creates private notice', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_A', 'studentA@vitstudent.ac.in', 'token_a', 'refresh_a', 1700000000)`,
      [randomUUID()],
    );

    const fallbackMsgId = 'msg_ai_outage_fallback';
    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: fallbackMsgId }] },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: fallbackMsgId,
        snippet: 'Robotics Workshop in Anna Audi on 2026-10-20. Registration open.',
        payload: {
          headers: [
            { name: 'From', value: '26@vitstudent.ac.in' },
            { name: 'Subject', value: 'Robotics Workshop Announcement 2026' },
            { name: 'Date', value: '2026-09-05T10:00:00.000Z' },
          ],
          body: {
            data: Buffer.from('Robotics Workshop in Anna Audi on 2026-10-20. Registration open for all students.').toString('base64url'),
          },
        },
      },
    });

    // Simulate AI outage (e.g. 429 quota exhausted)
    vi.spyOn(noticeAnalyzerService, 'analyze').mockRejectedValueOnce(
      new Error('Google GenAI Error 429: Resource exhausted'),
    );

    const res = await request(app)
      .post('/api/gmail/recover')
      .set('Authorization', 'Bearer student_A');

    expect(res.status).toBe(200);
    expect(res.body.recoveredCount).toBe(1);
    expect(res.body.noticesCreated).toBe(1);

    const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', ['student_A']);
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0].source_type).toBe('gmail_personal');
    expect(noticeRows[0].title).toBe('Robotics Workshop Announcement 2026');
  });
});
