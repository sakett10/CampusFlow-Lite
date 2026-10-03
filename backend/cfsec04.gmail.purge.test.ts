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
import { disconnectGmailForUser } from './services/gmail.service.js';

describe('CF-SEC-04: Gmail Disconnect with Purge (purgeData: true)', () => {
  const userA = 'student_purge_A';
  const userB = 'student_purge_B';

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

    vi.clearAllMocks();
  });

  it('1. purgeData: true purges personal notices, Gmail/email tasks, and tasks converted from personal notices while preserving manual tasks and institutional notices', async () => {
    // 1. Seed Gmail connections
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, 'a@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000),
              ($3, $4, 'b@vitstudent.ac.in', 'tok_b', 'ref_b', 1700000000)`,
      [randomUUID(), userA, randomUUID(), userB],
    );

    // 2. Seed campus_emails & processed_gmail_messages
    await pool.query(
      `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject)
       VALUES ($1, $2, 'a@vitstudent.ac.in', 'msg_a_1', 'Email A'),
              ($3, $4, 'b@vitstudent.ac.in', 'msg_b_1', 'Email B')`,
      [randomUUID(), userA, randomUUID(), userB],
    );
    await pool.query(
      `INSERT INTO processed_gmail_messages (id, user_id, gmail_message_id)
       VALUES ($1, $2, 'msg_a_1'),
              ($3, $4, 'msg_b_1')`,
      [randomUUID(), userA, randomUUID(), userB],
    );

    // 3. Seed notices:
    // User A personal Gmail notice
    const persNoticeA = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type, source_provider)
       VALUES ($1, $2, 'Personal Tuition Notice', 'Summary', 'academic', 'high', 'published', 'gmail_personal', 'gmail')`,
      [persNoticeA, userA],
    );

    // User A institutional notice
    const instNoticeA = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type, source_provider)
       VALUES ($1, $2, 'Institutional Exam Schedule', 'Summary', 'exam', 'high', 'published', 'institutional', 'manual')`,
      [instNoticeA, userA],
    );

    // User B personal notice
    const persNoticeB = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type, source_provider)
       VALUES ($1, $2, 'User B Personal Notice', 'Summary', 'general', 'low', 'published', 'gmail_personal', 'gmail')`,
      [persNoticeB, userB],
    );

    // 4. Seed tasks / assignments for User A:
    // 4a. Manual task
    const manualTaskA = randomUUID();
    await pool.query(
      `INSERT INTO assignments (id, user_id, title, status, source)
       VALUES ($1, $2, 'Manual Math HW', 'PENDING', 'manual')`,
      [manualTaskA, userA],
    );

    // 4b. Task synced from Gmail directly
    const gmailTaskA = randomUUID();
    await pool.query(
      `INSERT INTO assignments (id, user_id, title, status, source)
       VALUES ($1, $2, 'Gmail Synced Deadline', 'PENDING', 'gmail')`,
      [gmailTaskA, userA],
    );

    // 4c. Task synced from Email
    const emailTaskA = randomUUID();
    await pool.query(
      `INSERT INTO assignments (id, user_id, title, status, source)
       VALUES ($1, $2, 'Email Synced Assignment', 'PENDING', 'email')`,
      [emailTaskA, userA],
    );

    // 4d. Task converted from personal notice
    const convertedFromPersTaskA = randomUUID();
    await pool.query(
      `INSERT INTO assignments (id, user_id, title, status, source, source_id)
       VALUES ($1, $2, 'Task Converted from Personal Notice', 'PENDING', 'notice', $3)`,
      [convertedFromPersTaskA, userA, persNoticeA],
    );

    // 4e. Task converted from institutional notice
    const convertedFromInstTaskA = randomUUID();
    await pool.query(
      `INSERT INTO assignments (id, user_id, title, status, source, source_id)
       VALUES ($1, $2, 'Task Converted from Institutional Notice', 'PENDING', 'notice', $3)`,
      [convertedFromInstTaskA, userA, instNoticeA],
    );

    // 5. Seed tasks for User B
    const taskB = randomUUID();
    await pool.query(
      `INSERT INTO assignments (id, user_id, title, status, source)
       VALUES ($1, $2, 'User B Gmail Task', 'PENDING', 'gmail')`,
      [taskB, userB],
    );

    // Execute disconnect with purgeData: true for User A
    const result = await disconnectGmailForUser(userA, { purgeData: true });

    expect(result.success).toBe(true);
    expect(result.purged).toBe(true);

    // 1. User A Gmail connection is deleted
    const { rows: connsA } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [userA]);
    expect(connsA).toHaveLength(0);

    // 2. User A emails & processed messages are purged
    const { rows: emailsA } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [userA]);
    expect(emailsA).toHaveLength(0);
    const { rows: procA } = await pool.query('SELECT * FROM processed_gmail_messages WHERE user_id = $1', [userA]);
    expect(procA).toHaveLength(0);

    // 3. User A personal Gmail notice is purged
    const { rows: pNoticesA } = await pool.query('SELECT * FROM notices WHERE id = $1', [persNoticeA]);
    expect(pNoticesA).toHaveLength(0);

    // 4. User A institutional notice is strictly PRESERVED
    const { rows: iNoticesA } = await pool.query('SELECT * FROM notices WHERE id = $1', [instNoticeA]);
    expect(iNoticesA).toHaveLength(1);

    // 5. User A tasks:
    // Preserved: manual task + task converted from institutional notice = 2
    // Purged: gmail task + email task + task converted from personal notice
    const { rows: survivingTasksA } = await pool.query(
      'SELECT id, title, source FROM assignments WHERE user_id = $1 ORDER BY title ASC',
      [userA],
    );
    expect(survivingTasksA).toHaveLength(2);
    expect(survivingTasksA.map((t) => t.id)).toEqual(
      expect.arrayContaining([manualTaskA, convertedFromInstTaskA]),
    );

    // 6. User B data completely intact
    const { rows: connsB } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [userB]);
    expect(connsB).toHaveLength(1);
    const { rows: emailsB } = await pool.query('SELECT * FROM campus_emails WHERE user_id = $1', [userB]);
    expect(emailsB).toHaveLength(1);
    const { rows: noticesB } = await pool.query('SELECT * FROM notices WHERE id = $1', [persNoticeB]);
    expect(noticesB).toHaveLength(1);
    const { rows: tasksB } = await pool.query('SELECT * FROM assignments WHERE id = $1', [taskB]);
    expect(tasksB).toHaveLength(1);
  });

  it('2. purgeData: false preserves personal notices, emails, and all tasks', async () => {
    // Seed User A connection
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, $2, 'a@vitstudent.ac.in', 'tok_a', 'ref_a', 1700000000)`,
      [randomUUID(), userA],
    );

    const persNoticeA = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, $2, 'Personal Notice', 'Summary', 'academic', 'high', 'published', 'gmail_personal')`,
      [persNoticeA, userA],
    );

    const gmailTaskA = randomUUID();
    await pool.query(
      `INSERT INTO assignments (id, user_id, title, status, source)
       VALUES ($1, $2, 'Gmail Task', 'PENDING', 'gmail')`,
      [gmailTaskA, userA],
    );

    // Disconnect with purgeData: false
    const result = await disconnectGmailForUser(userA, { purgeData: false });
    expect(result.success).toBe(true);
    expect(result.purged).toBe(false);

    // Connection deleted
    const { rows: connsA } = await pool.query('SELECT * FROM gmail_connections WHERE user_id = $1', [userA]);
    expect(connsA).toHaveLength(0);

    // Notice preserved
    const { rows: noticesA } = await pool.query('SELECT * FROM notices WHERE id = $1', [persNoticeA]);
    expect(noticesA).toHaveLength(1);

    // Task preserved
    const { rows: tasksA } = await pool.query('SELECT * FROM assignments WHERE id = $1', [gmailTaskA]);
    expect(tasksA).toHaveLength(1);
  });
});
