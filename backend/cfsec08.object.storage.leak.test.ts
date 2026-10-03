import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import { getObjectStorageDriver } from './services/objectStorage.service.js';
import { noticesService } from './services/notices.service.js';
import { userLifecycleService } from './services/userLifecycle.service.js';
import { disconnectGmailForUser } from './services/gmail.service.js';

describe('CF-SEC-08: Object Storage Orphan Cleanup', () => {
  const reviewer = 'rev_lead';
  const student = 'student_storage_user';
  const driver = getObjectStorageDriver();

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
    await pool.query('DELETE FROM push_subscriptions');
    await pool.query('DELETE FROM user_preferences');

    vi.clearAllMocks();
  });

  it('1. noticesService.delete removes attachment binary from object storage driver when notice is deleted', async () => {
    const noticeId = randomUUID();
    const attachId = randomUUID();
    const storageKey = `notices/${noticeId}/syllabus.pdf`;

    // Put file in object storage
    await driver.put(storageKey, Buffer.from('PDF content'), 'application/pdf');
    expect(await driver.exists(storageKey)).toBe(true);

    // Insert institutional notice
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, $2, 'Course Syllabus Notice', 'Summary', 'academic', 'medium', 'published', 'institutional')`,
      [noticeId, reviewer],
    );

    // Insert notice_attachment
    await pool.query(
      `INSERT INTO notice_attachments (id, notice_id, user_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'syllabus.pdf', 'application/pdf', 1024, $4)`,
      [attachId, noticeId, reviewer, storageKey],
    );

    // Delete notice
    const deleted = await noticesService.delete(noticeId);
    expect(deleted).toBe(true);

    // Verify row deleted from PostgreSQL
    const { rows: nRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [noticeId]);
    expect(nRows).toHaveLength(0);
    const { rows: aRows } = await pool.query('SELECT * FROM notice_attachments WHERE id = $1', [attachId]);
    expect(aRows).toHaveLength(0);

    // Verify binary removed from object storage driver
    expect(await driver.exists(storageKey)).toBe(false);
  });

  it('2. does NOT delete storage binary if another attachment still references the storage key (shared key / deduplication safety)', async () => {
    const notice1Id = randomUUID();
    const notice2Id = randomUUID();
    const attach1Id = randomUUID();
    const attach2Id = randomUUID();
    const sharedKey = `notices/shared/handbook.pdf`;

    await driver.put(sharedKey, Buffer.from('Handbook content'), 'application/pdf');

    // Notice 1
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, $2, 'Handbook Notice 1', 'Summary', 'general', 'medium', 'published', 'institutional')`,
      [notice1Id, reviewer],
    );
    await pool.query(
      `INSERT INTO notice_attachments (id, notice_id, user_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'handbook.pdf', 'application/pdf', 2048, $4)`,
      [attach1Id, notice1Id, reviewer, sharedKey],
    );

    // Notice 2 referencing the SAME storageKey
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, $2, 'Handbook Notice 2', 'Summary', 'general', 'medium', 'published', 'institutional')`,
      [notice2Id, reviewer],
    );
    await pool.query(
      `INSERT INTO notice_attachments (id, notice_id, user_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'handbook.pdf', 'application/pdf', 2048, $4)`,
      [attach2Id, notice2Id, reviewer, sharedKey],
    );

    // Delete Notice 1
    await noticesService.delete(notice1Id);

    // Storage object must still exist because Notice 2 still references sharedKey!
    expect(await driver.exists(sharedKey)).toBe(true);

    // Delete Notice 2
    await noticesService.delete(notice2Id);

    // Now that 0 references remain, the storage object is purged!
    expect(await driver.exists(sharedKey)).toBe(false);
  });

  it('3. userLifecycleService.deleteUserData deletes storage blobs for personal notices while preserving blobs for institutional notices', async () => {
    const personalNoticeId = randomUUID();
    const instNoticeId = randomUUID();
    const persKey = `notices/${personalNoticeId}/private_bill.pdf`;
    const instKey = `notices/${instNoticeId}/official_flyer.pdf`;

    await driver.put(persKey, Buffer.from('Private PDF'), 'application/pdf');
    await driver.put(instKey, Buffer.from('Official PDF'), 'application/pdf');

    // Personal notice
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type, published_at)
       VALUES ($1, $2, 'Personal Bill', 'Private', 'academic', 'low', 'published', 'gmail_personal', CURRENT_TIMESTAMP)`,
      [personalNoticeId, student],
    );
    await pool.query(
      `INSERT INTO notice_attachments (id, notice_id, user_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'private_bill.pdf', 'application/pdf', 512, $4)`,
      [randomUUID(), personalNoticeId, student, persKey],
    );

    // Institutional published notice
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type, published_at)
       VALUES ($1, $2, 'Official Flyer', 'Campus flyer', 'event', 'high', 'published', 'institutional', CURRENT_TIMESTAMP)`,
      [instNoticeId, student],
    );
    await pool.query(
      `INSERT INTO notice_attachments (id, notice_id, user_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'official_flyer.pdf', 'application/pdf', 512, $4)`,
      [randomUUID(), instNoticeId, student, instKey],
    );

    // Delete User
    await userLifecycleService.deleteUserData(student);

    // Personal blob deleted from object storage
    expect(await driver.exists(persKey)).toBe(false);

    // Institutional blob PRESERVED in object storage
    expect(await driver.exists(instKey)).toBe(true);
  });

  it('4. disconnectGmailForUser with purgeData: true deletes storage blobs for personal notice attachments', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, 'student@vitstudent.ac.in', 'tok', 'ref', 1700000000)`,
      [randomUUID(), student],
    );

    const persNoticeId = randomUUID();
    const persKey = `notices/${persNoticeId}/email_attachment.pdf`;

    await driver.put(persKey, Buffer.from('Attachment bytes'), 'application/pdf');

    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, $2, 'Gmail Personal Notice', 'Summary', 'academic', 'high', 'published', 'gmail_personal')`,
      [persNoticeId, student],
    );
    await pool.query(
      `INSERT INTO notice_attachments (id, notice_id, user_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'email_attachment.pdf', 'application/pdf', 512, $4)`,
      [randomUUID(), persNoticeId, student, persKey],
    );

    // Disconnect with purgeData: true
    await disconnectGmailForUser(student, { purgeData: true });

    // Personal notice blob deleted
    expect(await driver.exists(persKey)).toBe(false);
  });

  it('5. object storage driver failure does NOT prevent DB transaction completion or throw an unhandled error', async () => {
    const noticeId = randomUUID();
    const storageKey = `notices/${noticeId}/error_test.pdf`;

    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, $2, 'Resilience Test Notice', 'Summary', 'general', 'low', 'published', 'institutional')`,
      [noticeId, reviewer],
    );
    await pool.query(
      `INSERT INTO notice_attachments (id, notice_id, user_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'error_test.pdf', 'application/pdf', 512, $4)`,
      [randomUUID(), noticeId, reviewer, storageKey],
    );

    // Mock driver.delete to throw an error
    const spy = vi.spyOn(driver, 'delete').mockRejectedValueOnce(new Error('S3 503 SlowDown'));

    // Should complete cleanly without throwing
    const deleted = await noticesService.delete(noticeId);
    expect(deleted).toBe(true);

    // PostgreSQL notice row was committed and deleted
    const { rows } = await pool.query('SELECT * FROM notices WHERE id = $1', [noticeId]);
    expect(rows).toHaveLength(0);

    spy.mockRestore();
  });
});
