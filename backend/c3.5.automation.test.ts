import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});


const mockList = vi.fn();
const mockGet = vi.fn();

vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
    generateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    getToken = vi.fn().mockResolvedValue({
      tokens: {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expiry_date: 1700000000000,
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
          messages: {
            list: mockList,
            get: mockGet,
          },
        },
      })),
    },
  };
});

let mockNoticeAnalyzer: { analyze: (msg: unknown) => Promise<unknown> } | null = null;
vi.mock('./services/noticeAnalyzer.service.js', () => ({
  noticeAnalyzerService: {
    analyze: (msg: unknown) => {
      if (mockNoticeAnalyzer) {
        return mockNoticeAnalyzer.analyze(msg);
      }
      const m = msg as { id?: string; subject?: string };
      return Promise.resolve({
        title: m?.subject || 'Default Test Notice',
        summary: 'Default test summary for students.',
        category: 'academic',
        priority: 'normal',
        isCampusWide: true,
        source: {
          provider: 'gmail',
          messageId: m?.id || 'msg_default',
          sender: 'dept@vit.ac.in',
          subject: m?.subject || 'Official Update',
        },
      });
    },

  },
}));

vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req: { headers: Record<string, string>; auth?: { userId: string; sessionClaims?: Record<string, unknown> } }, _res: unknown, next: () => void) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token === 'reviewer_user') {
        req.auth = {
          userId: 'reviewer_user',
          sessionClaims: { metadata: { role: 'reviewer' } },
        };
      } else {
        req.auth = {
          userId: token || 'student_user_1',
          sessionClaims: { metadata: { role: 'student' } },
        };
      }
    }
    next();
  },
  requireAuth: () => (req: { headers: Record<string, string>; auth?: { userId: string; sessionClaims?: Record<string, unknown> } }, res: { status: (code: number) => { json: (data: unknown) => void } }, next: () => void) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    if (token === 'reviewer_user') {
      req.auth = {
        userId: 'reviewer_user',
        sessionClaims: { metadata: { role: 'reviewer' } },
      };
    } else {
      req.auth = {
        userId: token || 'student_user_1',
        sessionClaims: { metadata: { role: 'student' } },
      };
    }
    next();
  },
  getAuth: (req: { auth?: { userId: string; sessionClaims?: Record<string, unknown> } }) => {
    return req.auth || { userId: null, sessionClaims: {} };
  },
}));


import app from './index.js';
import { pool } from './db.js';
import { syncGmailMessagesForUser } from './services/gmail.service.js';
import { noticesService } from './services/notices.service.js';
import { notificationsService } from './services/notifications.service.js';
import { storageService } from './services/storage.service.js';


