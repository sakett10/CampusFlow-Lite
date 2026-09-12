import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { Webhook } from 'standardwebhooks';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

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
      gmail: vi.fn(),
    },
  };
});

// Mock Clerk middleware
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        req.auth = { userId: token, sessionClaims: {} };
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
import { userLifecycleService } from './services/userLifecycle.service.js';
import {
  acquireUserAdvisoryLock,
  releaseUserAdvisoryLock,
} from './services/gmail.service.js';
import { encryptToken } from './services/crypto.service.js';
import { noticesService } from './services/notices.service.js';

describe('Phase 3A: Secure Clerk User-Deletion Lifecycle Suite', () => {
  const TEST_WEBHOOK_SECRET = 'whsec_dGVzdHNlY3JldDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=';
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.CLERK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.REVIEWER_USER_IDS = 'reviewer_lead,reviewer_2';
    process.env.ADMIN_USER_IDS = 'admin_lead';

    // Clear all test tables in clean order
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM courses');
    await pool.query('DELETE FROM campus_items');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM notification_dismissals');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM notice_suppressions');

    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function generateSignedWebhook(
    payloadObj: Record<string, unknown>,
    options?: { secret?: string; timestamp?: number; msgId?: string },
  ) {
    const secret = options?.secret || TEST_WEBHOOK_SECRET;
    const msgId = options?.msgId || `msg_${randomUUID()}`;
    const timestampSec = options?.timestamp ?? Math.floor(Date.now() / 1000);
    const bodyStr = JSON.stringify(payloadObj);

    const wh = new Webhook(secret);
    const sig = wh.sign(msgId, new Date(timestampSec * 1000), bodyStr);

    return {
      bodyStr,
      headers: {
        'svix-id': msgId,
        'svix-timestamp': timestampSec.toString(),
        'svix-signature': sig,
        'content-type': 'application/json',
      },
    };
  }

  // ==========================================
  // 1. Webhook Signature Verification Suite
  // ==========================================
  describe('1. Webhook Verification & Routing', () => {
    it('1.1. accepts and processes a valid signed user.deleted event', async () => {
      const userToDelete = 'user_clerk_del_101';
      await pool.query(
        `INSERT INTO courses (id, user_id, code, title, instructor)
         VALUES ($1, $2, 'CS101', 'Intro to CS', 'Prof. Smith')`,
        [randomUUID(), userToDelete],
      );

      const { bodyStr, headers } = generateSignedWebhook({
        type: 'user.deleted',
        data: { id: userToDelete, deleted: true },
      });

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe(userToDelete);

      // Verify DB record was purged
      const { rows } = await pool.query('SELECT * FROM courses WHERE user_id = $1', [userToDelete]);
      expect(rows).toHaveLength(0);
    });

    it('1.2. rejects request missing svix-id', async () => {
      const { bodyStr, headers } = generateSignedWebhook({
        type: 'user.deleted',
        data: { id: 'user_x' },
      });
      delete (headers as Record<string, string>)['svix-id'];

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing required webhook verification headers/i);
    });

    it('1.3. rejects request missing svix-timestamp', async () => {
      const { bodyStr, headers } = generateSignedWebhook({
        type: 'user.deleted',
        data: { id: 'user_x' },
      });
      delete (headers as Record<string, string>)['svix-timestamp'];

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing required webhook verification headers/i);
    });

    it('1.4. rejects request missing svix-signature', async () => {
      const { bodyStr, headers } = generateSignedWebhook({
        type: 'user.deleted',
        data: { id: 'user_x' },
      });
      delete (headers as Record<string, string>)['svix-signature'];

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing required webhook verification headers/i);
    });

    it('1.5. rejects request with forged or invalid signature', async () => {
      const { bodyStr, headers } = generateSignedWebhook({
        type: 'user.deleted',
        data: { id: 'user_x' },
      });
      headers['svix-signature'] = 'v1,invalidBase64SignatureHere===================';

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid webhook signature/i);
    });

    it('1.6. rejects request when payload is tampered after signing', async () => {
      const { headers } = generateSignedWebhook({
        type: 'user.deleted',
        data: { id: 'user_legit' },
      });
      const tamperedBody = JSON.stringify({
        type: 'user.deleted',
        data: { id: 'user_tampered_target' },
      });

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(tamperedBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid webhook signature/i);
    });

    it('1.7. rejects replayed or stale webhook (timestamp older than 5 minutes)', async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago (> 300s window)
      const { bodyStr, headers } = generateSignedWebhook(
        { type: 'user.deleted', data: { id: 'user_x' } },
        { timestamp: staleTimestamp },
      );

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid webhook signature or expired timestamp/i);
    });

    it('1.8. safely ignores non-user.deleted event types with HTTP 200', async () => {
      const { bodyStr, headers } = generateSignedWebhook({
        type: 'user.updated',
        data: { id: 'user_updated_102', first_name: 'Alex' },
      });

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.ignored).toBe(true);
      expect(res.body.type).toBe('user.updated');
    });

    it('1.9. returns 400 for user.deleted event with missing data.id', async () => {
      const { bodyStr, headers } = generateSignedWebhook({
        type: 'user.deleted',
        data: {},
      });

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing user id/i);
    });

    it('1.10. returns 500 when CLERK_WEBHOOK_SECRET is unset on server', async () => {
      delete process.env.CLERK_WEBHOOK_SECRET;

      const { bodyStr, headers } = generateSignedWebhook({
        type: 'user.deleted',
        data: { id: 'user_x' },
      });

      const res = await request(app)
        .post('/api/webhooks/clerk')
        .set(headers)
        .send(bodyStr);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook configuration error');
    });
  });

  // ==========================================
  // 2. Comprehensive Deletion Lifecycle
  // ==========================================
  describe('2. User Data Purge Lifecycle', () => {
    it('2.1. purges user-owned records across all application tables', async () => {
      const user = 'user_full_purge_test';
      const courseId = randomUUID();
      const noticeId = randomUUID();
      const broadcastNotifId = randomUUID();

      // 1. Seed courses & assignments
      await pool.query(
        `INSERT INTO courses (id, user_id, code, title, instructor)
         VALUES ($1, $2, 'MATH201', 'Calculus', 'Dr. Euler')`,
        [courseId, user],
      );
      await pool.query(
        `INSERT INTO assignments (id, user_id, course_id, title, status)
         VALUES ($1, $2, $3, 'Problem Set 1', 'PENDING')`,
        [randomUUID(), user, courseId],
      );

      // 2. Seed campus items
      await pool.query(
        `INSERT INTO campus_items (id, user_id, title, type)
         VALUES ($1, $2, 'Study Group', 'EVENT')`,
        [randomUUID(), user],
      );

      // 3. Seed Gmail connection, emails, and processed messages
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token)
         VALUES ($1, $2, 'student@vit.ac.in', $3, $4)`,
        [randomUUID(), user, encryptToken('access_tok_1'), encryptToken('refresh_tok_1')],
      );
      await pool.query(
        `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject, body_text)
         VALUES ($1, $2, 'student@vit.ac.in', 'msg_101', 'Exam Circular', 'Raw email content here')`,
        [randomUUID(), user],
      );
      await pool.query(
        `INSERT INTO processed_gmail_messages (id, user_id, gmail_message_id)
         VALUES ($1, $2, 'msg_101')`,
        [randomUUID(), user],
      );

      // 4. Seed user-specific notifications & dismissals
      await pool.query(
        `INSERT INTO notifications (id, user_id, recipient_role, title, message, type)
         VALUES ($1, $2, 'student', 'Personal Alert', 'Your deadline is tomorrow', 'deadline_reminder')`,
        [randomUUID(), user],
      );
      await pool.query(
        `INSERT INTO notification_dismissals (user_id, notification_id)
         VALUES ($1, $2)`,
        [user, 'notif_dimissed_123'],
      );

      // 5. Seed broadcast notification with user in read_by array
      await pool.query(
        `INSERT INTO notifications (id, user_id, recipient_role, title, message, type, read_by)
         VALUES ($1, NULL, 'all', 'Global Notice', 'Campus closed on Friday', 'system', $2)`,
        [broadcastNotifId, JSON.stringify([user, 'other_student_1'])],
      );

      // 6. Seed unpublished student notice and notification referencing it
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
         VALUES ($1, $2, 'Draft Notice', 'Draft summary', 'event', 'low', 'pending')`,
        [noticeId, user],
      );
      await pool.query(
        `INSERT INTO notifications (id, user_id, recipient_role, title, message, type, notice_id)
         VALUES ($1, $2, 'all', 'Pending Notice Alert', 'Review notice', 'pending_review', $3)`,
        [randomUUID(), user, noticeId],
      );

      // 7. Seed global notice_suppressions (must NOT be deleted)
      await pool.query(
        `INSERT INTO notice_suppressions (id, source_account_email, source_message_id, normalized_fingerprint)
         VALUES ($1, 'student@vit.ac.in', 'msg_101', 'fingerprint_hash')`,
        [randomUUID()],
      );

      // Execute Deletion
      const result = await userLifecycleService.deleteUserData(user);

      expect(result.success).toBe(true);
      expect(result.purged.assignments).toBe(1);
      expect(result.purged.courses).toBe(1);
      expect(result.purged.campusItems).toBe(1);
      expect(result.purged.gmailConnection).toBe(true);
      expect(result.purged.campusEmails).toBe(1);
      expect(result.purged.processedMessages).toBe(1);
      expect(result.purged.notificationDismissals).toBe(1);
      expect(result.purged.noticesDeleted).toBe(1);

      // Verify zero remaining user records in DB
      const { rows: aRows } = await pool.query('SELECT * FROM assignments WHERE user_id = $1', [user]);
      const { rows: cRows } = await pool.query('SELECT * FROM courses WHERE user_id = $1', [user]);
      const { rows: ciRows } = await pool.query('SELECT * FROM campus_items WHERE user_id = $1', [user]);
      const { rows: gcRows } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [user]);
      const { rows: ceRows } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [user]);
      const { rows: pmRows } = await pool.query('SELECT * FROM processed_gmail_messages WHERE user_id = $1', [user]);
      const { rows: nTargetRows } = await pool.query('SELECT * FROM notifications WHERE user_id = $1', [user]);
      const { rows: ndRows } = await pool.query('SELECT * FROM notification_dismissals WHERE user_id = $1', [user]);
      const { rows: nDraftRows } = await pool.query('SELECT * FROM notices WHERE created_by_user_id = $1', [user]);

      expect(aRows).toHaveLength(0);
      expect(cRows).toHaveLength(0);
      expect(ciRows).toHaveLength(0);
      expect(gcRows).toHaveLength(0);
      expect(ceRows).toHaveLength(0);
      expect(pmRows).toHaveLength(0);
      expect(nTargetRows).toHaveLength(0);
      expect(ndRows).toHaveLength(0);
      expect(nDraftRows).toHaveLength(0);

      // Verify broadcast notification was preserved, but user was pruned from read_by
      const { rows: bRows } = await pool.query('SELECT * FROM notifications WHERE id = $1', [broadcastNotifId]);
      expect(bRows).toHaveLength(1);
      const updatedReadBy = bRows[0].read_by;
      expect(updatedReadBy).not.toContain(user);
      expect(updatedReadBy).toContain('other_student_1');

      // Verify notice_suppressions remains untouched
      const { rows: suppRows } = await pool.query('SELECT * FROM notice_suppressions');
      expect(suppRows).toHaveLength(1);
    });
  });

  // ==========================================
  // 3. Institutional Notice Preservation
  // ==========================================
  describe('3. Institutional Notice Preservation', () => {
    it('3.1. preserves published campus notices and re-assigns them to admin, while deleting unpublished notices', async () => {
      const reviewer = 'reviewer_lead';
      const publishedNoticeId = randomUUID();
      const draftNoticeId = randomUUID();

      // Seed 1 published campus notice
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status, published_at
        ) VALUES ($1, $2, 'Official Exam Schedule', 'Schedule published', 'exam', 'high', 'published', CURRENT_TIMESTAMP)`,
        [publishedNoticeId, reviewer],
      );

      // Seed 1 unpublished draft notice
      await pool.query(
        `INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority, status
        ) VALUES ($1, $2, 'Unpublished Review Draft', 'Draft summary', 'academic', 'low', 'pending')`,
        [draftNoticeId, reviewer],
      );

      const result = await userLifecycleService.deleteUserData(reviewer);

      expect(result.success).toBe(true);
      expect(result.purged.noticesDeleted).toBe(1);
      expect(result.purged.noticesPreserved).toBe(1);

      // 1. Unpublished draft notice is deleted
      const { rows: draftRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [draftNoticeId]);
      expect(draftRows).toHaveLength(0);

      // 2. Published campus notice remains in DB, re-assigned to 'admin'
      const { rows: pubRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [publishedNoticeId]);
      expect(pubRows).toHaveLength(1);
      expect(pubRows[0].status).toBe('published');
      expect(pubRows[0].created_by_user_id).toBe('admin');

      // 3. Verify it is still visible to students via noticesService.getAll
      const studentNotices = await noticesService.getAll({
        isReviewer: false,
        userId: 'student_normal_viewer',
      });
      const found = studentNotices.find((n) => n.id === publishedNoticeId);
      expect(found).toBeDefined();
      expect(found?.title).toBe('Official Exam Schedule');
    });
  });

  // ==========================================
  // 4. Strict Tenant Isolation
  // ==========================================
  describe('4. Tenant Isolation', () => {
    it('4.1. deleting User A leaves User B data completely untouched', async () => {
      const userA = 'student_A';
      const userB = 'student_B';

      const courseB = randomUUID();
      const assignB = randomUUID();

      // Seed User A data
      await pool.query(
        `INSERT INTO courses (id, user_id, code, title, instructor) VALUES ($1, $2, 'CS101', 'A Course', 'Prof. A')`,
        [randomUUID(), userA],
      );
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token) VALUES ($1, $2, 'a@vit.ac.in', 'tA', 'rA')`,
        [randomUUID(), userA],
      );

      // Seed User B data across all tables
      await pool.query(
        `INSERT INTO courses (id, user_id, code, title, instructor) VALUES ($1, $2, 'CS202', 'B Course', 'Prof. B')`,
        [courseB, userB],
      );
      await pool.query(
        `INSERT INTO assignments (id, user_id, course_id, title, status) VALUES ($1, $2, $3, 'B Assignment', 'PENDING')`,
        [assignB, userB, courseB],
      );
      await pool.query(
        `INSERT INTO campus_items (id, user_id, title, type) VALUES ($1, $2, 'B Event', 'EVENT')`,
        [randomUUID(), userB],
      );
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token) VALUES ($1, $2, 'b@vit.ac.in', 'tB', 'rB')`,
        [randomUUID(), userB],
      );
      await pool.query(
        `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject) VALUES ($1, $2, 'b@vit.ac.in', 'msg_B', 'B Subject')`,
        [randomUUID(), userB],
      );
      await pool.query(
        `INSERT INTO processed_gmail_messages (id, user_id, gmail_message_id) VALUES ($1, $2, 'msg_B')`,
        [randomUUID(), userB],
      );
      await pool.query(
        `INSERT INTO notifications (id, user_id, recipient_role, title, message, type) VALUES ($1, $2, 'student', 'B Notif', 'Hello B', 'system')`,
        [randomUUID(), userB],
      );
      await pool.query(
        `INSERT INTO notification_dismissals (user_id, notification_id) VALUES ($1, 'notif_B')`,
        [userB],
      );

      // Delete User A
      const res = await userLifecycleService.deleteUserData(userA);
      expect(res.success).toBe(true);

      // Verify User B still has all records
      const { rows: bCourses } = await pool.query('SELECT * FROM courses WHERE user_id = $1', [userB]);
      const { rows: bAssigns } = await pool.query('SELECT * FROM assignments WHERE user_id = $1', [userB]);
      const { rows: bItems } = await pool.query('SELECT * FROM campus_items WHERE user_id = $1', [userB]);
      const { rows: bConn } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [userB]);
      const { rows: bEmails } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [userB]);
      const { rows: bProc } = await pool.query('SELECT * FROM processed_gmail_messages WHERE user_id = $1', [userB]);
      const { rows: bNotifs } = await pool.query('SELECT * FROM notifications WHERE user_id = $1', [userB]);
      const { rows: bDism } = await pool.query('SELECT * FROM notification_dismissals WHERE user_id = $1', [userB]);

      expect(bCourses).toHaveLength(1);
      expect(bAssigns).toHaveLength(1);
      expect(bItems).toHaveLength(1);
      expect(bConn).toHaveLength(1);
      expect(bEmails).toHaveLength(1);
      expect(bProc).toHaveLength(1);
      expect(bNotifs).toHaveLength(1);
      expect(bDism).toHaveLength(1);
    });
  });

  // ==========================================
  // 5. Idempotency Suite
  // ==========================================
  describe('5. Idempotency', () => {
    it('5.1. multiple sequential invocations for the same user succeed cleanly', async () => {
      const user = 'user_idempotent_test';

      await pool.query(
        `INSERT INTO courses (id, user_id, code, title, instructor) VALUES ($1, $2, 'CS101', 'Algorithms', 'Prof. A')`,
        [randomUUID(), user],
      );

      // First run: deletes data
      const run1 = await userLifecycleService.deleteUserData(user);
      expect(run1.success).toBe(true);
      expect(run1.purged.courses).toBe(1);

      // Second run: no records, succeeds safely
      const run2 = await userLifecycleService.deleteUserData(user);
      expect(run2.success).toBe(true);
      expect(run2.purged.courses).toBe(0);
      expect(run2.purged.gmailConnection).toBe(false);

      // Third run: still succeeds safely
      const run3 = await userLifecycleService.deleteUserData(user);
      expect(run3.success).toBe(true);
      expect(run3.purged.courses).toBe(0);
    });
  });

  // ==========================================
  // 6. Google OAuth Revocation
  // ==========================================
  describe('6. Google OAuth Revocation', () => {
    it('6.1. uses decrypted refresh token for Google revocation when present', async () => {
      const user = 'user_revoke_refresh';
      const rawRefresh = 'secret_refresh_token_123';
      const rawAccess = 'secret_access_token_456';

      mockRevokeToken.mockReset();
      mockRevokeToken.mockResolvedValue({});

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token)
         VALUES ($1, $2, 'rev@vit.ac.in', $3, $4)`,
        [randomUUID(), user, encryptToken(rawAccess), encryptToken(rawRefresh)],
      );

      const res = await userLifecycleService.deleteUserData(user);
      expect(res.success).toBe(true);
      expect(res.googleTokenRevoked).toBe(true);

      expect(mockRevokeToken).toHaveBeenCalledTimes(1);
      expect(mockRevokeToken).toHaveBeenCalledWith(rawRefresh);
    });

    it('6.2. falls back to access token when refresh token is missing', async () => {
      const user = 'user_revoke_access';
      const rawAccess = 'secret_access_only_789';

      mockRevokeToken.mockReset();
      mockRevokeToken.mockResolvedValue({});

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token)
         VALUES ($1, $2, 'rev2@vit.ac.in', $3, '')`,
        [randomUUID(), user, encryptToken(rawAccess)],
      );

      const res = await userLifecycleService.deleteUserData(user);
      expect(res.success).toBe(true);
      expect(res.googleTokenRevoked).toBe(true);

      expect(mockRevokeToken).toHaveBeenCalledTimes(1);
      expect(mockRevokeToken).toHaveBeenCalledWith(rawAccess);
    });

    it('6.3. revocation failure does NOT prevent local database purge', async () => {
      const user = 'user_revoke_fail';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockRevokeToken.mockReset();
      mockRevokeToken.mockRejectedValue(new Error('Google API network timeout'));

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token)
         VALUES ($1, $2, 'rev3@vit.ac.in', $3, $4)`,
        [randomUUID(), user, encryptToken('acc'), encryptToken('ref')],
      );

      const res = await userLifecycleService.deleteUserData(user);
      expect(res.success).toBe(true);
      expect(res.googleTokenRevoked).toBe(false);

      // Local record was still purged
      const { rows } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [user]);
      expect(rows).toHaveLength(0);

      // Ensure raw tokens are NOT logged
      for (const call of warnSpy.mock.calls) {
        const loggedText = call.map(String).join(' ');
        expect(loggedText).not.toContain('acc');
        expect(loggedText).not.toContain('ref');
      }
    });
  });

  // ==========================================
  // 7. Concurrency & Advisory Locking
  // ==========================================
  describe('7. Concurrency & Advisory Lock Coordination', () => {
    it('7.1. deletion waits for an existing advisory lock held by sync before executing', async () => {
      const user = 'user_concurrent_sync';

      await pool.query(
        `INSERT INTO courses (id, user_id, code, title, instructor)
         VALUES ($1, $2, 'CS303', 'Concurrent Systems', 'Prof. C')`,
        [randomUUID(), user],
      );

      // External client holds the user's advisory lock (simulating an active sync running in another worker)
      const syncLockClient = await pool.connect();
      await acquireUserAdvisoryLock(syncLockClient, user, false);

      let deleteFinished = false;
      const deletePromise = userLifecycleService.deleteUserData(user).then((res) => {
        deleteFinished = true;
        return res;
      });

      // Give event loop time to verify deletion is blocked waiting for lock
      await new Promise((r) => setTimeout(r, 50));
      expect(deleteFinished).toBe(false);

      // Check that courses still exist while lock is held
      const { rows: duringRows } = await pool.query('SELECT * FROM courses WHERE user_id = $1', [user]);
      expect(duringRows).toHaveLength(1);

      // Simulate sync completing and releasing advisory lock
      await releaseUserAdvisoryLock(syncLockClient, user);
      syncLockClient.release();

      // Deletion unblocks and completes
      const result = await deletePromise;
      expect(deleteFinished).toBe(true);
      expect(result.success).toBe(true);
      expect(result.purged.courses).toBe(1);

      const { rows: afterRows } = await pool.query('SELECT * FROM courses WHERE user_id = $1', [user]);
      expect(afterRows).toHaveLength(0);
    });
  });
});
