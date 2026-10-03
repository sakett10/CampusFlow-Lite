import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

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
    },
  };
});

import { pool } from './db.js';
import { userLifecycleService } from './services/userLifecycle.service.js';

describe('CF-SEC-03: Account Deletion Personal Notice Handling', () => {
  const userA = 'student_user_A';
  const userB = 'student_user_B';

  beforeEach(async () => {
    await pool.query('DELETE FROM notice_attachments');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM courses');
    await pool.query('DELETE FROM campus_items');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM notification_dismissals');
    await pool.query('DELETE FROM push_subscriptions');
    await pool.query('DELETE FROM user_preferences');

    vi.clearAllMocks();
  });

  it('1. deletes personal Gmail notices (even if status = published) and NEVER reassigns them to admin', async () => {
    const personalNoticeId = randomUUID();
    const institutionalPublishedId = randomUUID();
    const institutionalDraftId = randomUUID();

    // 1. User A personal Gmail notice (published status)
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status, source_type, source_provider, source_message_id, published_at
      ) VALUES ($1, $2, 'Personal Tuition Reminder', 'Private tuition note', 'academic', 'high', 'published', 'gmail_personal', 'gmail', 'msg_pers_1', CURRENT_TIMESTAMP)`,
      [personalNoticeId, userA],
    );

    // 2. User A institutional notice (published status)
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status, source_type, source_provider, published_at
      ) VALUES ($1, $2, 'Official Convocation Bulletin', 'Campus wide notice', 'event', 'high', 'published', 'institutional', 'manual', CURRENT_TIMESTAMP)`,
      [institutionalPublishedId, userA],
    );

    // 3. User A institutional notice (draft status)
    await pool.query(
      `INSERT INTO notices (
        id, created_by_user_id, title, summary, category, priority, status, source_type, source_provider
      ) VALUES ($1, $2, 'Draft Institutional Notice', 'Unpublished draft', 'academic', 'low', 'pending', 'institutional', 'manual')`,
      [institutionalDraftId, userA],
    );

    // Seed notifications for all 3
    const personalNotifId = randomUUID();
    await pool.query(
      `INSERT INTO notifications (id, user_id, recipient_role, title, message, type, notice_id)
       VALUES ($1, $2, 'student', 'Tuition Alert', 'Payment due', 'deadline_reminder', $3)`,
      [personalNotifId, userA, personalNoticeId],
    );

    // Execute deletion of User A
    const result = await userLifecycleService.deleteUserData(userA);

    expect(result.success).toBe(true);
    // Deleted: 1 personal notice + 1 draft institutional notice = 2
    expect(result.purged.noticesDeleted).toBe(2);
    // Preserved: 1 published institutional notice = 1
    expect(result.purged.noticesPreserved).toBe(1);

    // Verify personal Gmail notice is completely DELETED from DB
    const { rows: persRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [personalNoticeId]);
    expect(persRows).toHaveLength(0);

    // Verify personal notice was NOT reassigned to admin
    const { rows: adminPersRows } = await pool.query(
      `SELECT * FROM notices WHERE created_by_user_id = 'admin' AND title = 'Personal Tuition Reminder'`,
    );
    expect(adminPersRows).toHaveLength(0);

    // Verify draft institutional notice is deleted
    const { rows: draftRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [institutionalDraftId]);
    expect(draftRows).toHaveLength(0);

    // Verify published institutional notice was PRESERVED and reassigned to admin
    const { rows: instRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [institutionalPublishedId]);
    expect(instRows).toHaveLength(1);
    expect(instRows[0].created_by_user_id).toBe('admin');
    expect(instRows[0].status).toBe('published');
    expect(instRows[0].source_type).toBe('institutional');

    // Verify referencing notification for personal notice was deleted
    const { rows: persNotifRows } = await pool.query('SELECT * FROM notifications WHERE id = $1', [personalNotifId]);
    expect(persNotifRows).toHaveLength(0);
  });

  it('2. preserves published institutional notice attachments and reassigns them to admin while deleting personal notice attachments', async () => {
    const personalNoticeId = randomUUID();
    const instNoticeId = randomUUID();

    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type, published_at)
       VALUES ($1, $2, 'Personal Notice', 'Summary', 'general', 'low', 'published', 'gmail_personal', CURRENT_TIMESTAMP)`,
      [personalNoticeId, userA],
    );

    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type, published_at)
       VALUES ($1, $2, 'Institutional Bulletin', 'Summary', 'general', 'high', 'published', 'institutional', CURRENT_TIMESTAMP)`,
      [instNoticeId, userA],
    );

    const persAttachId = randomUUID();
    const instAttachId = randomUUID();

    await pool.query(
      `INSERT INTO notice_attachments (id, notice_id, user_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'personal_bill.pdf', 'application/pdf', 1024, 'notices/p1/bill.pdf'),
              ($4, $5, $3, 'official_bulletin.pdf', 'application/pdf', 2048, 'notices/i1/bulletin.pdf')`,
      [persAttachId, personalNoticeId, userA, instAttachId, instNoticeId],
    );

    // Execute deletion
    await userLifecycleService.deleteUserData(userA);

    // Personal notice attachment must be gone
    const { rows: persAttach } = await pool.query('SELECT * FROM notice_attachments WHERE id = $1', [persAttachId]);
    expect(persAttach).toHaveLength(0);

    // Institutional notice attachment must be preserved and reassigned to admin
    const { rows: instAttach } = await pool.query('SELECT * FROM notice_attachments WHERE id = $1', [instAttachId]);
    expect(instAttach).toHaveLength(1);
    expect(instAttach[0].user_id).toBe('admin');
  });

  it('3. maintains strict tenant isolation: User B data is completely unaffected by User A deletion', async () => {
    const noticeB = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type, published_at)
       VALUES ($1, $2, 'User B Personal', 'Summary B', 'academic', 'low', 'published', 'gmail_personal', CURRENT_TIMESTAMP)`,
      [noticeB, userB],
    );

    const assignB = randomUUID();
    await pool.query(
      `INSERT INTO assignments (id, user_id, title, status, source)
       VALUES ($1, $2, 'User B Assignment', 'PENDING', 'manual')`,
      [assignB, userB],
    );

    // Delete User A
    await userLifecycleService.deleteUserData(userA);

    // User B personal notice and assignment remain 100% intact
    const { rows: nRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [noticeB]);
    expect(nRows).toHaveLength(1);
    expect(nRows[0].created_by_user_id).toBe(userB);

    const { rows: aRows } = await pool.query('SELECT * FROM assignments WHERE id = $1', [assignB]);
    expect(aRows).toHaveLength(1);
    expect(aRows[0].user_id).toBe(userB);
  });

  it('4. executes idempotently with zero errors on repeated deletion of the same user', async () => {
    // First deletion
    const res1 = await userLifecycleService.deleteUserData(userA);
    expect(res1.success).toBe(true);

    // Second deletion (idempotent)
    const res2 = await userLifecycleService.deleteUserData(userA);
    expect(res2.success).toBe(true);
    expect(res2.purged.noticesDeleted).toBe(0);
    expect(res2.purged.noticesPreserved).toBe(0);
  });
});
