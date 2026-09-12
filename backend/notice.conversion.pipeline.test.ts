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
import { noticesService } from './services/notices.service.js';

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

    // Step G: Verify shared notice row is NOT mutated (per-user assignments is the source of truth)
    const { rows: updatedNoticeRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [notice.id]);
    expect(updatedNoticeRows[0].is_converted).toBe(false);
    expect(updatedNoticeRows[0].converted_to_task_id).toBeNull();

    // Verify student_1 sees notice as converted via API
    const student1NoticeRes = await request(app)
      .get(`/api/notices/${notice.id}`)
      .set('Authorization', 'Bearer student_1');
    expect(student1NoticeRes.status).toBe(200);
    expect(student1NoticeRes.body.isConverted).toBe(true);
    expect(student1NoticeRes.body.convertedToTaskId).toBe(studentTasks[0].id);

    // Verify student_2 sees notice as UNCONVERTED via API
    const student2NoticeRes = await request(app)
      .get(`/api/notices/${notice.id}`)
      .set('Authorization', 'Bearer student_2');
    expect(student2NoticeRes.status).toBe(200);
    expect(student2NoticeRes.body.isConverted).toBe(false);
    expect(student2NoticeRes.body.convertedToTaskId).toBeNull();
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

  describe('Per-User Notice Conversion Security & Isolation Regression Suite', () => {
    it('1. successful shared notice conversion commits both sides', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, 'reviewer_1', 'Campus Hackathon 2026', 'Registration details', 'event', 'urgent', 'published')`,
        [noticeId],
      );

      const res = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1')
        .send({
          dueDate: '2026-10-15',
          priority: 'urgent',
        });

      expect(res.status).toBe(201);
      expect(res.body.alreadyConverted).toBe(false);
      expect(res.body.task.source).toBe('notice');
      expect(res.body.task.sourceId).toBe(noticeId);
      expect(res.body.task.title).toBe('Campus Hackathon 2026');

      // Assert assignment committed
      const { rows: taskRows } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_1' AND source = 'notice' AND source_id = $1",
        [noticeId],
      );
      expect(taskRows).toHaveLength(1);
      expect(taskRows[0].id).toBe(res.body.task.id);

      // Assert shared notice row is NOT mutated in notices table
      const { rows: noticeRows } = await pool.query(
        'SELECT * FROM notices WHERE id = $1',
        [noticeId],
      );
      expect(noticeRows[0].is_converted).toBe(false);
      expect(noticeRows[0].converted_to_task_id).toBeNull();
    });

    it('2. student converts their own private notice → success', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, source_account_email
        ) VALUES ($1, 'student_1', 'My Private Research Draft', 'Personal notes', 'academic', 'normal', 'pending', 'student1@vitstudent.ac.in')`,
        [noticeId],
      );

      const res = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1')
        .send({
          title: 'Review Private Draft',
        });

      expect(res.status).toBe(201);
      expect(res.body.task.source).toBe('notice');
      expect(res.body.task.sourceId).toBe(noticeId);

      const { rows } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_1' AND source = 'notice' AND source_id = $1",
        [noticeId],
      );
      expect(rows).toHaveLength(1);

      // Private notice row is updated for its owner
      const { rows: privateNoticeRows } = await pool.query(
        'SELECT * FROM notices WHERE id = $1',
        [noticeId],
      );
      expect(privateNoticeRows[0].is_converted).toBe(true);
      expect(privateNoticeRows[0].converted_to_task_id).toBe(res.body.task.id);
    });

    it("3. student cannot convert another student's private notice → 403", async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, source_account_email
        ) VALUES ($1, 'student_2', 'Student 2 Private Research', 'Private', 'academic', 'normal', 'pending', 'student2@vitstudent.ac.in')`,
        [noticeId],
      );

      const res = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1')
        .send({ title: 'Hijacked Task' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("You cannot convert another student's notice to a task");

      const { rows } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_1' AND source_id = $1",
        [noticeId],
      );
      expect(rows).toHaveLength(0);
    });

    it('4. notice update failure rolls back assignment creation', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, 'student_1', 'Rollback On Update Failure Notice', 'Summary', 'academic', 'normal', 'pending')`,
        [noticeId],
      );

      // Spy on pool.connect so client.query throws on UPDATE notices
      const origConnect = pool.connect.bind(pool);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patchedClients: Array<{ client: any; originalQuery: any }> = [];
      const connectSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
        const client = await origConnect();
        const originalQuery = client.query.bind(client);
        patchedClients.push({ client, originalQuery });
        client.query = (async (...args: unknown[]) => {
          const sql = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text || '';
          if (sql.includes('UPDATE notices')) {
            throw new Error('Simulated notice update failure');
          }
          return (originalQuery as (...a: unknown[]) => unknown)(...args);
        }) as typeof client.query;
        return client;
      });

      try {
        const res = await request(app)
          .post(`/api/notices/${noticeId}/convert-to-task`)
          .set('Authorization', 'Bearer student_1')
          .send({ title: 'Task That Must Rollback' });

        expect(res.status).toBe(500);

        // Atomic transaction rollback guarantees NO assignment exists!
        const { rows: taskRows } = await pool.query(
          'SELECT * FROM assignments WHERE source_id = $1',
          [noticeId],
        );
        expect(taskRows).toHaveLength(0);

        // Notice remains unconverted
        const { rows: noticeRows } = await pool.query(
          'SELECT is_converted FROM notices WHERE id = $1',
          [noticeId],
        );
        expect(noticeRows[0].is_converted).toBe(false);
      } finally {
        for (const { client, originalQuery } of patchedClients) {
          client.query = originalQuery;
        }
        connectSpy.mockRestore();
      }
    });

    it('5. notice deletion/failure rolls back assignment creation', async () => {
      const ghostNoticeId = randomUUID();
      const res = await request(app)
        .post(`/api/notices/${ghostNoticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Notice not found');

      const { rows } = await pool.query(
        'SELECT * FROM assignments WHERE source_id = $1',
        [ghostNoticeId],
      );
      expect(rows).toHaveLength(0);
    });

    it('6. existing per-user duplicate conversion remains idempotent', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, 'reviewer_1', 'Duplicate Test Notice', 'Summary', 'academic', 'normal', 'published')`,
        [noticeId],
      );

      const res1 = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1');
      expect(res1.status).toBe(201);
      expect(res1.body.alreadyConverted).toBe(false);

      const res2 = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1');
      expect(res2.status).toBe(200);
      expect(res2.body.alreadyConverted).toBe(true);
      expect(res2.body.task.id).toBe(res1.body.task.id);
      expect(res2.body.notice.title).toBe('Duplicate Test Notice');

      const { rows } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_1' AND source = 'notice' AND source_id = $1",
        [noticeId],
      );
      expect(rows).toHaveLength(1);
    });

    it('7. Student A and Student B retain independent conversion state', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, 'reviewer_1', 'Semester Exam Timetable Released', 'Check portal for dates', 'exam', 'urgent', 'published')`,
        [noticeId],
      );

      // Student A converts
      const resA = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1');
      expect(resA.status).toBe(201);
      const taskAId = resA.body.task.id;

      // Student B views notice list via API -> unconverted
      const getNoticesResB = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_2');
      expect(getNoticesResB.status).toBe(200);
      const noticeInListB = getNoticesResB.body.find((n: { id: string }) => n.id === noticeId);
      expect(noticeInListB).toBeDefined();
      expect(noticeInListB.isConverted).toBe(false);
      expect(noticeInListB.convertedToTaskId).toBeNull();

      // Student B views single notice by ID -> unconverted
      const getSingleResB = await request(app)
        .get(`/api/notices/${noticeId}`)
        .set('Authorization', 'Bearer student_2');
      expect(getSingleResB.status).toBe(200);
      expect(getSingleResB.body.isConverted).toBe(false);
      expect(getSingleResB.body.convertedToTaskId).toBeNull();

      // Student B can independently convert the same shared notice
      const resB = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_2');
      expect(resB.status).toBe(201);
      expect(resB.body.alreadyConverted).toBe(false);
      const taskBId = resB.body.task.id;
      expect(taskBId).not.toBe(taskAId);

      // Both students have their own distinct task in assignments
      const { rows: rowsA } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_1' AND source_id = $1",
        [noticeId],
      );
      const { rows: rowsB } = await pool.query(
        "SELECT * FROM assignments WHERE user_id = 'student_2' AND source_id = $1",
        [noticeId],
      );
      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      expect(rowsA[0].id).toBe(taskAId);
      expect(rowsB[0].id).toBe(taskBId);

      // Now Student B sees it converted for themselves
      const getFinalResB = await request(app)
        .get(`/api/notices/${noticeId}`)
        .set('Authorization', 'Bearer student_2');
      expect(getFinalResB.body.isConverted).toBe(true);
      expect(getFinalResB.body.convertedToTaskId).toBe(taskBId);
    });

    it('8. unavailable/archived notice cannot be fabricated or converted', async () => {
      const archivedNoticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, 'reviewer_1', 'Archived Campus Notice', 'Archived info', 'general', 'normal', 'archived')`,
        [archivedNoticeId],
      );

      // Conversion must be rejected with 403
      const res = await request(app)
        .post(`/api/notices/${archivedNoticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1');
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/archived/i);

      // No assignment created
      const { rows: taskRows } = await pool.query(
        'SELECT * FROM assignments WHERE source_id = $1',
        [archivedNoticeId],
      );
      expect(taskRows).toHaveLength(0);

      // Even if an assignment exists for an archived notice, convertToTask must NOT authorize it or fabricate a notice
      await pool.query(
        `INSERT INTO assignments (id, user_id, title, status, source, source_id)
         VALUES ($1, 'student_1', 'Old Task For Archived Notice', 'PENDING', 'notice', $2)`,
        [randomUUID(), archivedNoticeId],
      );

      const resWithExisting = await request(app)
        .post(`/api/notices/${archivedNoticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1');
      expect(resWithExisting.status).toBe(403);
      expect(resWithExisting.body.error).toMatch(/archived/i);

      // Even if an assignment references a completely nonexistent notice ID, convertToTask must NOT fabricate or authorize it
      const nonexistentNoticeId = randomUUID();
      await pool.query(
        `INSERT INTO assignments (id, user_id, title, status, source, source_id)
         VALUES ($1, 'student_1', 'Old Task For Deleted Notice', 'PENDING', 'notice', $2)`,
        [randomUUID(), nonexistentNoticeId],
      );

      const resNonexistent = await request(app)
        .post(`/api/notices/${nonexistentNoticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1');
      expect(resNonexistent.status).toBe(404);
      expect(resNonexistent.body.error).toContain('Notice not found');
    });

    it('9. assignment referencing unavailable/archived notice cannot make getById fabricate an accessible Notice', async () => {
      const deletedNoticeId = randomUUID();
      const archivedNoticeId = randomUUID();

      // Create archived notice in notices table
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, 'reviewer_1', 'Archived Notice For Task', 'Summary', 'academic', 'normal', 'archived')`,
        [archivedNoticeId],
      );

      // Insert assignments referencing both nonexistent and archived notices
      await pool.query(
        `INSERT INTO assignments (id, user_id, title, status, source, source_id)
         VALUES
           ($1, 'student_1', 'Task For Deleted Notice', 'PENDING', 'notice', $2),
           ($3, 'student_1', 'Task For Archived Notice', 'PENDING', 'notice', $4)`,
        [randomUUID(), deletedNoticeId, randomUUID(), archivedNoticeId],
      );

      // Calling getById for deleted notice must return null (NEVER a fabricated Notice)
      const deletedResult = await noticesService.getById(deletedNoticeId, false, 'student_1');
      expect(deletedResult).toBeNull();

      // Calling getById for archived notice by student must return null (inaccessible)
      const archivedResult = await noticesService.getById(archivedNoticeId, false, 'student_1');
      expect(archivedResult).toBeNull();
    });

    it('10. failed conversion with invalid course leaves no partial task/assignment', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, 'reviewer_1', 'Campus Placement Drive', 'Placement talk at 5 PM', 'placement', 'important', 'published')`,
        [noticeId],
      );

      // Attempt to convert with an unowned/nonexistent courseId
      const res = await request(app)
        .post(`/api/notices/${noticeId}/convert-to-task`)
        .set('Authorization', 'Bearer student_1')
        .send({
          courseId: '00000000-0000-0000-0000-000000000000',
          title: 'Placement Task With Ghost Course',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Course not found or access denied');

      // Crucial check: Verify NO partial assignment row exists in the database
      const { rows: taskRows } = await pool.query(
        'SELECT * FROM assignments WHERE source_id = $1',
        [noticeId],
      );
      expect(taskRows).toHaveLength(0);
    });
  });
});
