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

// Mock auth before importing app
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }, _res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer reviewer_user') {
        req.auth = { userId: 'reviewer_user', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer student_user') {
        req.auth = { userId: 'student_user', sessionClaims: { metadata: { role: 'student' } } };
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
import { classifyEmail } from './services/emailClassifier.service.js';
import { setNoticeAnalyzer, resetNoticeAnalyzer } from './services/noticeAnalyzer.service.js';
import { reclassifyExistingCampusEmails } from './services/gmail.service.js';

describe('Academic Gmail Pipeline & Deadline Generation Regression Suite (12 Scenarios)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetNoticeAnalyzer();
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM gmail_connections');
  });

  // Scenario 1: Accurate classification separating academic university announcements from personal/promotional
  it('1. Accurate classification separating academic announcements from personal and promotional emails', () => {
    const academic1 = classifyEmail({
      from: "'Dean Academic Research' <dean.ar@vit.ac.in>",
      subject: 'Claim for Dr. APJ Abdul Kalam Award for August 2026 - reg',
      bodyText: 'Submit claim before September 20, 2026.',
    });
    expect(academic1.isAcademic).toBe(true);
    expect(academic1.isPersonal).toBe(false);
    expect(academic1.category).toBe('scholarship');

    const promo1 = classifyEmail({
      from: 'ASICS Online Store <news@asics.co.in>',
      subject: 'Flash Sale: 40% off on running shoes!',
      bodyText: 'Limited time offer, click here.',
    });
    expect(promo1.isAcademic).toBe(false);
    expect(promo1.isPromotionalOrNewsletter).toBe(true);
  });

  // Scenario 2: Personal promotional email is ignored and never creates tasks or notices
  it('2. Personal promotional email (Asics, Quora, Indeed, Substack) is ignored and never creates tasks', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_promo_asics' }] },
    });
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_promo_asics',
        snippet: 'Your order is confirmed and shipping soon',
        payload: {
          headers: [
            { name: 'From', value: 'orders@asics.co.in' },
            { name: 'Subject', value: 'Order Confirmed: Gel-Kayano 30' },
          ],
        },
      },
    });

    const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');
    expect(res.status).toBe(200);
    expect(res.body.ignoredMessages).toBe(1);
    expect(res.body.relevantAcademicMessages).toBe(0);
    expect(res.body.tasksGenerated).toBe(0);

    const { rows: emailRows } = await pool.query('SELECT * FROM campus_emails WHERE source_message_id = $1', ['msg_promo_asics']);
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0].analysis_status).toBe('ignored_personal');

    const { rows: taskRows } = await pool.query('SELECT * FROM assignments');
    expect(taskRows).toHaveLength(0);
  });

  // Scenario 3: Personal verification notice is ignored for students
  it('3. Personal verification notice (Fresher - Certificate Verification) is ignored for students', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_fresher_cert' }] },
    });
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_fresher_cert',
        snippet: 'Dear Candidate, please upload your missing 12th marksheet for verification.',
        payload: {
          headers: [
            { name: 'From', value: 'VIT <no-reply@vit.ac.in>' },
            { name: 'Subject', value: 'Fresher - Certificate Verification' },
          ],
        },
      },
    });

    const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');
    expect(res.status).toBe(200);
    expect(res.body.ignoredMessages).toBe(1);
    expect(res.body.tasksGenerated).toBe(0);
    expect(res.body.noticesCreated).toBe(0);

    const { rows: emailRows } = await pool.query('SELECT * FROM campus_emails WHERE source_message_id = $1', ['msg_fresher_cert']);
    expect(emailRows[0].analysis_status).toBe('ignored_personal');
  });

  // Scenario 4: Casual student conversation is ignored
  it('4. Casual student conversation (Selling cycle, lunch today) is ignored', () => {
    const casual = classifyEmail({
      from: 'alex@vitstudent.ac.in',
      subject: 'Selling my cycle - urgent need cash',
      bodyText: 'Hero sprint cycle in great condition.',
    });
    expect(casual.isAcademic).toBe(false);
    expect(casual.isPersonal).toBe(true);
  });

  // Scenario 5: Official university email with deadline persists in campus_emails (never auto-task)
  it('5. Official university email with deadline persists in campus_emails (never auto-task)', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_kalam_award' }] },
    });
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_kalam_award',
        snippet: 'Submit your claim form for Dr. APJ Abdul Kalam Award before September 20, 2026.',
        payload: {
          headers: [
            { name: 'From', value: "'Dean Academic Research' <dean.ar@vit.ac.in>" },
            { name: 'Subject', value: 'Claim for Dr. APJ Abdul Kalam Award for August 2026 - reg' },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Claim for Dr. APJ Abdul Kalam Award for August 2026',
        summary: 'Submit your research claims before deadline.',
        category: 'scholarship',
        priority: 'important',
        actionRequired: 'Submit claim form via Google Form',
        importantDates: [{ label: 'Submission Deadline', date: 'September 20, 2026' }],
        source: {
          provider: 'gmail',
          messageId: 'msg_kalam_award',
          sender: 'dean.ar@vit.ac.in',
          subject: 'Claim for Dr. APJ Abdul Kalam Award',
        },
      }),
    });

    const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');
    expect(res.status).toBe(200);
    expect(res.body.relevantAcademicMessages).toBe(1);
    expect(res.body.tasksGenerated).toBe(0); // Zero auto-generated tasks
    expect(res.body.noticesCreated).toBe(0); // Zero global notices for student

    // Verify zero tasks were auto-created in assignments table
    const { rows: taskRowsBefore } = await pool.query("SELECT * FROM assignments WHERE user_id = 'student_user'");
    expect(taskRowsBefore).toHaveLength(0);

    // Verify email was persisted in campus_emails with analysis
    const { rows: emailRows } = await pool.query("SELECT * FROM campus_emails WHERE user_id = 'student_user'");
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0].subject).toBe('Claim for Dr. APJ Abdul Kalam Award for August 2026 - reg');
    expect(emailRows[0].analysis_status).toBe('completed');
  });

  // Scenario 6: Student mailbox sync NEVER creates public notices (privacy guarantee)
  it('6. Student mailbox sync never creates public notices in notices table', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_student_confidential' }] },
    });
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_student_confidential',
        snippet: 'Campus hackathon details',
        payload: {
          headers: [
            { name: 'From', value: 'director.sw@vit.ac.in' },
            { name: 'Subject', value: 'Workshop on Power BI' },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Workshop on Power BI',
        summary: 'Hands-on training session',
        category: 'event',
        priority: 'normal',
        isCampusWide: true,
        isPersonal: false,
        source: {
          provider: 'gmail',
          messageId: 'msg_student_confidential',
          sender: 'director.sw@vit.ac.in',
          subject: 'Workshop on Power BI',
        },
      }),
    });

    const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');
    expect(res.status).toBe(200);
    expect(res.body.noticesCreated).toBe(0);

    const { rows: notices } = await pool.query('SELECT * FROM notices');
    expect(notices).toHaveLength(0);
  });

  // Scenario 7: Reviewer mailbox sync with circular creates published notice
  it('7. Reviewer mailbox sync with academic circular creates published notice in notices table', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'reviewer_user', 'reviewer@vit.ac.in', 'token_rev', 'refresh_rev', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_rev_exam_circular' }] },
    });
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_rev_exam_circular',
        snippet: 'Winter semester FAT schedule published',
        payload: {
          headers: [
            { name: 'From', value: 'coe@vit.ac.in' },
            { name: 'Subject', value: 'FAT Examination Schedule 2026' },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'FAT Examination Schedule 2026',
        summary: 'Final assessment test timetable for all branches',
        category: 'exam',
        priority: 'urgent',
        isCampusWide: true,
        isPersonal: false,
        source: {
          provider: 'gmail',
          messageId: 'msg_rev_exam_circular',
          sender: 'coe@vit.ac.in',
          subject: 'FAT Examination Schedule 2026',
        },
      }),
    });

    const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer reviewer_user');
    expect(res.status).toBe(200);
    expect(res.body.noticesCreated).toBe(1);

    const { rows: notices } = await pool.query('SELECT * FROM notices WHERE source_message_id = $1', ['msg_rev_exam_circular']);
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe('FAT Examination Schedule 2026');
    expect(notices[0].status).toBe('published');
  });

  // Scenario 8: Re-syncing the same academic email deduplicates (no duplicate tasks)
  it('8. Re-syncing the same academic email deduplicates in processed_gmail_messages and assignments', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValue({
      data: { messages: [{ id: 'msg_dedup_test' }] },
    });
    mockGet.mockResolvedValue({
      data: {
        id: 'msg_dedup_test',
        snippet: 'Midterm project submission on 2026-09-25',
        payload: {
          headers: [
            { name: 'From', value: 'professor@vit.ac.in' },
            { name: 'Subject', value: 'Midterm Project Submission' },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Midterm Project Submission',
        summary: 'Upload project zip file before deadline.',
        category: 'assignment',
        priority: 'important',
        importantDates: [{ label: 'Submission Due', date: '2026-09-25' }],
        source: {
          provider: 'gmail',
          messageId: 'msg_dedup_test',
          sender: 'professor@vit.ac.in',
          subject: 'Midterm Project Submission',
        },
      }),
    });

    // 1st sync
    const res1 = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');
    expect(res1.body.emailsPersisted).toBe(1);
    expect(res1.body.tasksGenerated).toBe(0);

    // 2nd sync
    const res2 = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');
    expect(res2.body.skipped).toBe(1);
    expect(res2.body.tasksGenerated).toBe(0);

    const { rows: emailRows } = await pool.query("SELECT * FROM campus_emails WHERE source_message_id = 'msg_dedup_test'");
    expect(emailRows).toHaveLength(1);
  });

  // Scenario 9: Groq fallback model executes properly when Gemini fails
  it('9. Groq fallback model executes properly when Gemini fails with quota exhausted', async () => {
    const originalFetch = global.fetch;
    try {
      process.env.GROQ_API_KEY = 'mock_groq_key';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('api.groq.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      title: 'CAT 1 Examination Seating',
                      summary: 'Seating matrix released on intranet',
                      category: 'exam',
                      priority: 'urgent',
                      audience: null,
                      importantDates: [{ label: 'Exam Date', date: '2026-09-28' }],
                      actionRequired: 'Check your seating room on VTOP',
                      venue: 'SJT Block',
                      links: [],
                      documents: [],
                      isCampusWide: true,
                      isPersonal: false,
                    }),
                  },
                },
              ],
            }),
          };
        }
        return originalFetch(url);
      });

      const { AINoticeAnalyzer } = await import('./services/noticeAnalyzer.service.js');
      const analyzer = new AINoticeAnalyzer();
      // Force Gemini to throw
      vi.spyOn(analyzer as unknown as { analyzeWithGemini: () => Promise<never> }, 'analyzeWithGemini').mockRejectedValue(new Error('Gemini 429 quota exhausted'));

      const result = await analyzer.analyze({
        id: 'msg_cat_exam',
        threadId: 'thread_1',
        sender: 'examcell@vit.ac.in',
        recipient: 'student@vitstudent.ac.in',
        subject: 'CAT 1 Examination Seating',
        date: '2026-09-08',
        bodyText: 'CAT 1 exam seating matrix is available on VTOP intranet.',
        snippet: 'CAT 1 exam seating',
        sourceMessageId: 'msg_cat_exam',
      });

      expect(result.title).toBe('CAT 1 Examination Seating');
      expect(result.category).toBe('exam');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Scenario 10: Heuristic extraction fallback succeeds when both AI providers fail/timeout
  it('10. Heuristic extraction fallback succeeds deterministically when both AI providers fail', async () => {
    const { extractHeuristicCandidate } = await import('./services/noticeAnalyzer.service.js');
    const heuristic = extractHeuristicCandidate({
      id: 'msg_kalam_fallback',
      threadId: 'thread_kalam',
      sender: "'Dean Academic Research' <dean.ar@vit.ac.in>",
      recipient: 'student@vitstudent.ac.in',
      subject: 'Claim for Dr. APJ Abdul Kalam Award for August 2026 - reg',
      date: '2026-09-08',
      bodyText: 'Submit claim before September 20, 2026. For details visit https://vit.ac.in/research.',
      snippet: 'Submit claim before September 20, 2026.',
      sourceMessageId: 'msg_kalam_fallback',
    });

    expect(heuristic.title).toBe('Claim for Dr. APJ Abdul Kalam Award for August 2026 - reg');
    expect(heuristic.category).toBe('scholarship');
    expect(heuristic.importantDates).toEqual([{ label: 'Important Date', date: 'September 20, 2026' }]);
    expect(heuristic.links).toEqual([{ label: 'Link', url: 'https://vit.ac.in/research.' }]);
  });

  // Scenario 11: Reclassification utility corrects stale campus_emails and generates missing tasks
  it('11. reclassifyExistingCampusEmails correctly updates stale campus_emails and backfills missing tasks', async () => {
    // 1. Insert stale academic email marked as 'failed' with deadline September 20, 2026
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, sender_email, subject,
        body_text, snippet, analysis_status, deadline, created_at, updated_at
      ) VALUES (
        $1, 'student_user', 'student@vitstudent.ac.in', 'stale_kalam_1', 'dean.ar@vit.ac.in',
        'Claim for Dr. APJ Abdul Kalam Award for August 2026 - reg',
        'Please submit claim form before September 20, 2026.',
        'Please submit before September 20, 2026.',
        'failed', 'September 20, 2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [randomUUID()],
    );

    // 2. Insert stale personal email marked as 'failed'
    await pool.query(
      `INSERT INTO campus_emails (
        id, user_id, source_account_email, source_message_id, sender_email, subject,
        body_text, snippet, analysis_status, created_at, updated_at
      ) VALUES (
        $1, 'student_user', 'student@vitstudent.ac.in', 'stale_personal_1', 'orders@asics.co.in',
        'Order Confirmed: Asics Kayano',
        'Your tracking code is 123456.',
        'Your tracking code is 123456.',
        'failed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [randomUUID()],
    );

    const stats = await reclassifyExistingCampusEmails('student_user');
    expect(stats.reclassifiedCount).toBe(1);
    expect(stats.ignoredCount).toBe(1);
    expect(stats.tasksGenerated).toBe(0); // Never automatically generate tasks

    // Verify stale personal was updated to ignored_personal
    const { rows: personalEmail } = await pool.query("SELECT analysis_status FROM campus_emails WHERE source_message_id = 'stale_personal_1'");
    expect(personalEmail[0].analysis_status).toBe('ignored_personal');

    // Verify notice was created for the academic email, but NO task was auto-created
    const { rows: notices } = await pool.query("SELECT * FROM notices WHERE source_message_id = 'stale_kalam_1'");
    expect(notices).toHaveLength(1);

    const { rows: tasks } = await pool.query("SELECT * FROM assignments WHERE source_id = 'stale_kalam_1'");
    expect(tasks).toHaveLength(0);
  });

  // Scenario 12: Sync endpoint returns truthful status reporting accurate counts
  it('12. Sync endpoint returns truthful stats including relevantAcademicMessages, ignoredMessages, and noticesCreated', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: {
        messages: [
          { id: 'msg_batch_promo' },
          { id: 'msg_batch_academic' },
        ],
      },
    });

    mockGet.mockImplementation(({ id }: { id: string }) => {
      if (id === 'msg_batch_promo') {
        return Promise.resolve({
          data: {
            id: 'msg_batch_promo',
            snippet: 'Jobs recommended for you on Indeed',
            payload: {
              headers: [
                { name: 'From', value: 'jobalert.indeed.com' },
                { name: 'Subject', value: '3 new jobs for you' },
              ],
            },
          },
        });
      }
      return Promise.resolve({
        data: {
          id: 'msg_batch_academic',
          snippet: 'FAT exam timetable is released',
          payload: {
            headers: [
              { name: 'From', value: 'academics@vit.ac.in' },
              { name: 'Subject', value: 'FAT Exam Timetable Fall 2026' },
            ],
          },
        },
      });
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'FAT Exam Timetable Fall 2026',
        summary: 'Exams begin from October 10, 2026',
        category: 'exam',
        priority: 'urgent',
        importantDates: [{ label: 'Exam Starts', date: '2026-10-10' }],
        source: {
          provider: 'gmail',
          messageId: 'msg_batch_academic',
          sender: 'academics@vit.ac.in',
          subject: 'FAT Exam Timetable Fall 2026',
        },
      }),
    });

    const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');
    expect(res.status).toBe(200);
    expect(res.body.checked).toBe(2);
    expect(res.body.newMessages).toBe(2);
    expect(res.body.ignoredMessages).toBe(1);
    expect(res.body.relevantAcademicMessages).toBe(1);
    expect(res.body.tasksGenerated).toBe(0); // Zero auto tasks
    expect(res.body.noticesCreated).toBe(0);
  });
});
