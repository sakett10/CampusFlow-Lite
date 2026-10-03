import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

import { pool } from './db.js';
import {
  isNoticeSuppressed,
  suppressNotice,
  noticesService,
  NoticeSuppressedError,
} from './services/notices.service.js';
import type { NoticeCandidate } from './types.js';

// We import the migration module
const { migrateNoticeSuppressionsScope } = require('../migrate-notice-suppressions-scope.cjs');

describe('CF-SEC-05 / SEC-07: Notice Suppression Isolation & Namespace Scoping', () => {
  const userA = 'student_user_A';
  const userB = 'student_user_B';

  beforeEach(async () => {
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM notice_suppressions');
  });

  it('1. User A personal suppression is stored as gmail_personal + userA', async () => {
    const msgId = 'msg_personal_userA_101';
    const fp = 'fp_personal_userA_101';

    await suppressNotice({
      userId: userA,
      sourceType: 'gmail_personal',
      accountEmail: 'userA@vitstudent.ac.in',
      messageId: msgId,
      fingerprint: fp,
    });

    const { rows } = await pool.query(
      'SELECT * FROM notice_suppressions WHERE source_message_id = $1',
      [msgId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].source_type).toBe('gmail_personal');
    expect(rows[0].user_id).toBe(userA);
    expect(rows[0].source_account_email).toBe('userA@vitstudent.ac.in');
    expect(rows[0].normalized_fingerprint).toBe(fp);
  });

  it('2. User B identical message/fingerprint is NOT suppressed', async () => {
    const sharedMsgId = 'broadcast_email_202';
    const sharedFp = 'fp_shared_newsletter_202';

    // User A suppresses their personal copy of the message/fingerprint
    await suppressNotice({
      userId: userA,
      sourceType: 'gmail_personal',
      accountEmail: 'userA@vitstudent.ac.in',
      messageId: sharedMsgId,
      fingerprint: sharedFp,
    });

    // Check if User B is suppressed for the identical messageId and fingerprint
    const isSuppressedForB = await isNoticeSuppressed(
      'userB@vitstudent.ac.in',
      sharedMsgId,
      sharedFp,
      userB,
      'gmail_personal',
    );
    expect(isSuppressedForB).toBe(false);

    // Verify User B can successfully create a notice from this candidate
    const candidate: NoticeCandidate = {
      title: 'Shared Tech Club Hackathon',
      summary: 'Annual campus hackathon details',
      category: 'event',
      priority: 'normal',
      importantDates: [{ label: 'Event Date', date: '2026-10-15' }],
      venue: 'Main Auditorium',
      source: {
        provider: 'gmail',
        messageId: sharedMsgId,
        sender: 'techclub@vit.ac.in',
        subject: 'Shared Tech Club Hackathon',
      },
      isCampusWide: true,
    };

    const created = await noticesService.createFromCandidate(userB, candidate, {
      accountEmail: 'userB@vitstudent.ac.in',
      sourceType: 'gmail_personal',
    });

    expect(created).toBeDefined();
    expect(created.createdByUserId).toBe(userB);
    expect(created.sourceMessageId).toBe(sharedMsgId);
  });

  it('3. User A identical message/fingerprint IS suppressed', async () => {
    const msgId = 'userA_private_msg_303';
    const fp = 'fp_userA_private_303';

    await suppressNotice({
      userId: userA,
      sourceType: 'gmail_personal',
      accountEmail: 'userA@vitstudent.ac.in',
      messageId: msgId,
      fingerprint: fp,
    });

    // isNoticeSuppressed returns true for User A by messageId
    const suppressedByMsg = await isNoticeSuppressed(
      'userA@vitstudent.ac.in',
      msgId,
      null,
      userA,
      'gmail_personal',
    );
    expect(suppressedByMsg).toBe(true);

    // isNoticeSuppressed returns true for User A by fingerprint
    const suppressedByFp = await isNoticeSuppressed(
      'userA@vitstudent.ac.in',
      null,
      fp,
      userA,
      'gmail_personal',
    );
    expect(suppressedByFp).toBe(true);

    // Notice creation by User A is blocked
    const candidate: NoticeCandidate = {
      title: 'Personal Academic Reminder',
      summary: 'Personal assignment reminder',
      category: 'academic',
      priority: 'important',
      importantDates: [{ label: 'Due Date', date: '2026-10-20' }],
      source: {
        provider: 'gmail',
        messageId: msgId,
        sender: 'prof@vit.ac.in',
        subject: 'Personal Academic Reminder',
      },
      isCampusWide: true,
    };

    await expect(
      noticesService.createFromCandidate(userA, candidate, {
        accountEmail: 'userA@vitstudent.ac.in',
        sourceType: 'gmail_personal',
      }),
    ).rejects.toThrow(NoticeSuppressedError);
  });

  it('4. Institutional suppression remains globally effective', async () => {
    const instMsgId = 'official_circular_404';
    const instFp = 'fp_official_circular_404';

    // Reviewer deletes/suppresses an institutional circular
    await suppressNotice({
      userId: null,
      sourceType: 'institutional',
      accountEmail: 'admin@vit.ac.in',
      messageId: instMsgId,
      fingerprint: instFp,
    });

    // Suppressed globally for User A
    const suppressedForA = await isNoticeSuppressed(
      'userA@vitstudent.ac.in',
      instMsgId,
      instFp,
      userA,
      'gmail_personal',
    );
    expect(suppressedForA).toBe(true);

    // Suppressed globally for User B
    const suppressedForB = await isNoticeSuppressed(
      'userB@vitstudent.ac.in',
      instMsgId,
      instFp,
      userB,
      'gmail_personal',
    );
    expect(suppressedForB).toBe(true);

    // Suppressed globally even if queried by reviewer or unauthenticated sync
    const suppressedGlobal = await isNoticeSuppressed(
      'admin@vit.ac.in',
      instMsgId,
      instFp,
    );
    expect(suppressedGlobal).toBe(true);

    // Suppressed globally purely by fingerprint match
    const suppressedFpOnly = await isNoticeSuppressed(
      'other@vit.ac.in',
      'different_msg_id',
      instFp,
      userB,
      'gmail_personal',
    );
    expect(suppressedFpOnly).toBe(true);
  });

  it('5. User B cannot query User A personal suppression', async () => {
    const userAMsg = 'msg_secret_userA_505';
    const userAFp = 'fp_secret_userA_505';

    await suppressNotice({
      userId: userA,
      sourceType: 'gmail_personal',
      accountEmail: 'userA@vitstudent.ac.in',
      messageId: userAMsg,
      fingerprint: userAFp,
    });

    // Direct lookup scoping check
    const lookupForBByMsg = await isNoticeSuppressed('userB@vitstudent.ac.in', userAMsg, null, userB, 'gmail_personal');
    expect(lookupForBByMsg).toBe(false);

    const lookupForBByFp = await isNoticeSuppressed('userB@vitstudent.ac.in', null, userAFp, userB, 'gmail_personal');
    expect(lookupForBByFp).toBe(false);

    // But lookup for User A still returns true
    const lookupForAByMsg = await isNoticeSuppressed('userA@vitstudent.ac.in', userAMsg, null, userA, 'gmail_personal');
    expect(lookupForAByMsg).toBe(true);
  });

  it('6. Legacy caller without userId cannot match personal suppression', async () => {
    const personalMsg = 'msg_personal_legacy_606';
    const personalFp = 'fp_personal_legacy_606';

    await suppressNotice({
      userId: userA,
      sourceType: 'gmail_personal',
      accountEmail: 'userA@vitstudent.ac.in',
      messageId: personalMsg,
      fingerprint: personalFp,
    });

    // Legacy callers pass only (accountEmail, messageId, fingerprint) without userId
    const legacySuppressed = await isNoticeSuppressed(
      'userA@vitstudent.ac.in',
      personalMsg,
      personalFp,
    );

    // Personal suppression requires explicit userId match; legacy unscoped caller does NOT match personal records
    expect(legacySuppressed).toBe(false);
  });

  it('7. Duplicate personal suppression is idempotent', async () => {
    const msgId = 'msg_idempotent_707';
    const fp1 = 'fp_idempotent_initial_707';
    const fp2 = 'fp_idempotent_updated_707';

    // First suppression
    await suppressNotice({
      userId: userA,
      sourceType: 'gmail_personal',
      accountEmail: 'userA@vitstudent.ac.in',
      messageId: msgId,
      fingerprint: fp1,
    });

    // Duplicate suppression with updated fingerprint
    await suppressNotice({
      userId: userA,
      sourceType: 'gmail_personal',
      accountEmail: 'userA@vitstudent.ac.in',
      messageId: msgId,
      fingerprint: fp2,
    });

    const { rows } = await pool.query(
      'SELECT * FROM notice_suppressions WHERE source_type = $1 AND user_id = $2 AND source_message_id = $3',
      ['gmail_personal', userA, msgId],
    );

    // Exactly one row exists, updated idempotently
    expect(rows).toHaveLength(1);
    expect(rows[0].normalized_fingerprint).toBe(fp2);
  });

  it('8. Existing institutional suppression remains idempotent', async () => {
    const instMsgId = 'inst_idempotent_808';
    const fp = 'fp_inst_idempotent_808';

    await suppressNotice({
      userId: null,
      sourceType: 'institutional',
      accountEmail: 'admin@vit.ac.in',
      messageId: instMsgId,
      fingerprint: fp,
    });

    // Duplicate institutional suppression call
    await suppressNotice({
      userId: null,
      sourceType: 'institutional',
      accountEmail: 'admin@vit.ac.in',
      messageId: instMsgId,
      fingerprint: fp,
    });

    const { rows } = await pool.query(
      'SELECT * FROM notice_suppressions WHERE source_type = $1 AND user_id = $2 AND source_message_id = $3',
      ['institutional', '', instMsgId],
    );

    expect(rows).toHaveLength(1);
  });

  it('9. Fresh PostgreSQL migration succeeds', async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return;

    const realClient = new pg.Client({ connectionString: dbUrl });
    await realClient.connect();

    try {
      const testSchema = 'test_phase4_fresh';
      await realClient.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE;`);
      await realClient.query(`CREATE SCHEMA ${testSchema};`);
      await realClient.query(`SET search_path TO ${testSchema};`);

      // Run migration on completely fresh schema
      await migrateNoticeSuppressionsScope(realClient);

      // Verify columns and constraint
      const { rows: cols } = await realClient.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'notice_suppressions'
        ORDER BY column_name;
      `, [testSchema]);

      const colNames = cols.map((c) => c.column_name);
      expect(colNames).toContain('user_id');
      expect(colNames).toContain('source_type');
      expect(colNames).toContain('source_message_id');

      const { rows: constraints } = await realClient.query(`
        SELECT conname, contype
        FROM pg_constraint
        WHERE conrelid = '${testSchema}.notice_suppressions'::regclass;
      `);

      const conNames = constraints.map((c) => c.conname);
      expect(conNames).toContain('uq_notice_suppressions_scope_msg');
      expect(conNames).not.toContain('uq_notice_suppression_account_msg');

      await realClient.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE;`);
    } finally {
      await realClient.end();
    }
  }, 30000);

  it('10. Existing database with historical suppression row migrates correctly', async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return;

    const realClient = new pg.Client({ connectionString: dbUrl });
    await realClient.connect();

    try {
      const testSchema = 'test_phase4_existing';
      await realClient.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE;`);
      await realClient.query(`CREATE SCHEMA ${testSchema};`);
      await realClient.query(`SET search_path TO ${testSchema};`);

      // Create legacy table structure with legacy constraint
      await realClient.query(`
        CREATE TABLE notice_suppressions (
          id UUID PRIMARY KEY,
          source_account_email TEXT,
          source_message_id TEXT,
          normalized_fingerprint TEXT,
          suppressed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_notice_suppression_account_msg UNIQUE (source_account_email, source_message_id)
        );
      `);

      // Insert pre-existing historical row without user_id or source_type
      const legacyId = randomUUID();
      await realClient.query(`
        INSERT INTO notice_suppressions (id, source_account_email, source_message_id, normalized_fingerprint)
        VALUES ($1, 'legacy.reviewer@vit.ac.in', 'legacy_msg_999', 'fp_legacy_999');
      `, [legacyId]);

      // Run migration to upgrade existing database
      await migrateNoticeSuppressionsScope(realClient);

      // Verify historical row was backfilled to institutional and global scope
      const { rows } = await realClient.query(`
        SELECT * FROM notice_suppressions WHERE id = $1;
      `, [legacyId]);

      expect(rows).toHaveLength(1);
      expect(rows[0].source_type).toBe('institutional');
      expect(rows[0].user_id).toBe('');
      expect(rows[0].source_message_id).toBe('legacy_msg_999');

      await realClient.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE;`);
    } finally {
      await realClient.end();
    }
  }, 30000);

  it('11. Migration rerun is idempotent', async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return;

    const realClient = new pg.Client({ connectionString: dbUrl });
    await realClient.connect();

    try {
      const testSchema = 'test_phase4_idempotent';
      await realClient.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE;`);
      await realClient.query(`CREATE SCHEMA ${testSchema};`);
      await realClient.query(`SET search_path TO ${testSchema};`);

      // Run migration 1st time
      await migrateNoticeSuppressionsScope(realClient);

      // Run migration 2nd time
      await migrateNoticeSuppressionsScope(realClient);

      const { rows: constraints } = await realClient.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = '${testSchema}.notice_suppressions'::regclass AND conname = 'uq_notice_suppressions_scope_msg';
      `);

      expect(constraints).toHaveLength(1);

      await realClient.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE;`);
    } finally {
      await realClient.end();
    }
  }, 30000);

  it('12. Personal and institutional records with the same source_message_id can coexist across namespaces', async () => {
    const sharedMessageId = 'shared_broadcast_msg_1212';
    const personalFp = 'fp_personal_1212';
    const instFp = 'fp_institutional_1212';

    // 1. User A personal suppression
    await suppressNotice({
      userId: userA,
      sourceType: 'gmail_personal',
      accountEmail: 'userA@vitstudent.ac.in',
      messageId: sharedMessageId,
      fingerprint: personalFp,
    });

    // 2. User B personal suppression for the same messageId
    await suppressNotice({
      userId: userB,
      sourceType: 'gmail_personal',
      accountEmail: 'userB@vitstudent.ac.in',
      messageId: sharedMessageId,
      fingerprint: personalFp,
    });

    // 3. Institutional suppression for the same messageId
    await suppressNotice({
      userId: null,
      sourceType: 'institutional',
      accountEmail: 'admin@vit.ac.in',
      messageId: sharedMessageId,
      fingerprint: instFp,
    });

    // Query all rows for this messageId
    const { rows } = await pool.query(
      'SELECT source_type, user_id, source_message_id FROM notice_suppressions WHERE source_message_id = $1 ORDER BY source_type, user_id',
      [sharedMessageId],
    );

    // All 3 coexist without collision because of (source_type, user_id, source_message_id) namespace isolation
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      source_type: 'gmail_personal',
      user_id: userA,
      source_message_id: sharedMessageId,
    });
    expect(rows[1]).toEqual({
      source_type: 'gmail_personal',
      user_id: userB,
      source_message_id: sharedMessageId,
    });
    expect(rows[2]).toEqual({
      source_type: 'institutional',
      user_id: '',
      source_message_id: sharedMessageId,
    });
  });
});