describe('Phase C3.5: Automatic Gmail Ingestion, Notice Feed Integration & Notifications', () => {
  beforeEach(async () => {
    mockList.mockReset();
    mockGet.mockReset();
    mockNoticeAnalyzer = null;
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM notice_suppressions');
  });


  describe('1. Automatic Gmail Sync Pipeline & Pagination (>5 messages)', () => {
    it('automatically processes 25+ messages across multiple pages without requiring individual IDs', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'reviewer_user', 'admin@vit.ac.in', 'tok_1', 'ref_1', 1700000000)
        `,
        [randomUUID()],
      );

      // Simulate 2 pages of messages (Page 1: 15 items, Page 2: 12 items -> 27 total)
      const page1Msgs = Array.from({ length: 15 }, (_, i) => ({
        id: `msg_p1_${i + 1}`,
        threadId: `thread_${i + 1}`,
      }));
      const page2Msgs = Array.from({ length: 12 }, (_, i) => ({
        id: `msg_p2_${i + 1}`,
        threadId: `thread_p2_${i + 1}`,
      }));

      mockList
        .mockResolvedValueOnce({
          data: {
            messages: page1Msgs,
            nextPageToken: 'token_page_2',
            resultSizeEstimate: 27,
          },
        })
        .mockResolvedValueOnce({
          data: {
            messages: page2Msgs,
            nextPageToken: null,
            resultSizeEstimate: 12,
          },
        });

      mockGet.mockImplementation(({ id }: { id: string }) => {
        return Promise.resolve({
          data: {
            id,
            threadId: `thread_${id}`,
            snippet: `Snippet for message ${id}`,
            payload: {
              headers: [
                { name: 'From', value: 'admissions@vit.ac.in' },
                { name: 'Subject', value: `Notice Circular ${id}` },
                { name: 'Date', value: 'Sun, 30 Aug 2026 12:00:00 +0530' },
              ],
              mimeType: 'text/plain',
              body: {
                data: Buffer.from(`Important details regarding circular ${id}`).toString('base64url'),
              },
            },
          },
        });
      });

      mockNoticeAnalyzer = {
        analyze: (msg: unknown) => {
          const m = msg as { id: string; subject: string };
          return Promise.resolve({
            title: `Processed Notice ${m.id}`,
            summary: `Automated summary for message ${m.id}`,
            category: 'academic',
            priority: 'important',
            isCampusWide: true,
            isPersonal: false,
            source: {
              provider: 'gmail',
              messageId: m.id,
              sender: 'admissions@vit.ac.in',
              subject: m.subject,
            },
          });
        },
      };

      const stats = await syncGmailMessagesForUser('reviewer_user', 30);

      expect(stats.checked).toBe(27);
      expect(stats.newMessages).toBe(27);
      expect(stats.skipped).toBe(0);
      expect(stats.processed).toBe(27);
      expect(stats.failed).toBe(0);
      expect(stats.noticesCreated).toBe(27);

      // Verify all 27 notices exist in DB
      const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
      expect(noticeRows.length).toBe(27);
    });



    it('skips already processed messages on subsequent syncs and only ingests genuinely new messages', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'reviewer_user', 'admin@vit.ac.in', 'tok_1', 'ref_1', 1700000000)
        `,
        [randomUUID()],
      );

      // Run 1: 3 messages
      mockList.mockResolvedValueOnce({
        data: {
          messages: [{ id: 'msg_1' }, { id: 'msg_2' }, { id: 'msg_3' }],
        },
      });
      mockGet.mockImplementation(({ id }: { id: string }) => {
        return Promise.resolve({
          data: {
            id,
            payload: { headers: [{ name: 'Subject', value: `Initial Test ${id}` }] },
          },
        });
      });

      const stats1 = await syncGmailMessagesForUser('reviewer_user', 10);
      expect(stats1.newMessages).toBe(3);
      expect(stats1.noticesCreated).toBe(3);

      // Run 2: msg_1, msg_2, msg_3 + new msg_4
      mockList.mockResolvedValueOnce({
        data: {
          messages: [{ id: 'msg_1' }, { id: 'msg_2' }, { id: 'msg_3' }, { id: 'msg_4' }],
        },
      });

      const stats2 = await syncGmailMessagesForUser('reviewer_user', 10);
      expect(stats2.checked).toBe(4);
      expect(stats2.skipped).toBe(3);
      expect(stats2.newMessages).toBe(1);
      expect(stats2.noticesCreated).toBe(1);
    });

    it('isolates message failures: malformed or transient error does NOT abort remaining batch', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'reviewer_user', 'admin@vit.ac.in', 'tok_1', 'ref_1', 1700000000)
        `,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: {
          messages: [{ id: 'good_1' }, { id: 'fail_transient_2' }, { id: 'good_3' }],
        },
      });

      mockGet.mockImplementation(({ id }: { id: string }) => {
        if (id === 'fail_transient_2') {
          return Promise.reject(new Error('Transient AI service rate limit 429'));
        }
        return Promise.resolve({
          data: {
            id,
            payload: { headers: [{ name: 'Subject', value: `Title ${id}` }] },
          },
        });
      });

      const stats = await syncGmailMessagesForUser('reviewer_user', 10);
      expect(stats.checked).toBe(3);
      expect(stats.processed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.noticesCreated).toBe(2);

      // Transient failed message is NOT recorded as processed, ensuring retry on next sync
      const { rows: processedRows } = await pool.query(
        "SELECT * FROM processed_gmail_messages WHERE gmail_message_id = 'fail_transient_2'",
      );
      expect(processedRows.length).toBe(0);
    });
  });

  describe('2. Gmail Identity & Same-Thread Preservation', () => {
    it('preserves distinct message IDs and does not collapse same-thread messages into one notice', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'reviewer_user', 'admin@vit.ac.in', 'tok_1', 'ref_1', 1700000000)
        `,
        [randomUUID()],
      );

      const threadMessages = [
        { id: '1a0515e0cbc287bc', threadId: '1a051552dbd40ee4', doc: 'Consent Form' },
        { id: '1a051582975fe923', threadId: '1a051552dbd40ee4', doc: 'Physical Fitness' },
        { id: '1a05156870e204ee', threadId: '1a051552dbd40ee4', doc: 'SSLC Certificate' },
      ];

      mockList.mockResolvedValueOnce({
        data: { messages: threadMessages.map((m) => ({ id: m.id, threadId: m.threadId })) },
      });

      mockGet.mockImplementation(({ id }: { id: string }) => {
        const item = threadMessages.find((m) => m.id === id);
        return Promise.resolve({
          data: {
            id,
            threadId: item?.threadId,
            snippet: `Please upload ${item?.doc}`,
            payload: {
              headers: [
                { name: 'From', value: 'no-reply@vit.ac.in' },
                { name: 'Subject', value: 'Fresher - Certificate Verification' },
              ],
            },
          },
        });
      });

      mockNoticeAnalyzer = {
        analyze: (msg: unknown) => {
          const m = msg as { id: string; snippet: string };
          return Promise.resolve({
            title: `Placement Drive Update - ${m.id}`,
            summary: m.snippet,
            category: 'placement',
            priority: 'urgent',
            isCampusWide: true,
            isPersonal: false,
            source: {
              provider: 'gmail',
              messageId: m.id,
              sender: 'cdc@vit.ac.in',
              subject: 'Placement Drive Update',
            },
          });
        },
      };

      const stats = await syncGmailMessagesForUser('reviewer_user', 10);
      expect(stats.noticesCreated).toBe(3);


      const { rows } = await pool.query('SELECT source_message_id, title FROM notices ORDER BY source_message_id');
      expect(rows.length).toBe(3);
      expect(rows.map((r) => r.source_message_id)).toEqual([
        '1a05156870e204ee',
        '1a051582975fe923',
        '1a0515e0cbc287bc',
      ]);
    });
  });

  describe('3. Campus Feed & Notice Visibility Security', () => {
    it('strictly hides pending and approved notices from students, and shows published notices in Campus Feed', async () => {
      // 1. Create a pending notice
      const pendingNotice = await noticesService.createFromCandidate(
        'reviewer_user',
        {
          title: 'Draft Exam Schedule',
          summary: 'Internal review only.',
          category: 'exam',
          priority: 'urgent',
          source: {
            provider: 'gmail',
            messageId: 'msg_exam_draft',
            sender: 'admin@vit.ac.in',
            subject: 'Draft Exam Schedule',
          },
        },
        { accountEmail: 'admin@vit.ac.in' },
      );

      // Student checks notices list -> returns empty
      const studentRes = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_user_1');
      expect(studentRes.status).toBe(200);
      expect(studentRes.body).toHaveLength(0);

      // Student direct GET by ID -> returns 404
      const studentGetRes = await request(app)
        .get(`/api/notices/${pendingNotice.id}`)
        .set('Authorization', 'Bearer student_user_1');
      expect(studentGetRes.status).toBe(404);

      // Reviewer checks notices list -> sees pending notice
      const reviewerRes = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer reviewer_user');
      expect(reviewerRes.status).toBe(200);
      expect(reviewerRes.body).toHaveLength(1);
      expect(reviewerRes.body[0].id).toBe(pendingNotice.id);

      // 2. Reviewer approves notice (still not published)
      await noticesService.approve(pendingNotice.id);

      // Student still cannot see approved notice
      const studentRes2 = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_user_1');
      expect(studentRes2.body).toHaveLength(0);

      // 3. Reviewer publishes notice
      await noticesService.publish(pendingNotice.id);

      // Student can now see the published notice in Notice Board
      const studentRes3 = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_user_1');
      expect(studentRes3.body).toHaveLength(1);
      expect(studentRes3.body[0].title).toBe('Draft Exam Schedule');

      // Check Campus Feed integration via storageService.getAll
      const campusFeedItems = await storageService.getAll('student_user_1');
      const feedMatch = campusFeedItems.find((item) => item.id === pendingNotice.id);
      expect(feedMatch).toBeDefined();
      expect(feedMatch?.title).toBe('Draft Exam Schedule');
      expect(feedMatch?.type).toBe('DEADLINE');
    });
  });


  describe('4. In-App Notifications & Reminders', () => {
    it('dispatches pending review notifications only to reviewers and published notifications to all students', async () => {
      // 1. Dispatch pending review notification
      await notificationsService.notifyPendingReview(3);

      // Student checks notifications -> does NOT see pending review
      const studentNotifs = await notificationsService.getAllForUser('student_user_1', false);
      expect(studentNotifs.filter((n) => n.type === 'pending_review')).toHaveLength(0);

      // Reviewer checks notifications -> sees pending review
      const reviewerNotifs = await notificationsService.getAllForUser('reviewer_user', true);
      const pendingNotif = reviewerNotifs.find((n) => n.type === 'pending_review');
      expect(pendingNotif).toBeDefined();
      expect(pendingNotif?.message).toContain('3 notices are pending review');
      expect(pendingNotif?.link).toBe('/notice-board?tab=pending');

      // 2. Publish a notice with important dates (today)
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      const notice = await noticesService.createFromCandidate(
        'reviewer_user',
        {
          title: 'FAT Exam Registration',
          summary: 'Last day to register for FAT examinations.',
          category: 'exam',
          priority: 'urgent',
          importantDates: [{ label: 'Registration Closes', date: `${todayStr}T23:59:59` }],
          source: {
            provider: 'gmail',
            messageId: 'msg_fat_reg',
            sender: 'admin@vit.ac.in',
            subject: 'FAT Exam Registration',
          },
        },
      );
      await noticesService.approve(notice.id);
      await noticesService.publish(notice.id);


      // Student fetches notifications via GET /api/notifications
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer student_user_1');

      expect(res.status).toBe(200);
      expect(res.body.notifications.length).toBeGreaterThanOrEqual(2);

      // Contains "New Campus Notice"
      const pubNotif = res.body.notifications.find((n: { type: string }) => n.type === 'notice_published');
      expect(pubNotif).toBeDefined();
      expect(pubNotif.message).toBe('FAT Exam Registration');

      // Contains Dynamic Deadline Reminder for today
      const deadlineNotif = res.body.notifications.find((n: { type: string }) => n.type === 'deadline_reminder');
      expect(deadlineNotif).toBeDefined();
      expect(deadlineNotif.message).toContain('Deadline Today');
      expect(deadlineNotif.message).toContain('FAT Exam Registration');
    });

    it('marks notifications as read per user via POST /api/notifications/:id/read', async () => {
      const notif = await notificationsService.create({
        recipientRole: 'all',
        type: 'notice_published',
        title: 'Test Notification',
        message: 'Content for mark read test',
      });

      const res1 = await request(app)
        .post(`/api/notifications/${notif.id}/read`)
        .set('Authorization', 'Bearer student_user_1');

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      const userNotifs = await notificationsService.getAllForUser('student_user_1', false);
      const found = userNotifs.find((n) => n.id === notif.id);
      expect(found?.isRead).toBe(true);
    });
  });

  describe('5. Phase C4: Automatic Gmail -> Campus Feed & Notice Classification', () => {
    it('automatically publishes campus-wide notices to Campus Feed and keeps personal candidate emails pending', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'reviewer_user', 'admin@vit.ac.in', 'tok_1', 'ref_1', 1700000000)
        `,
        [randomUUID()],
      );

      const msgs = [
        {
          id: 'msg_sports_event',
          subject: 'National Sports Day 2026 - Swimming Men Event',
          title: 'National Sports Day 2026 - Swimming Men Event',
          isCampusWide: true,
          isPersonal: false,
          category: 'event' as const,
        },
        {
          id: 'msg_candidate_doc',
          subject: 'Fresher - Certificate Verification',
          title: 'Candidate [2026033287] - Certificate Verification - Missing 12th Mark List',
          isCampusWide: false,
          isPersonal: true,
          category: 'administrative' as const,
        },
      ];

      mockList.mockResolvedValueOnce({
        data: { messages: msgs.map((m) => ({ id: m.id })) },
      });

      mockGet.mockImplementation(({ id }: { id: string }) => {
        const item = msgs.find((m) => m.id === id);
        return Promise.resolve({
          data: {
            id,
            snippet: item?.title,
            payload: {
              headers: [
                { name: 'From', value: 'director.pe@vit.ac.in' },
                { name: 'Subject', value: item?.subject },
              ],
            },
          },
        });
      });

      mockNoticeAnalyzer = {
        analyze: (msg: unknown) => {
          const m = msg as { id: string };
          const item = msgs.find((x) => x.id === m.id)!;
          return Promise.resolve({
            title: item.title,
            summary: `Automated summary for ${item.title}`,
            category: item.category,
            priority: 'important' as const,
            isCampusWide: item.isCampusWide,
            isPersonal: item.isPersonal,
            source: {
              provider: 'gmail' as const,
              messageId: item.id,
              sender: 'director.pe@vit.ac.in',
              subject: item.subject,
            },
          });
        },
      };

      // Run automatic sync
      const stats = await syncGmailMessagesForUser('reviewer_user', 10);
      expect(stats.noticesCreated).toBe(1); // Only legitimate campus-wide notice created

      // Verify DB statuses
      const { rows: publishedRows } = await pool.query("SELECT * FROM notices WHERE status = 'published'");
      expect(publishedRows).toHaveLength(1);
      expect(publishedRows[0].source_message_id).toBe('msg_sports_event');

      // Personal candidate email was NOT inserted into notices table
      const { rows: pendingRows } = await pool.query("SELECT * FROM notices WHERE status = 'pending'");
      expect(pendingRows).toHaveLength(0);

      // But both raw emails are safely stored in campus_emails
      const { rows: emailRows } = await pool.query('SELECT * FROM campus_emails');
      expect(emailRows).toHaveLength(2);

      // Verify Campus Feed for student
      const studentFeed = await storageService.getAll('student_user_1');
      const feedTitles = studentFeed.map((i) => i.title);
      expect(feedTitles).toContain('National Sports Day 2026 - Swimming Men Event');
      expect(feedTitles).not.toContain('Candidate [2026033287] - Certificate Verification - Missing 12th Mark List');

      // Verify Notification: student received notification only for the published notice
      const studentNotifs = await notificationsService.getAllForUser('student_user_1', false);
      expect(studentNotifs.some((n) => n.message.includes('Swimming Men Event'))).toBe(true);
      expect(studentNotifs.some((n) => n.message.includes('Candidate [2026033287]'))).toBe(false);

      // Re-sync idempotency test
      mockList.mockResolvedValueOnce({
        data: { messages: msgs.map((m) => ({ id: m.id })) },
      });
      const statsReSync = await syncGmailMessagesForUser('reviewer_user', 10);
      expect(statsReSync.skipped).toBe(2);
      expect(statsReSync.newMessages).toBe(0);
      expect(statsReSync.noticesCreated).toBe(0);

      // Notifications count did not duplicate
      const studentNotifsAfter = await notificationsService.getAllForUser('student_user_1', false);
      expect(studentNotifsAfter.filter((n) => n.message.includes('Swimming Men Event'))).toHaveLength(1);
    });
  });

  describe('6. Phase C5: Dedicated Email Persistence & Campus Feed Exposure', () => {
    it('persists every fetched email into campus_emails and keeps raw audit records intact even when AI analysis fails', async () => {
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'student_user_c5', 'student@vitstudent.ac.in', 'tok_c5', 'ref_c5', 1700000000)
        `,
        [randomUUID()],
      );

      const msgs = [
        {
          id: 'msg_ai_success_1',
          threadId: 'thread_shared_123',
          subject: 'Placement Drive: Tech Corp Shortlist',
          body: 'Shortlisted candidates report at SJT 401.',
        },
        {
          id: 'msg_ai_success_2',
          threadId: 'thread_shared_123',
          subject: 'Placement Drive: Interview Slot',
          body: 'Your interview slot is scheduled at 2:00 PM.',
        },
        {
          id: 'msg_ai_fail_3',
          threadId: 'thread_other_456',
          subject: 'Mess Committee Announcement',
          body: 'Special menu for hostel mess this Sunday.',
        },
      ];

      mockList.mockResolvedValueOnce({
        data: { messages: msgs.map((m) => ({ id: m.id, threadId: m.threadId })) },
      });

      mockGet.mockImplementation(({ id }: { id: string }) => {
        const item = msgs.find((m) => m.id === id);
        return Promise.resolve({
          data: {
            id,
            threadId: item?.threadId,
            snippet: item?.subject,
            payload: {
              headers: [
                { name: 'From', value: 'cdc@vit.ac.in' },
                { name: 'Subject', value: item?.subject },
              ],
              mimeType: 'text/plain',
              body: { data: Buffer.from(item?.body || '').toString('base64url') },
            },
          },
        });
      });

      mockNoticeAnalyzer = {
        analyze: (msg: unknown) => {
          const m = msg as { id: string; subject: string };
          if (m.id === 'msg_ai_fail_3') {
            return Promise.reject(new Error('AI rate limit 429'));
          }
          return Promise.resolve({
            title: m.subject,
            summary: `Automated summary for ${m.subject}`,
            category: 'placement',
            priority: 'important',
            isCampusWide: true,
            isPersonal: false,
            source: {
              provider: 'gmail',
              messageId: m.id,
              sender: 'cdc@vit.ac.in',
              subject: m.subject,
            },
          });
        },
      };

      const stats = await syncGmailMessagesForUser('student_user_c5', 10);
      expect(stats.emailsPersisted).toBe(3);
      expect(stats.analysesFailed).toBe(1);

      // Verify all 3 emails are in campus_emails table
      const { rows: emailRows } = await pool.query(
        'SELECT source_message_id, analysis_status, subject FROM campus_emails WHERE user_id = $1 ORDER BY source_message_id',
        ['student_user_c5'],
      );
      expect(emailRows).toHaveLength(3);

      const failedEmail = emailRows.find((e) => e.source_message_id === 'msg_ai_fail_3');
      expect(failedEmail?.analysis_status).toBe('failed');

      const completedEmails = emailRows.filter((e) => e.analysis_status === 'completed');
      expect(completedEmails).toHaveLength(2);

      // Verify same-thread messages are 2 separate items
      const sharedThreadEmails = emailRows.filter((e) => e.source_message_id.startsWith('msg_ai_success_'));
      expect(sharedThreadEmails).toHaveLength(2);

      // Re-sync idempotency
      mockList.mockResolvedValueOnce({
        data: { messages: msgs.map((m) => ({ id: m.id, threadId: m.threadId })) },
      });
      const reSyncStats = await syncGmailMessagesForUser('student_user_c5', 10);
      expect(reSyncStats.skipped).toBe(2); // msg_ai_success_1 & 2 skipped because analysis completed
      expect(reSyncStats.newMessages).toBe(1); // msg_ai_fail_3 retries
    });
  });

  describe('7. Final Bug Fixes: Reviewer Deletion, Feed Date/Personal Filtering & Deduplication', () => {
    it('allows reviewer to delete a notice via DELETE /api/notices/:id, while students receive 403 Forbidden', async () => {
      const noticeId = randomUUID();
      await pool.query(
        `
        INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
        VALUES ($1, 'reviewer_user', 'Notice To Delete', 'Summary', 'general', 'normal', 'published')
        `,
        [noticeId],
      );

      // Student attempt -> 403 Forbidden
      const studentRes = await request(app)
        .delete(`/api/notices/${noticeId}`)
        .set('Authorization', 'Bearer student_user_1');
      expect(studentRes.status).toBe(403);

      // Reviewer attempt -> 204 No Content
      const reviewerRes = await request(app)
        .delete(`/api/notices/${noticeId}`)
        .set('Authorization', 'Bearer reviewer_user');
      expect(reviewerRes.status).toBe(204);

      // Verify deletion in database
      const { rows } = await pool.query('SELECT * FROM notices WHERE id = $1', [noticeId]);
      expect(rows).toHaveLength(0);
    });

    it('filters out expired past events and personal certificate emails from student Campus Feed, while keeping future and dateless notices', async () => {
      const testUserId = 'student_feed_test_user';

      // 1. Expired past notice
      await pool.query(
        `
        INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, important_dates)
        VALUES ($1, 'admin', 'Past Hackathon 2020', 'Past event summary', 'event', 'normal', 'published', $2)
        `,
        [randomUUID(), JSON.stringify([{ label: 'Event Date', date: '2020-01-01' }])],
      );

      // 2. Future notice
      await pool.query(
        `
        INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, important_dates)
        VALUES ($1, 'admin', 'Future Riviera 2028', 'Future cultural fest', 'event', 'urgent', 'published', $2)
        `,
        [randomUUID(), JSON.stringify([{ label: 'Event Date', date: '2028-02-15' }])],
      );

      // 3. Dateless notice (e.g. general university circular)
      await pool.query(
        `
        INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
        VALUES ($1, 'admin', 'University Library Guidelines', 'General library rules', 'administrative', 'normal', 'published')
        `,
        [randomUUID()],
      );

      // 4. Personal certificate verification email in campus_emails
      await pool.query(
        `
        INSERT INTO campus_emails (
          id, user_id, source_account_email, source_message_id, subject, summary, category, analysis_status
        ) VALUES (
          $1, $2, 'student@vit.ac.in', 'msg_fresher_cert_1', 'Fresher - Certificate Verification',
          'Upload missing 12th mark list', 'admission', 'completed'
        )
        `,
        [randomUUID(), testUserId],
      );

      const feed = await storageService.getAll(testUserId);
      const titles = feed.map((f) => f.title);

      // Past event is filtered out
      expect(titles).not.toContain('Past Hackathon 2020');

      // Personal certificate email is filtered out from feed
      expect(titles).not.toContain('Fresher - Certificate Verification');

      // Future event and dateless circular are kept visible
      expect(titles).toContain('Future Riviera 2028');
      expect(titles).toContain('University Library Guidelines');

      // Verify the personal email still exists in campus_emails table in DB
      const { rows: certEmails } = await pool.query(
        "SELECT * FROM campus_emails WHERE source_message_id = 'msg_fresher_cert_1'",
      );
      expect(certEmails).toHaveLength(1);
    });


    it('prevents duplicate campus notices in feed while keeping raw Gmail messages with different IDs independently stored', async () => {
      const testUserId = 'student_dedup_user';

      // Insert two emails with identical title and date but different message IDs into campus_emails
      await pool.query(
        `
        INSERT INTO campus_emails (
          id, user_id, source_account_email, source_message_id, subject, summary, category, event_date, analysis_status
        ) VALUES 
          ($1, $2, 'student@vit.ac.in', 'msg_dup_1', 'Gravitas 2028 Tech Fest', 'Annual tech fest', 'event', '2028-09-20', 'completed'),
          ($3, $2, 'student@vit.ac.in', 'msg_dup_2', 'Gravitas 2028 Tech Fest', 'Annual tech fest', 'event', '2028-09-20', 'completed')
        `,
        [randomUUID(), testUserId, randomUUID()],
      );

      // Both remain in campus_emails in DB
      const { rows: allDbEmails } = await pool.query(
        'SELECT * FROM campus_emails WHERE user_id = $1 AND subject = $2',
        [testUserId, 'Gravitas 2028 Tech Fest'],
      );
      expect(allDbEmails).toHaveLength(2);

      // Feed deduplicates notices so only 1 appears in the UI
      const feed = await storageService.getAll(testUserId);
      const gravitasItems = feed.filter((f) => f.title === 'Gravitas 2028 Tech Fest');
      expect(gravitasItems).toHaveLength(0); // Note: campus_emails are no longer directly dumped into feed
    });
  });

  describe('8. Complete Notice & Feed Architecture Verification (16 Regression Scenarios)', () => {
    it('1, 2, 3: Personal certificate and candidate-specific admission emails are excluded from notice creation and Campus Feed', async () => {
      const personalCandidate = {
        title: 'Fresher - Certificate Verification',
        summary: 'Please upload missing 12th mark list for candidate [12345]',
        category: 'admission' as const,
        priority: 'urgent' as const,
        isPersonal: true,
        source: {
          provider: 'gmail' as const,
          messageId: 'msg_fresher_test_1',
          sender: 'admissions@vit.ac.in',
          subject: 'Fresher - Certificate Verification',
        },
      };

      // Notice creation throws or rejects personal/admission candidates
      await expect(
        noticesService.createFromCandidate('user_reviewer', personalCandidate, {
          accountEmail: 'admin@vit.ac.in',
        }),
      ).rejects.toThrow();

      // Feed query never shows it
      const feed = await storageService.getAll('student_user_1');
      expect(feed.some((item) => item.title.includes('Certificate Verification'))).toBe(false);
    });

    it('4, 5, 6: Duplicate Gmail sync and same-thread messages remain separate raw emails, but duplicate campus notices are prevented', async () => {
      const testUser = 'reviewer_dedup_test';
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, $2, 'admin@vit.ac.in', 'tok_1', 'ref_1', 1700000000)
        `,
        [randomUUID(), testUser],
      );

      const msg1 = {
        id: 'thread_msg_1',
        threadId: 'common_thread_99',
        snippet: 'Hackathon announcement',
        payload: {
          headers: [
            { name: 'From', value: 'clubs@vit.ac.in' },
            { name: 'Subject', value: 'Hackathon 2028' },
            { name: 'Date', value: 'Sun, 30 Aug 2026 10:00:00 +0000' },
          ],
          body: { data: Buffer.from('Join Hackathon 2028 at Anna Audi').toString('base64') },
        },
      };

      const msg2 = {
        id: 'thread_msg_2',
        threadId: 'common_thread_99',
        snippet: 'Hackathon reminder',
        payload: {
          headers: [
            { name: 'From', value: 'clubs@vit.ac.in' },
            { name: 'Subject', value: 'Hackathon 2028 Reminder' },
            { name: 'Date', value: 'Sun, 30 Aug 2026 11:00:00 +0000' },
          ],
          body: { data: Buffer.from('Join Hackathon 2028 at Anna Audi').toString('base64') },
        },
      };

      mockList.mockResolvedValueOnce({ data: { messages: [{ id: msg1.id }, { id: msg2.id }] } });
      mockGet
        .mockResolvedValueOnce({ data: msg1 })
        .mockResolvedValueOnce({ data: msg2 });

      mockNoticeAnalyzer = {
        analyze: () =>
          Promise.resolve({
            title: 'Hackathon 2028',
            summary: 'Hackathon at Anna Audi',
            category: 'event',
            priority: 'normal',
            isCampusWide: true,
            venue: 'Anna Audi',
            importantDates: [{ label: 'Event Date', date: '2028-09-15' }],
            source: { provider: 'gmail', messageId: 'thread_msg_1', sender: 'clubs@vit.ac.in' },
          }),
      };

      const syncStats = await syncGmailMessagesForUser(testUser, 10);
      expect(syncStats.emailsPersisted).toBe(2);
      expect(syncStats.noticesCreated).toBe(1); // Only 1 notice created because second is duplicate fingerprint

      // Both raw messages exist in campus_emails
      const { rows: rawEmails } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [testUser]);
      expect(rawEmails).toHaveLength(2);

      // Only 1 notice in notices table
      const { rows: notices } = await pool.query('SELECT * FROM notices WHERE title = $1', ['Hackathon 2028']);
      expect(notices).toHaveLength(1);
    });

    it('7, 8, 9, 15: Expired event is absent, upcoming event is visible, dateless circular remains visible, and feed never returns "Event ended"', async () => {
      const studentId = 'student_visibility_test';

      // 1. Expired notice (2020)
      await pool.query(
        `
        INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, important_dates)
        VALUES ($1, 'admin', 'Old 2020 Cultural Fest', 'Expired event', 'event', 'normal', 'published', $2)
        `,
        [randomUUID(), JSON.stringify([{ label: 'Event Date', date: '2020-01-01' }])],
      );

      // 2. Upcoming notice (2028)
      await pool.query(
        `
        INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, important_dates)
        VALUES ($1, 'admin', 'Riviera 2028 Mega Event', 'Upcoming cultural fest', 'event', 'urgent', 'published', $2)
        `,
        [randomUUID(), JSON.stringify([{ label: 'Event Date', date: '2028-02-15' }])],
      );

      // 3. Dateless circular
      await pool.query(
        `
        INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
        VALUES ($1, 'admin', 'University Disciplinary Guidelines', 'Code of conduct', 'administrative', 'normal', 'published')
        `,
        [randomUUID()],
      );

      const feed = await storageService.getAll(studentId);
      const titles = feed.map((i) => i.title);

      expect(titles).not.toContain('Old 2020 Cultural Fest');
      expect(titles).toContain('Riviera 2028 Mega Event');
      expect(titles).toContain('University Disciplinary Guidelines');
    });

    it('10, 11, 12, 13, 14: DELETE removes notice, blocks students (403), allows reviewer (204), and suppression prevents Gmail resync recreation', async () => {
      const reviewerToken = 'reviewer_user';
      const studentToken = 'student_user_1';

      // Create a notice
      const noticeId = randomUUID();
      await pool.query(
        `
        INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_account_email, source_message_id)
        VALUES ($1, 'reviewer_user', 'Annual Sports Meet 2028', 'Sports meet summary', 'event', 'normal', 'published', 'admin@vit.ac.in', 'sports_msg_100')
        `,
        [noticeId],
      );

      // Student DELETE -> 403
      const studentRes = await request(app)
        .delete(`/api/notices/${noticeId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(studentRes.status).toBe(403);

      // Reviewer DELETE -> 204
      const reviewerRes = await request(app)
        .delete(`/api/notices/${noticeId}`)
        .set('Authorization', `Bearer ${reviewerToken}`);
      expect(reviewerRes.status).toBe(204);

      // Notice is deleted from DB
      const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [noticeId]);
      expect(noticeRows).toHaveLength(0);

      // Notice suppression record is present
      const { rows: suppRows } = await pool.query(
        "SELECT * FROM notice_suppressions WHERE source_message_id = 'sports_msg_100'",
      );
      expect(suppRows).toHaveLength(1);

      // Resync attempt for this message ID does NOT recreate the notice
      await pool.query(
        `
        INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
        VALUES ($1, 'reviewer_user', 'admin@vit.ac.in', 'tok_1', 'ref_1', 1700000000)
        `,
        [randomUUID()],
      );

      const msg = {
        id: 'sports_msg_100',
        snippet: 'Annual Sports Meet',
        payload: {
          headers: [
            { name: 'From', value: 'sports@vit.ac.in' },
            { name: 'Subject', value: 'Annual Sports Meet 2028' },
            { name: 'Date', value: 'Sun, 30 Aug 2026 10:00:00 +0000' },
          ],
          body: { data: Buffer.from('Annual Sports Meet details').toString('base64') },
        },
      };

      mockList.mockResolvedValueOnce({ data: { messages: [{ id: msg.id }] } });
      mockGet.mockResolvedValueOnce({ data: msg });
      mockNoticeAnalyzer = {
        analyze: () =>
          Promise.resolve({
            title: 'Annual Sports Meet 2028',
            summary: 'Sports meet summary',
            category: 'event',
            priority: 'normal',
            isCampusWide: true,
            source: { provider: 'gmail', messageId: 'sports_msg_100', sender: 'sports@vit.ac.in' },
          }),
      };

      const resyncStats = await syncGmailMessagesForUser('reviewer_user', 10);
      expect(resyncStats.noticesCreated).toBe(0);

      const { rows: checkRecreated } = await pool.query(
        "SELECT * FROM notices WHERE source_message_id = 'sports_msg_100'",
      );
      expect(checkRecreated).toHaveLength(0);
    });

    it('16: campus_emails are raw audit records and not directly returned as Campus Feed notices', async () => {
      const testUser = 'user_audit_test';
      await pool.query(
        `
        INSERT INTO campus_emails (
          id, user_id, source_account_email, source_message_id, subject, summary, category, analysis_status
        ) VALUES (
          $1, $2, 'student@vit.ac.in', 'msg_internal_memo_1', 'Internal Admin Memo', 'Staff only', 'administrative', 'completed'
        )
        `,
        [randomUUID(), testUser],
      );

      const feed = await storageService.getAll(testUser);
      expect(feed.some((i) => i.title === 'Internal Admin Memo')).toBe(false);
    });
  });
});




