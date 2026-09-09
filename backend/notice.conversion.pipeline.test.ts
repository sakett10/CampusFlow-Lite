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
      if (authHeader === 'Bearer student_1') {
        req.auth = { userId: 'student_1', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer student_2') {
        req.auth = { userId: 'student_2', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer reviewer_1') {
        req.auth = { userId: 'reviewer_1', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    getAuth: (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }) => {
      return req.auth || { userId: null };
    },
  };
});

import { app } from './index.js';
import { pool } from './db.js';
import { setNoticeAnalyzer } from './services/noticeAnalyzer.service.js';
import { storageService, isItemActive } from './services/storage.service.js';

describe('Notice-to-Task Conversion, August Recovery & Idempotency Pipeline', () => {
  beforeEach(async () => {
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM notice_suppressions');
    vi.clearAllMocks();
  });

  it('1. Full Lifecycle: Reviewer Email -> Notice -> User Decides -> Exactly 1 Task (0 Auto Tasks)', async () => {
    // Connect Reviewer
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'reviewer_1', 'reviewer@vit.ac.in', 'token_rev', 'refresh_rev', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg_hackathon_award' }] },
    });

    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg_hackathon_award',
        snippet: 'Submit project proposal for National Hackathon before September 25, 2026',
        payload: {
          headers: [
            { name: 'From', value: 'Dean Academics <dean.academics@vit.ac.in>' },
            { name: 'Subject', value: 'National Hackathon 2026 - Registration Open' },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'National Hackathon 2026 - Registration Open',
        summary: 'Submit your hackathon team registration before deadline.',
        category: 'event',
        priority: 'urgent',
        isCampusWide: true,
        actionRequired: 'Register team on portal',
        importantDates: [{ label: 'Registration Deadline', date: '2026-09-25' }],
        source: {
          provider: 'gmail',
          messageId: 'msg_hackathon_award',
          sender: 'dean.academics@vit.ac.in',
          subject: 'National Hackathon 2026',
        },
      }),
    });

    // Step A: Reviewer syncs email
    const syncRes = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_1');

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.relevantAcademicMessages).toBe(1);
    expect(syncRes.body.noticesCreated).toBe(1);
    // CRITICAL: Tasks generated during sync MUST BE 0!
    expect(syncRes.body.tasksGenerated).toBe(0);

    // Step B: Verify NO tasks were automatically created in assignments
    const { rows: initialTasks } = await pool.query('SELECT * FROM assignments');
    expect(initialTasks).toHaveLength(0);

    // Step C: Verify published notice exists
    const { rows: noticeRows } = await pool.query("SELECT * FROM notices WHERE status = 'published'");
    expect(noticeRows).toHaveLength(1);
    const notice = noticeRows[0];
    expect(notice.title).toBe('National Hackathon 2026 - Registration Open');
    expect(notice.is_converted).toBe(false);
    expect(notice.converted_to_task_id).toBeNull();

    // Step D: Student views notice on Notice Board
    const getNoticesRes = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer student_1');
    expect(getNoticesRes.status).toBe(200);
    expect(getNoticesRes.body.find((n: { id: string }) => n.id === notice.id)).toBeDefined();

    // Step E: Student explicitly converts notice to task
    const convertRes = await request(app)
      .post(`/api/notices/${notice.id}/convert-to-task`)
      .set('Authorization', 'Bearer student_1')
      .send({
        reminder: '2h_before',
      });

    expect(convertRes.status).toBe(201);
    expect(convertRes.body.alreadyConverted).toBe(false);
    expect(convertRes.body.task.title).toBe('National Hackathon 2026 - Registration Open');
    expect(convertRes.body.task.dueDate).toBe('2026-09-25');
    expect(convertRes.body.task.source).toBe('notice');
    expect(convertRes.body.task.sourceId).toBe(notice.id);

    // Step F: Verify exactly 1 task exists in assignments table for student_1
    const { rows: studentTasks } = await pool.query("SELECT * FROM assignments WHERE user_id = 'student_1'");
    expect(studentTasks).toHaveLength(1);
    expect(studentTasks[0].title).toBe('National Hackathon 2026 - Registration Open');
    expect(studentTasks[0].source).toBe('notice');
    expect(studentTasks[0].source_id).toBe(notice.id);

    // Step G: Verify notice row is marked converted
    const { rows: updatedNoticeRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [notice.id]);
    expect(updatedNoticeRows[0].is_converted).toBe(true);
    expect(updatedNoticeRows[0].converted_to_task_id).toBe(studentTasks[0].id);
    expect(updatedNoticeRows[0].converted_at).not.toBeNull();
  });

  it('2. Idempotency: Duplicate Sync & Duplicate Convert-to-Task Prevent Redundant Records', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'reviewer_1', 'reviewer@vit.ac.in', 'token_rev', 'refresh_rev', 1700000000)`,
      [randomUUID()],
    );

    mockList.mockResolvedValue({
      data: { messages: [{ id: 'msg_idempotent_test' }] },
    });

    mockGet.mockResolvedValue({
      data: {
        id: 'msg_idempotent_test',
        snippet: 'FAT Timetable published for Fall 2026',
        payload: {
          headers: [
            { name: 'From', value: 'coe@vit.ac.in' },
            { name: 'Subject', value: 'FAT Examination Timetable Fall 2026' },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'FAT Examination Timetable Fall 2026',
        summary: 'Exams start on 2026-10-10',
        category: 'exam',
        priority: 'urgent',
        isCampusWide: true,
        importantDates: [{ label: 'Exam Date', date: '2026-10-10' }],
        source: {
          provider: 'gmail',
          messageId: 'msg_idempotent_test',
          sender: 'coe@vit.ac.in',
          subject: 'FAT Examination Timetable Fall 2026',
        },
      }),
    });

    // 1st Sync
    const sync1 = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer reviewer_1');
    expect(sync1.status).toBe(200);
    expect(sync1.body.noticesCreated).toBe(1);
    expect(sync1.body.tasksGenerated).toBe(0);

    // 2nd Sync (same email)
    const sync2 = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer reviewer_1');
    expect(sync2.status).toBe(200);
    expect(sync2.body.skipped).toBe(1);
    expect(sync2.body.noticesCreated).toBe(0);
    expect(sync2.body.tasksGenerated).toBe(0);

    // Verify DB has exactly 1 notice and 0 tasks
    const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
    expect(noticeRows).toHaveLength(1);
    const noticeId = noticeRows[0].id;

    const { rows: taskRowsBefore } = await pool.query('SELECT * FROM assignments');
    expect(taskRowsBefore).toHaveLength(0);

    // 1st Conversion to Task
    const convert1 = await request(app)
      .post(`/api/notices/${noticeId}/convert-to-task`)
      .set('Authorization', 'Bearer student_1');
    expect(convert1.status).toBe(201);
    expect(convert1.body.alreadyConverted).toBe(false);

    // 2nd Conversion of SAME notice by SAME student (Idempotent!)
    const convert2 = await request(app)
      .post(`/api/notices/${noticeId}/convert-to-task`)
      .set('Authorization', 'Bearer student_1');
    expect(convert2.status).toBe(200); // 200 OK instead of 201 Created
    expect(convert2.body.alreadyConverted).toBe(true);
    expect(convert2.body.task.id).toBe(convert1.body.task.id);

    // Exactly 1 task in database
    const { rows: taskRowsAfter } = await pool.query("SELECT * FROM assignments WHERE user_id = 'student_1'");
    expect(taskRowsAfter).toHaveLength(1);
  });

  it('3. User Isolation: Multi-Student Separation & Access Control', async () => {
    // 1. Reviewer creates official published notice
    const noticeId = randomUUID();
    await pool.query(
      `
      INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
      VALUES ($1, 'reviewer_1', 'Official Campus Circular', 'Important announcement for all', 'general', 'normal', 'published')
      `,
      [noticeId],
    );

    // Student 1 converts official notice to a task
    const res1 = await request(app)
      .post(`/api/notices/${noticeId}/convert-to-task`)
      .set('Authorization', 'Bearer student_1');
    expect(res1.status).toBe(201);
    expect(res1.body.task.id).toBeDefined();

    // Student 2 converts the SAME official notice to their OWN task
    const res2 = await request(app)
      .post(`/api/notices/${noticeId}/convert-to-task`)
      .set('Authorization', 'Bearer student_2');
    expect(res2.status).toBe(201);
    expect(res2.body.task.id).toBeDefined();
    expect(res1.body.task.id).not.toBe(res2.body.task.id);

    // Both students have their own distinct task in DB
    const { rows: student1Tasks } = await pool.query("SELECT * FROM assignments WHERE user_id = 'student_1'");
    const { rows: student2Tasks } = await pool.query("SELECT * FROM assignments WHERE user_id = 'student_2'");
    expect(student1Tasks).toHaveLength(1);
    expect(student2Tasks).toHaveLength(1);
    expect(student1Tasks[0].id).toBe(res1.body.task.id);
    expect(student2Tasks[0].id).toBe(res2.body.task.id);

    // Student 2 CANNOT access or delete Student 1's task
    const deleteRes = await request(app)
      .delete(`/api/assignments/${student1Tasks[0].id}`)
      .set('Authorization', 'Bearer student_2');
    expect(deleteRes.status).toBe(404);

    // Student 1's task remains intact
    const { rows: intactTasks } = await pool.query('SELECT * FROM assignments WHERE id = $1', [student1Tasks[0].id]);
    expect(intactTasks).toHaveLength(1);
  });

  it('4. August Email Recovery: Multi-Page Pagination & Announcement Retention', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'reviewer_1', 'reviewer@vit.ac.in', 'token_rev', 'refresh_rev', 1700000000)`,
      [randomUUID()],
    );

    // Page 1: September message with nextPageToken
    // Page 2: August message
    mockList
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: 'msg_sep_1' }],
          nextPageToken: 'token_page_2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: 'msg_aug_1' }],
          nextPageToken: null,
        },
      });

    mockGet.mockImplementation(({ id }: { id: string }) => {
      if (id === 'msg_sep_1') {
        return Promise.resolve({
          data: {
            id: 'msg_sep_1',
            snippet: 'September circular',
            payload: {
              headers: [
                { name: 'From', value: 'registrar@vit.ac.in' },
                { name: 'Subject', value: 'September 2026 Circular' },
              ],
            },
          },
        });
      }
      return Promise.resolve({
        data: {
          id: 'msg_aug_1',
          snippet: 'August circular for Kalam award',
          payload: {
            headers: [
              { name: 'From', value: 'dean.ar@vit.ac.in' },
              { name: 'Subject', value: 'August 2026 Research Award Announcement' },
            ],
          },
        },
      });
    });

    setNoticeAnalyzer({
      analyze: async (msg) => {
        if (msg.id === 'msg_aug_1') {
          return {
            title: 'August 2026 Research Award Announcement',
            summary: 'Research awards for August 2026 cycle.',
            category: 'scholarship',
            priority: 'normal',
            isCampusWide: true,
            importantDates: [{ label: 'Award Date', date: 'August 15, 2026' }],
            source: {
              provider: 'gmail',
              messageId: 'msg_aug_1',
              sender: 'dean.ar@vit.ac.in',
              subject: 'August 2026 Research Award Announcement',
            },
          };
        }
        return {
          title: 'September 2026 Circular',
          summary: 'General update for September.',
          category: 'general',
          priority: 'normal',
          isCampusWide: true,
          source: {
            provider: 'gmail',
            messageId: 'msg_sep_1',
            sender: 'registrar@vit.ac.in',
            subject: 'September 2026 Circular',
          },
        };
      },
    });

    // Trigger sync with syncHistorical option to retrieve August messages
    const syncRes = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer reviewer_1')
      .send({ syncHistorical: true });

    expect(syncRes.status).toBe(200);
    // Both page 1 (September) and page 2 (August) were fetched!
    expect(syncRes.body.checked).toBe(2);
    expect(syncRes.body.noticesCreated).toBe(2);

    // Verify August announcement is preserved and NOT expired in storageService.getAll
    const augustItem = {
      type: 'ANNOUNCEMENT' as const,
      date: '2026-08-15',
    };
    // isItemActive MUST return true for ANNOUNCEMENT items even with August dates
    expect(isItemActive(augustItem, Date.parse('2026-09-10T00:00:00Z'))).toBe(true);

    const items = await storageService.getAll('student_1');
    const augustNoticeInFeed = items.find((i) => i.title?.includes('August 2026 Research Award'));
    expect(augustNoticeInFeed).toBeDefined();
  });
});
