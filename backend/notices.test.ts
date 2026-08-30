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
const mockGet = vi.fn();
vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      gmail: vi.fn().mockImplementation(() => ({
        users: {
          messages: {
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
    clerkMiddleware: () => (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }, _res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer reviewer_A') {
        req.auth = { userId: 'reviewer_A', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer reviewer_B') {
        req.auth = { userId: 'reviewer_B', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer student_1') {
        req.auth = { userId: 'student_1', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer student_2') {
        req.auth = { userId: 'student_2', sessionClaims: { metadata: { role: 'student' } } };
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
import { setNoticeAnalyzer, resetNoticeAnalyzer, type NoticeAnalyzer } from './services/noticeAnalyzer.service.js';
import type { NoticeCandidate } from './types.js';

describe('Phase C3: Notice Board & RBAC Verification', () => {
  beforeEach(async () => {
    mockGet.mockReset();
    resetNoticeAnalyzer();
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM gmail_connections');
  });

  it('rejects unauthenticated requests to /api/notices with 401', async () => {
    const res = await request(app).get('/api/notices');
    expect(res.status).toBe(401);
  });

  it('enforces RBAC: Students receive 403 Forbidden on all mutation endpoints', async () => {
    const studentHeader = { Authorization: 'Bearer student_1' };

    // POST create notice
    const postRes = await request(app)
      .post('/api/notices')
      .set(studentHeader)
      .send({
        title: 'Student Attempt',
        summary: 'Should fail with 403',
        category: 'general',
        priority: 'normal',
        source: { provider: 'gmail', messageId: 'msg_1', sender: 'test', subject: 'test' },
      });
    expect(postRes.status).toBe(403);
    expect(postRes.body.error).toContain('Reviewer or Admin access required');

    // POST from-gmail
    const gmailRes = await request(app)
      .post('/api/notices/from-gmail/msg_123')
      .set(studentHeader);
    expect(gmailRes.status).toBe(403);

    // PATCH notice
    const patchRes = await request(app)
      .patch('/api/notices/some-id')
      .set(studentHeader)
      .send({ title: 'Edited' });
    expect(patchRes.status).toBe(403);

    // POST approve
    const approveRes = await request(app)
      .post('/api/notices/some-id/approve')
      .set(studentHeader);
    expect(approveRes.status).toBe(403);

    // POST publish
    const pubRes = await request(app)
      .post('/api/notices/some-id/publish')
      .set(studentHeader);
    expect(pubRes.status).toBe(403);

    // POST reject
    const rejRes = await request(app)
      .post('/api/notices/some-id/reject')
      .set(studentHeader);
    expect(rejRes.status).toBe(403);

    // POST archive
    const archRes = await request(app)
      .post('/api/notices/some-id/archive')
      .set(studentHeader);
    expect(archRes.status).toBe(403);

    // DELETE notice
    const delRes = await request(app)
      .delete('/api/notices/some-id')
      .set(studentHeader);
    expect(delRes.status).toBe(403);
  });

  it('verifies campus-wide visibility: Student B sees published notice from Reviewer A, but not unpublished notices', async () => {
    // Reviewer A creates notice (starts as pending)
    const createRes = await request(app)
      .post('/api/notices')
      .set('Authorization', 'Bearer reviewer_A')
      .send({
        title: 'Fall 2026 FAT Schedule Released',
        summary: 'Final assessment timetable published on VTOP for all B.Tech batches.',
        category: 'exam',
        priority: 'urgent',
        audience: 'All Undergraduates',
        importantDates: [{ label: 'Exam Starts', date: '2026-11-15' }],
        venue: 'SJT Hall',
        links: [{ label: 'VTOP Portal', url: 'https://vtop.vit.ac.in' }],
        source: {
          provider: 'gmail',
          messageId: 'fat_msg_1',
          sender: 'coe@vit.ac.in',
          subject: 'FAT Schedule',
        },
      });

    expect(createRes.status).toBe(201);
    const noticeId = createRes.body.id;
    expect(createRes.body.status).toBe('pending');
    expect(createRes.body.createdByUserId).toBe('reviewer_A');

    // Student B requests all notices: pending notice must NOT appear
    const studentList1 = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer student_2');
    expect(studentList1.status).toBe(200);
    expect(studentList1.body).toHaveLength(0);

    // Student B requests notice by ID: must return 404 to avoid leaking draft existence
    const studentGet1 = await request(app)
      .get(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer student_2');
    expect(studentGet1.status).toBe(404);

    // Reviewer A approves notice
    const approveRes = await request(app)
      .post(`/api/notices/${noticeId}/approve`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('approved');

    // Student B still cannot see approved notice before publishing
    const studentList2 = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer student_2');
    expect(studentList2.body).toHaveLength(0);

    // Reviewer B publishes notice (demonstrating reviewer cross-management)
    const publishRes = await request(app)
      .post(`/api/notices/${noticeId}/publish`)
      .set('Authorization', 'Bearer reviewer_B');
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe('published');
    expect(publishRes.body.publishedAt).not.toBeNull();

    // Now Student B can see published notice campus-wide!
    const studentList3 = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer student_2');
    expect(studentList3.status).toBe(200);
    expect(studentList3.body).toHaveLength(1);
    expect(studentList3.body[0].title).toBe('Fall 2026 FAT Schedule Released');
    expect(studentList3.body[0].category).toBe('exam');
    expect(studentList3.body[0].priority).toBe('urgent');
    expect(studentList3.body[0].links[0].url).toBe('https://vtop.vit.ac.in');

    // Student B can now also get by ID
    const studentGet2 = await request(app)
      .get(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer student_2');
    expect(studentGet2.status).toBe(200);
    expect(studentGet2.body.title).toBe('Fall 2026 FAT Schedule Released');
  });

  it('enforces strict lifecycle state machine and rejects invalid transitions', async () => {
    const createRes = await request(app)
      .post('/api/notices')
      .set('Authorization', 'Bearer reviewer_A')
      .send({
        title: 'Guest Lecture on AI',
        summary: 'Seminar in Anna Auditorium.',
        category: 'event',
        priority: 'normal',
        source: { provider: 'gmail', messageId: 'event_1', sender: 'events@vit.ac.in', subject: 'AI Talk' },
      });

    const noticeId = createRes.body.id;
    expect(createRes.body.status).toBe('pending');

    // Invalid: pending -> published directly (must be approved first)
    const directPub = await request(app)
      .post(`/api/notices/${noticeId}/publish`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(directPub.status).toBe(400);
    expect(directPub.body.error).toContain("Cannot transition notice from 'pending' to 'published'");

    // Invalid: pending -> archived directly
    const directArch = await request(app)
      .post(`/api/notices/${noticeId}/archive`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(directArch.status).toBe(400);

    // Valid: pending -> approved
    const appRes = await request(app)
      .post(`/api/notices/${noticeId}/approve`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(appRes.status).toBe(200);

    // Valid: approved -> published
    const pubRes = await request(app)
      .post(`/api/notices/${noticeId}/publish`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(pubRes.status).toBe(200);

    // Valid: published -> archived
    const archRes = await request(app)
      .post(`/api/notices/${noticeId}/archive`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(archRes.status).toBe(200);
    expect(archRes.body.status).toBe('archived');

    // Terminal: archived cannot transition back to approved or published
    const reviveRes = await request(app)
      .post(`/api/notices/${noticeId}/approve`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(reviveRes.status).toBe(400);

    // Editing an archived notice is rejected
    const editArch = await request(app)
      .patch(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer reviewer_A')
      .send({ title: 'New Title' });
    expect(editArch.status).toBe(400);
    expect(editArch.body.error).toContain('Archived notices cannot be modified');
  });

  it('tests rejection path: pending -> rejected -> archived', async () => {
    const createRes = await request(app)
      .post('/api/notices')
      .set('Authorization', 'Bearer reviewer_A')
      .send({
        title: 'Unverified Notice',
        summary: 'Contains questionable info.',
        category: 'general',
        priority: 'low',
        source: { provider: 'gmail', messageId: 'rej_1', sender: 'random@vit.ac.in', subject: 'Spam' },
      });

    const noticeId = createRes.body.id;

    // Valid: pending -> rejected
    const rejRes = await request(app)
      .post(`/api/notices/${noticeId}/reject`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(rejRes.status).toBe(200);
    expect(rejRes.body.status).toBe('rejected');

    // Invalid: rejected -> published (cannot publish rejected notice)
    const pubRes = await request(app)
      .post(`/api/notices/${noticeId}/publish`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(pubRes.status).toBe(400);

    // Valid: rejected -> archived
    const archRes = await request(app)
      .post(`/api/notices/${noticeId}/archive`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(archRes.status).toBe(200);
    expect(archRes.body.status).toBe('archived');
  });

  it('tests Gmail Ingestion with account-scoped idempotency and duplicate detection', async () => {
    // Connection 1: Reviewer A with Gmail Account X (dept@vit.ac.in)
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), 'reviewer_A', 'dept@vit.ac.in', 'token_A', 'refresh_A', 1700000000],
    );

    // Connection 2: Reviewer B with Gmail Account Y (events@vit.ac.in)
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), 'reviewer_B', 'events@vit.ac.in', 'token_B', 'refresh_B', 1700000000],
    );

    const emailBody = 'HackVIT 2026 registrations open on Devfolio with 5L prizes.';
    const encodedBody = Buffer.from(emailBody).toString('base64url');

    mockGet.mockResolvedValue({
      data: {
        id: 'msg_hack_101',
        threadId: 'thread_101',
        snippet: 'HackVIT 2026 registrations open...',
        payload: {
          headers: [
            { name: 'From', value: 'hackvit@vit.ac.in' },
            { name: 'To', value: 'dept@vit.ac.in' },
            { name: 'Subject', value: 'HackVIT 2026' },
            { name: 'Date', value: 'Sun, 30 Aug 2026 12:00:00 +0530' },
          ],
          mimeType: 'text/plain',
          body: { data: encodedBody },
        },
      },
    });

    const mockCandidate: NoticeCandidate = {
      title: 'HackVIT 2026: 36-Hour Hackathon',
      summary: 'Annual hackathon registrations are live on Devfolio.',
      category: 'event',
      priority: 'normal',
      venue: 'Anna Auditorium',
      links: [{ label: 'Devfolio', url: 'https://hackvit.devfolio.co' }],
      source: {
        provider: 'gmail',
        messageId: 'msg_hack_101',
        sender: 'hackvit@vit.ac.in',
        subject: 'HackVIT 2026',
      },
    };

    const mockAnalyzer: NoticeAnalyzer = {
      analyze: vi.fn().mockResolvedValue(mockCandidate),
    };
    setNoticeAnalyzer(mockAnalyzer);

    // 1. Reviewer A + Gmail Account X + Message msg_hack_101 -> Creates Notice 1
    const ingest1 = await request(app)
      .post('/api/notices/from-gmail/msg_hack_101')
      .set('Authorization', 'Bearer reviewer_A');

    expect(ingest1.status).toBe(201);
    expect(ingest1.body.title).toBe('HackVIT 2026: 36-Hour Hackathon');
    expect(ingest1.body.status).toBe('pending');
    expect(ingest1.body.sourceAccountEmail).toBe('dept@vit.ac.in');
    expect(ingest1.body.sourceMessageId).toBe('msg_hack_101');

    // 2. Reviewer A ingests same msg_hack_101 again under same Gmail Account X -> 409 Conflict Duplicate
    const ingestDuplicate = await request(app)
      .post('/api/notices/from-gmail/msg_hack_101')
      .set('Authorization', 'Bearer reviewer_A');

    expect(ingestDuplicate.status).toBe(409);
    expect(ingestDuplicate.body.error).toContain('already exists in the connected account');

    // 3. Reviewer B + Gmail Account Y (different account) + Message msg_hack_101 -> Does NOT collide!
    const ingestDifferentAccount = await request(app)
      .post('/api/notices/from-gmail/msg_hack_101')
      .set('Authorization', 'Bearer reviewer_B');

    expect(ingestDifferentAccount.status).toBe(201);
    expect(ingestDifferentAccount.body.sourceAccountEmail).toBe('events@vit.ac.in');
  });

  it('validates manual notice updates and rejects invalid categories and priorities', async () => {
    const createRes = await request(app)
      .post('/api/notices')
      .set('Authorization', 'Bearer reviewer_A')
      .send({
        title: 'Placement Talk',
        summary: 'Google Recruitment Prep Session.',
        category: 'placement',
        priority: 'important',
        source: { provider: 'gmail', messageId: 'place_1', sender: 'pat@vit.ac.in', subject: 'Talk' },
      });

    const noticeId = createRes.body.id;

    // Reject invalid category
    const badCat = await request(app)
      .patch(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer reviewer_A')
      .send({ category: 'invalid_category_xyz' });
    expect(badCat.status).toBe(422);

    // Reject invalid priority
    const badPri = await request(app)
      .patch(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer reviewer_A')
      .send({ priority: 'super_extreme' });
    expect(badPri.status).toBe(422);

    // Valid update
    const goodUpdate = await request(app)
      .patch(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer reviewer_A')
      .send({
        title: 'Updated Google Placement Talk',
        venue: 'Technology Tower Auditorium',
      });
    expect(goodUpdate.status).toBe(200);
    expect(goodUpdate.body.title).toBe('Updated Google Placement Talk');
    expect(goodUpdate.body.venue).toBe('Technology Tower Auditorium');
  });

  it('supports filtering notices by category, priority, status, and search term', async () => {
    // Create 2 notices
    await pool.query(
      `
      INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, venue, created_at, published_at)
      VALUES 
      ($1, 'reviewer_A', 'FAT Exam Instructions', 'Check seating arrangement', 'exam', 'urgent', 'published', 'SJT 101', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ($2, 'reviewer_A', 'Robotics Club Hackathon', 'Register on Devfolio', 'event', 'normal', 'published', 'Anna Audi', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ($3, 'reviewer_A', 'Hostel Gate Timings Draft', 'Curfew info', 'hostel', 'low', 'pending', 'Hostel Office', CURRENT_TIMESTAMP, NULL)
      `,
      [randomUUID(), randomUUID(), randomUUID()],
    );

    // Student filters by category=exam
    const catRes = await request(app)
      .get('/api/notices?category=exam')
      .set('Authorization', 'Bearer student_1');
    expect(catRes.status).toBe(200);
    expect(catRes.body).toHaveLength(1);
    expect(catRes.body[0].title).toBe('FAT Exam Instructions');

    // Student searches for 'Robotics'
    const searchRes = await request(app)
      .get('/api/notices?search=Robotics')
      .set('Authorization', 'Bearer student_1');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body).toHaveLength(1);
    expect(searchRes.body[0].title).toBe('Robotics Club Hackathon');

    // Reviewer filters by status=pending
    const revPending = await request(app)
      .get('/api/notices?status=pending')
      .set('Authorization', 'Bearer reviewer_A');
    expect(revPending.status).toBe(200);
    expect(revPending.body).toHaveLength(1);
    expect(revPending.body[0].title).toBe('Hostel Gate Timings Draft');
  });

  it('deletes a notice successfully when invoked by a reviewer, cleans up notifications, and blocks students with 403', async () => {
    const createRes = await request(app)
      .post('/api/notices')
      .set('Authorization', 'Bearer reviewer_A')
      .send({
        title: 'Notice to Delete',
        summary: 'Will be deleted.',
        category: 'general',
        priority: 'low',
        source: { provider: 'gmail', messageId: 'del_1', sender: 'test', subject: 'test' },
      });

    const noticeId = createRes.body.id;

    // Add a notification referencing the notice
    await pool.query(
      `
      INSERT INTO notifications (id, recipient_role, title, message, type, notice_id, is_read)
      VALUES ($1, 'all', 'Notice Created', 'Check notice', 'notice_published', $2, false)
      `,
      [randomUUID(), noticeId],
    );

    // Student attempt -> 403 Forbidden
    const studentDelRes = await request(app)
      .delete(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer student_1');
    expect(studentDelRes.status).toBe(403);

    // Reviewer attempt -> 204 No Content
    const delRes = await request(app)
      .delete(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(delRes.status).toBe(204);

    // Verify notice is gone
    const checkRes = await request(app)
      .get(`/api/notices/${noticeId}`)
      .set('Authorization', 'Bearer reviewer_A');
    expect(checkRes.status).toBe(404);

    // Verify associated notification was cleaned up
    const { rows: notifRows } = await pool.query('SELECT * FROM notifications WHERE notice_id = $1', [noticeId]);
    expect(notifRows).toHaveLength(0);
  });
});

