import { describe, it, expect, vi, beforeEach } from 'vitest';
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
            data: { emailAddress: 'reviewer@vit.ac.in' },
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
      if (authHeader === 'Bearer reviewer_user') {
        req.auth = { userId: 'reviewer_user', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer student_user' || authHeader === 'Bearer student_A') {
        req.auth = { userId: 'student_A', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer student_B') {
        req.auth = { userId: 'student_B', sessionClaims: { metadata: { role: 'student' } } };
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

import { app } from './index.js';
import { pool } from './db.js';
import { setNoticeAnalyzer, resetNoticeAnalyzer } from './services/noticeAnalyzer.service.js';

describe('Production Bug Reproduction & Security Regression Suite', () => {
  beforeEach(async () => {
    mockList.mockReset();
    mockGet.mockReset();
    vi.clearAllMocks();
    resetNoticeAnalyzer();
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM gmail_connections');
  });

  it('E2E Production Pipeline: Prior sync -> new relevant email -> notice created, published & visible via API', async () => {
    // 1. Establish a successful previous Gmail sync state
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'reviewer_user', 'reviewer@vit.ac.in', 'token_rev', 'refresh_rev', 1700000000)`,
      [randomUUID()],
    );

    // Existing sync state: 'msg_prev_sync' was already processed previously
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, sender_email, subject,
        body_text, snippet, analysis_status, created_at, updated_at
      ) VALUES (
        $1, 'reviewer_user', 'reviewer@vit.ac.in', 'msg_prev_sync', 'dean@vit.ac.in',
        'Previous Academic Circular', 'Previous body', 'Previous snippet', 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [randomUUID()],
    );
    await pool.query(
      `INSERT INTO processed_gmail_messages (id, user_id, gmail_message_id)
       VALUES ($1, 'reviewer_user', 'msg_prev_sync')`,
      [randomUUID()],
    );

    // 2. Simulate a new relevant Gmail email arriving afterward
    mockList.mockResolvedValueOnce({
      data: {
        messages: [
          { id: 'msg_prev_sync' },
          { id: 'msg_new_academic_relevant' },
        ],
      },
    });

    mockGet.mockImplementation(({ id }: { id: string }) => {
      if (id === 'msg_new_academic_relevant') {
        return Promise.resolve({
          data: {
            id: 'msg_new_academic_relevant',
            snippet: 'All students interested in branch transfer must submit preferences before September 28, 2026.',
            internalDate: '1700005000000',
            payload: {
              headers: [
                { name: 'From', value: 'Admissions & Registration <admissions@vit.ac.in>' },
                { name: 'Subject', value: 'B.Tech Branch Transfer and Course Registration 2026' },
              ],
            },
          },
        });
      }
      return Promise.reject(new Error('Unexpected message get'));
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'B.Tech Branch Transfer and Course Registration 2026',
        summary: 'All students interested in branch transfer must submit preferences before September 28, 2026.',
        category: 'admission',
        priority: 'important',
        isCampusWide: true,
        audience: 'All B.Tech Students',
        importantDates: [{ label: 'Preference Deadline', date: '2026-09-28' }],
        actionRequired: 'Submit preference form on student portal',
        source: {
          provider: 'gmail',
          messageId: 'msg_new_academic_relevant',
          sender: 'Admissions & Registration <admissions@vit.ac.in>',
          subject: 'B.Tech Branch Transfer and Course Registration 2026',
        },
      }),
    });

    // 3. Run the sync/processing path
    const syncRes = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_user');

    expect(syncRes.status).toBe(200);

    // 4. Verify the new message is fetched
    expect(syncRes.body.checked).toBe(2);
    expect(syncRes.body.skipped).toBe(1);
    expect(syncRes.body.newMessages).toBe(1);

    // 5. Verify it passes academic classification
    expect(syncRes.body.relevantAcademicMessages).toBe(1);
    expect(syncRes.body.ignoredMessages).toBe(0);

    // 6. Verify campus_emails persistence/update
    const { rows: emailRows } = await pool.query(
      "SELECT * FROM campus_emails WHERE source_message_id = 'msg_new_academic_relevant'",
    );
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0].analysis_status).toBe('completed');
    expect(emailRows[0].category).toBe('admission');

    // 7. Verify notice creation
    expect(syncRes.body.noticesCreated).toBe(1);
    const { rows: noticeRows } = await pool.query(
      "SELECT * FROM notices WHERE source_message_id = 'msg_new_academic_relevant'",
    );
    expect(noticeRows).toHaveLength(1);

    // 8. Verify notice publication/visibility
    expect(noticeRows[0].status).toBe('published');

    // 9. Verify the notice is returned to the authenticated student through the notices API
    const studentNoticesRes = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer student_user');

    expect(studentNoticesRes.status).toBe(200);
    const foundNotice = studentNoticesRes.body.find(
      (n: { sourceMessageId: string }) => n.sourceMessageId === 'msg_new_academic_relevant',
    );
    expect(foundNotice).toBeDefined();
    expect(foundNotice.title).toBe('B.Tech Branch Transfer and Course Registration 2026');
    expect(foundNotice.category).toBe('admission');
  });

  it('Negative Case: Newly arrived personal/non-academic email must not become a campus notice', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_A', 'student@vitstudent.ac.in', 'token_stud', 'refresh_stud', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: {
        messages: [{ id: 'msg_personal_cert' }],
      },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_personal_cert',
        snippet: 'Dear Candidate [24BIT0099], upload missing 12th mark list for verification.',
        internalDate: '1700006000000',
        payload: {
          headers: [
            { name: 'From', value: 'Admissions Office <admissions@vit.ac.in>' },
            { name: 'Subject', value: 'Fresher - Certificate Verification' },
          ],
        },
      },
    });

    const syncRes = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_user');

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.ignoredMessages).toBe(1);
    expect(syncRes.body.relevantAcademicMessages).toBe(0);
    expect(syncRes.body.noticesCreated).toBe(0);

    const { rows: emailRows } = await pool.query(
      "SELECT * FROM campus_emails WHERE source_message_id = 'msg_personal_cert'",
    );
    expect(emailRows).toHaveLength(0);

    const { rows: processedRows } = await pool.query(
      "SELECT * FROM processed_gmail_messages WHERE gmail_message_id = 'msg_personal_cert'",
    );
    expect(processedRows).toHaveLength(1);

    const { rows: noticeRows } = await pool.query(
      "SELECT * FROM notices WHERE source_message_id = 'msg_personal_cert'",
    );
    expect(noticeRows).toHaveLength(0);

    const studentNoticesRes = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer student_user');

    const foundNotice = studentNoticesRes.body.find(
      (n: { sourceMessageId: string }) => n.sourceMessageId === 'msg_personal_cert',
    );
    expect(foundNotice).toBeUndefined();
  });

  it('Multi-User Notice Conversion Isolation: Student A converts Notice -> Student B sees unconverted & can convert', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_provider, source_account_email, published_at, created_at, updated_at
      ) VALUES (
        $1, 'reviewer_user', 'Annual Research Symposium 2026', 'Submit papers', 'event', 'medium', 'published',
        'gmail', 'reviewer@vit.ac.in', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [noticeId],
    );

    // Student A converts notice to task
    const convertARes = await request(app)
      .post(`/api/notices/${noticeId}/convert-to-task`)
      .set('Authorization', 'Bearer student_A')
      .send({ dueDate: '2026-10-15', title: 'Submit symposium paper' });

    expect(convertARes.status).toBe(201);
    expect(convertARes.body.alreadyConverted).toBe(false);
    expect(convertARes.body.task).toBeDefined();
    expect(convertARes.body.notice.isConverted).toBe(true);
    const taskAId = convertARes.body.task.id;

    // Student B views notice: MUST see unconverted!
    const noticeForBRes = await request(app)
      .get(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer student_B');

    expect(noticeForBRes.status).toBe(200);
    expect(noticeForBRes.body.isConverted).toBe(false);
    expect(noticeForBRes.body.convertedToTaskId).toBeNull();

    // Student B converts the same notice: MUST succeed and create separate task
    const convertBRes = await request(app)
      .post(`/api/notices/${noticeId}/convert-to-task`)
      .set('Authorization', 'Bearer student_B')
      .send({ dueDate: '2026-10-15', title: 'Symposium paper B' });

    expect(convertBRes.status).toBe(201);
    expect(convertBRes.body.alreadyConverted).toBe(false);
    expect(convertBRes.body.task.id).not.toBe(taskAId);

    // Verify tasks are isolated in assignments table
    const tasksARes = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer student_A');
    expect(tasksARes.body).toHaveLength(1);
    expect(tasksARes.body[0].id).toBe(taskAId);

    const tasksBRes = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer student_B');
    expect(tasksBRes.body).toHaveLength(1);
    expect(tasksBRes.body[0].id).toBe(convertBRes.body.task.id);
  });

  it('Task Source Email Ownership: User B cannot create task referencing User A source email', async () => {
    // User A has an email in campus_emails
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, sender_email, subject,
        body_text, snippet, analysis_status, created_at, updated_at
      ) VALUES (
        $1, 'student_A', 'studentA@vitstudent.ac.in', 'msg_secret_user_a', 'prof@vit.ac.in',
        'Confidential Project Grade', 'Private details', 'Private details', 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [randomUUID()],
    );

    // User B attempts to create a task referencing User A's source_message_id
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_B')
      .send({
        title: 'Unauthorized Task',
        source: 'gmail',
        sourceId: 'msg_secret_user_a',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('access denied');
  });

  it('Optional Task Deadline: Creating a task with empty dueDate succeeds without date invention', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer student_A')
      .send({
        title: 'Review notes with no fixed deadline',
        description: 'Self-paced review',
        dueDate: '',
        priority: 'low',
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Review notes with no fixed deadline');
    expect(res.body.dueDate).toBe('');
  });

  it('Scoped Notice Deadline Reminders: Student B does not receive reminders for Student A private notice', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().split('T')[0];

    // Student A creates a private notice with upcoming deadline
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status,
        source_provider, source_account_email, important_dates, published_at, created_at, updated_at
      ) VALUES (
        $1, 'student_A', 'Private Project Milestone', 'Milestone summary', 'academic', 'urgent', 'published',
        'gmail', 'studentA@vitstudent.ac.in', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [
        randomUUID(),
        JSON.stringify([{ label: 'Submission', date: tomorrowIso }]),
      ],
    );

    // Student B requests notifications
    const notifRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer student_B');

    expect(notifRes.status).toBe(200);
    const notifications = notifRes.body.notifications || [];
    const reminders = notifications.filter(
      (n: { title: string }) => n.title.includes('Private Project Milestone'),
    );
    expect(reminders).toHaveLength(0);
  });
});
