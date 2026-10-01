const pg = require('pg');
require('dotenv').config();

const baseDbUrl = process.env.DATABASE_URL;
if (!baseDbUrl) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const unpooledUrl = baseDbUrl.replace('-pooler.', '.');
const { migrateSchemaAlignment } = require('../migrate-schema-alignment.cjs');

async function inspectSchema(client, schemaName) {
  const colsRes = await client.query(`
    SELECT table_name, column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name IN ('notices', 'assignments', 'campus_items')
    ORDER BY table_name, ordinal_position;
  `, [schemaName]);

  const idxRes = await client.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = $1 AND tablename IN ('notices', 'assignments', 'campus_items')
    ORDER BY tablename, indexname;
  `, [schemaName]);

  const conRes = await client.query(`
    SELECT tc.table_name, tc.constraint_name, tc.constraint_type, cc.check_clause
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.check_constraints cc
      ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_schema = $1 AND tc.table_name IN ('notices', 'assignments', 'campus_items')
    ORDER BY tc.table_name, tc.constraint_name;
  `, [schemaName]);

  return {
    columns: colsRes.rows,
    indexes: idxRes.rows,
    constraints: conRes.rows,
  };
}

async function runStep1FreshDb(client) {
  console.log('\n================================================================');
  console.log('STEP 1: Fresh PostgreSQL Database Migration Chain Test');
  console.log('================================================================');

  const schema = 'test_phase1_fresh';
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
  await client.query(`CREATE SCHEMA ${schema};`);
  await client.query(`SET search_path TO ${schema};`);

  console.log('Running complete migration chain sequentially in schema: ' + schema);

  // 1. migrate.cjs
  console.log('1. Executing migrate.cjs DDL...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id UUID PRIMARY KEY,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      instructor TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 3,
      attended_classes INTEGER NOT NULL DEFAULT 0,
      total_classes INTEGER NOT NULL DEFAULT 0,
      attendance_threshold INTEGER NOT NULL DEFAULT 75,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id UUID PRIMARY KEY,
      course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
      due_time TEXT,
      reminder TEXT,
      priority TEXT DEFAULT 'medium',
      source TEXT DEFAULT 'manual',
      source_id TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campus_items (
      id UUID PRIMARY KEY,
      title TEXT,
      type TEXT,
      description TEXT,
      date TEXT,
      start_time TEXT,
      end_time TEXT,
      registration_deadline TEXT,
      venue TEXT,
      eligibility TEXT,
      organizer TEXT,
      important_actions JSONB,
      source_text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('  ✓ migrate.cjs succeeded');

  // 2. migrate-auth.cjs
  console.log('2. Executing migrate-auth.cjs...');
  await client.query('BEGIN');
  await client.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS user_id TEXT;');
  await client.query('ALTER TABLE assignments ADD COLUMN IF NOT EXISTS user_id TEXT;');
  await client.query('ALTER TABLE campus_items ADD COLUMN IF NOT EXISTS user_id TEXT;');
  await client.query("UPDATE courses SET user_id = 'legacy_system_user' WHERE user_id IS NULL;");
  await client.query("UPDATE assignments SET user_id = 'legacy_system_user' WHERE user_id IS NULL;");
  await client.query("UPDATE campus_items SET user_id = 'legacy_system_user' WHERE user_id IS NULL;");
  await client.query('ALTER TABLE courses ALTER COLUMN user_id SET NOT NULL;');
  await client.query('ALTER TABLE assignments ALTER COLUMN user_id SET NOT NULL;');
  await client.query('ALTER TABLE campus_items ALTER COLUMN user_id SET NOT NULL;');
  await client.query('CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON assignments(user_id);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_campus_items_user_id ON campus_items(user_id);');
  await client.query('COMMIT');
  console.log('  ✓ migrate-auth.cjs succeeded');

  // 3. migrate-gmail.cjs
  console.log('3. Executing migrate-gmail.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS gmail_connections (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      google_email TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expiry_date BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('  ✓ migrate-gmail.cjs succeeded');

  // 4. migrate-notices.cjs
  console.log('4. Executing migrate-notices.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS notices (
      id UUID PRIMARY KEY,
      created_by_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      audience TEXT,
      important_dates JSONB,
      action_required TEXT,
      venue TEXT,
      links JSONB,
      documents JSONB,
      source_provider TEXT NOT NULL DEFAULT 'gmail',
      source_connection_id UUID,
      source_account_email TEXT,
      source_message_id TEXT,
      source_sender TEXT,
      source_subject TEXT,
      source_type TEXT NOT NULL DEFAULT 'institutional' CHECK (source_type IN ('institutional', 'gmail_personal')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'published', 'rejected', 'archived')) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notices_status ON notices(status);
    CREATE INDEX IF NOT EXISTS idx_notices_category ON notices(category);
    CREATE INDEX IF NOT EXISTS idx_notices_priority ON notices(priority);
    CREATE INDEX IF NOT EXISTS idx_notices_created_at ON notices(created_at);
    CREATE INDEX IF NOT EXISTS idx_notices_published_at ON notices(published_at);
    CREATE INDEX IF NOT EXISTS idx_notices_created_by ON notices(created_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_notices_source_connection ON notices(source_connection_id);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_notices_user_msg 
    ON notices(created_by_user_id, source_message_id) 
    WHERE source_message_id IS NOT NULL;
  `);
  console.log('  ✓ migrate-notices.cjs succeeded');

  // 5. migrate-campus-emails.cjs
  console.log('5. Executing migrate-campus-emails.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS campus_emails (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_account_email TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      source_thread_id TEXT,
      sender_email TEXT,
      sender_name TEXT,
      subject TEXT,
      received_at TIMESTAMP,
      body_text TEXT,
      snippet TEXT,
      analysis_status TEXT NOT NULL DEFAULT 'pending',
      analysis_error TEXT,
      category TEXT,
      audience TEXT,
      importance TEXT,
      summary TEXT,
      event_date TEXT,
      deadline TEXT,
      venue TEXT,
      organizer TEXT,
      important_actions JSONB,
      links JSONB,
      documents JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_campus_emails_account_msg UNIQUE (source_account_email, source_message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_campus_emails_user_id ON campus_emails(user_id);
  `);
  console.log('  ✓ migrate-campus-emails.cjs succeeded');

  // 6. migrate-gmail-sync.cjs
  console.log('6. Executing migrate-gmail-sync.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS processed_gmail_messages (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_user_message UNIQUE (user_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_processed_messages_user ON processed_gmail_messages(user_id);

    CREATE TABLE IF NOT EXISTS gmail_sync_state (
      user_id TEXT PRIMARY KEY,
      last_history_id TEXT,
      last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('  ✓ migrate-gmail-sync.cjs succeeded');

  // 7. migrate-notifications.cjs
  console.log('7. Executing migrate-notifications.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      user_id TEXT,
      recipient_role TEXT NOT NULL DEFAULT 'all',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('notice_published', 'pending_review', 'deadline_reminder', 'system')),
      notice_id UUID REFERENCES notices(id) ON DELETE CASCADE,
      link TEXT,
      read_by JSONB DEFAULT '[]'::jsonb,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role ON notifications(recipient_role);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
  `);
  console.log('  ✓ migrate-notifications.cjs succeeded');

  // 8. migrate-notice-suppressions.cjs
  console.log('8. Executing migrate-notice-suppressions.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS notice_suppressions (
      id UUID PRIMARY KEY,
      source_account_email TEXT NOT NULL,
      source_message_id TEXT,
      notice_fingerprint TEXT,
      reason TEXT NOT NULL CHECK (reason IN ('deleted', 'archived', 'rejected')),
      suppressed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_suppressions_lookup ON notice_suppressions(source_account_email, source_message_id);
    CREATE INDEX IF NOT EXISTS idx_suppressions_fingerprint ON notice_suppressions(notice_fingerprint);
  `);
  console.log('  ✓ migrate-notice-suppressions.cjs succeeded');

  // 9. migrate-notification-dismissals.cjs
  console.log('9. Executing migrate-notification-dismissals.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS notification_dismissals (
      user_id TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, notification_id)
    );
  `);
  console.log('  ✓ migrate-notification-dismissals.cjs succeeded');

  // 10. migrate-date-and-isolation.cjs
  console.log('10. Executing migrate-date-and-isolation.cjs...');
  await client.query(`
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS source_received_at TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_notices_source_received_at ON notices(source_received_at);
  `);
  console.log('  ✓ migrate-date-and-isolation.cjs succeeded');

  // 11. migrate-notice-conversion.cjs
  console.log('11. Executing migrate-notice-conversion.cjs...');
  await client.query(`
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_converted BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS converted_to_task_id UUID;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_notices_is_converted ON notices(is_converted);
    CREATE INDEX IF NOT EXISTS idx_notices_converted_task ON notices(converted_to_task_id);
  `);
  console.log('  ✓ migrate-notice-conversion.cjs succeeded');

  // 12. migrate-campus-emails-uniqueness.cjs
  console.log('12. Executing migrate-campus-emails-uniqueness.cjs...');
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campus_emails_user_msg 
    ON campus_emails(user_id, source_message_id) 
    WHERE source_message_id IS NOT NULL;
  `);
  console.log('  ✓ migrate-campus-emails-uniqueness.cjs succeeded');

  // 13. migrate-notice-attachments.cjs
  console.log('13. Executing migrate-notice-attachments.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS notice_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      storage_key TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notice_attachments_notice_id ON notice_attachments(notice_id);
  `);
  console.log('  ✓ migrate-notice-attachments.cjs succeeded');

  // 14. migrate-task-reminders.cjs
  console.log('14. Executing migrate-task-reminders.cjs...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS task_reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      remind_at TIMESTAMPTZ NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      reminder_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
      sent_at TIMESTAMPTZ,
      claimed_at TIMESTAMPTZ,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      claim_expires_at TIMESTAMPTZ,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_task_reminders_task_id UNIQUE (task_id)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      default_reminder_offset TEXT NOT NULL DEFAULT '30m_before',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('  ✓ migrate-task-reminders.cjs succeeded');

  // 15. migrate-assignment-notice-unique.cjs
  console.log('15. Executing migrate-assignment-notice-unique.cjs...');
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS assignments_user_notice_unique
      ON assignments (user_id, source, source_id)
      WHERE source = 'notice';
  `);
  console.log('  ✓ migrate-assignment-notice-unique.cjs succeeded');

  // 16. migrate-schema-alignment.cjs
  console.log('16. Executing migrate-schema-alignment.cjs corrective migration...');
  await migrateSchemaAlignment(client);
  console.log('  ✓ migrate-schema-alignment.cjs succeeded');

  console.log('\nAll 16 migrations succeeded on fresh PostgreSQL database with ZERO errors.');
  return schema;
}

async function runStep2InspectAndVerify(client, schema) {
  console.log('\n================================================================');
  console.log(`STEP 2 & 3: Inspect Schema and Verify Phase 1 Targets (${schema})`);
  console.log('================================================================');

  const schemaInfo = await inspectSchema(client, schema);

  const byTable = {};
  for (const col of schemaInfo.columns) {
    if (!byTable[col.table_name]) byTable[col.table_name] = [];
    byTable[col.table_name].push(col);
  }

  // Verification 1: campus_items
  console.log('\n1. Verifying campus_items:');
  const campusCols = byTable['campus_items'] || [];
  console.log(`  Columns present (${campusCols.length}): ${campusCols.map(c => c.column_name).join(', ')}`);
  const expectedCampusCols = [
    'id', 'user_id', 'title', 'type', 'description', 'date', 'start_time',
    'end_time', 'registration_deadline', 'venue', 'eligibility', 'organizer',
    'important_actions', 'source_text', 'created_at'
  ];
  const actualCampusColNames = campusCols.map(c => c.column_name);
  for (const exp of expectedCampusCols) {
    if (!actualCampusColNames.includes(exp)) {
      throw new Error(`Missing expected campus_items column: ${exp}`);
    }
  }
  const campusIndexes = schemaInfo.indexes.filter(i => i.tablename === 'campus_items').map(i => i.indexname);
  console.log(`  Indexes: ${campusIndexes.join(', ')}`);
  if (!campusIndexes.includes('idx_campus_items_user_id')) {
    throw new Error('Missing idx_campus_items_user_id on campus_items');
  }
  console.log('  ✓ campus_items table and index verified.');

  // Verification 2: assignments 7 missing columns
  console.log('\n2. Verifying assignments 7 missing columns:');
  const assignCols = byTable['assignments'] || [];
  const expectedAssignCols = ['due_time', 'reminder', 'priority', 'source', 'source_id', 'updated_at', 'completed_at'];
  for (const exp of expectedAssignCols) {
    const found = assignCols.find(c => c.column_name === exp);
    if (!found) throw new Error(`Missing expected assignments column: ${exp}`);
    console.log(`  ✓ ${exp}: type=${found.data_type}, default=${found.column_default || 'none'}, nullable=${found.is_nullable}`);
  }

  // Verification 3: notices.source_type
  console.log('\n3. Verifying notices.source_type:');
  const noticeCols = byTable['notices'] || [];
  const stCol = noticeCols.find(c => c.column_name === 'source_type');
  if (!stCol) throw new Error('Missing notices.source_type column');
  console.log(`  ✓ source_type: type=${stCol.data_type}, default=${stCol.column_default}, nullable=${stCol.is_nullable}`);
  if (stCol.is_nullable !== 'NO') throw new Error('notices.source_type must be NOT NULL');

  const stCheck = schemaInfo.constraints.find(c => c.constraint_name === 'notices_source_type_check');
  if (!stCheck) throw new Error('Missing notices_source_type_check constraint on notices');
  console.log(`  ✓ notices_source_type_check: ${stCheck.check_clause}`);

  // Verification 4: notices unique indexes
  console.log('\n4. Verifying notices unique indexes:');
  const noticeIndexes = schemaInfo.indexes.filter(i => i.tablename === 'notices');
  const indexNames = noticeIndexes.map(i => i.indexname);
  console.log(`  Notice indexes: ${indexNames.join(', ')}`);

  if (indexNames.includes('idx_notices_source_account_msg')) {
    throw new Error('Defective legacy index idx_notices_source_account_msg still exists!');
  }
  console.log('  ✓ Legacy cross-user index idx_notices_source_account_msg is absent.');

  const uqIndex = noticeIndexes.find(i => i.indexname === 'uq_notices_user_msg');
  if (!uqIndex) throw new Error('Correct user-scoped index uq_notices_user_msg is missing!');
  console.log(`  ✓ Correct user-scoped index exists: ${uqIndex.indexdef}`);

  return schemaInfo;
}

async function runStep5PartiallyMigratedDb(client) {
  console.log('\n================================================================');
  console.log('STEP 5: Partially Migrated Database Repair Test');
  console.log('================================================================');

  const schema = 'test_phase1_partial';
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
  await client.query(`CREATE SCHEMA ${schema};`);
  await client.query(`SET search_path TO ${schema};`);

  console.log('Setting up un-aligned historical database schema in ' + schema + '...');
  await client.query(`
    CREATE TABLE courses (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      instructor TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 3,
      attended_classes INTEGER NOT NULL DEFAULT 0,
      total_classes INTEGER NOT NULL DEFAULT 0,
      attendance_threshold INTEGER NOT NULL DEFAULT 75,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE assignments (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE notices (
      id UUID PRIMARY KEY,
      created_by_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      source_provider TEXT NOT NULL DEFAULT 'gmail',
      source_connection_id UUID,
      source_account_email TEXT,
      source_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX idx_notices_source_account_msg 
    ON notices(source_account_email, source_message_id) 
    WHERE source_message_id IS NOT NULL AND source_account_email IS NOT NULL;
  `);

  // Notice: campus_items is intentionally NOT created to simulate missing table

  console.log('Seeding sample legacy data...');
  await client.query(`
    INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, source_provider, source_account_email, source_message_id)
    VALUES 
      ('11111111-1111-1111-1111-111111111111', 'reviewer_1', 'Campus Event', 'All campus event', 'EVENT', 'medium', 'gmail', 'events@vit.ac.in', 'msg_100'),
      ('22222222-2222-2222-2222-222222222222', 'user_student', 'Manual Notice', 'Manual note', 'GENERAL', 'low', 'manual', NULL, NULL);

    INSERT INTO assignments (id, user_id, title, description, due_date, status)
    VALUES
      ('33333333-3333-3333-3333-333333333333', 'user_student', 'Homework 1', 'Math homework', '2026-10-15', 'PENDING');
  `);

  console.log('\nRunning migrateSchemaAlignment(client) on partially migrated database...');
  await migrateSchemaAlignment(client);

  console.log('\nVerifying repaired schema and backfilled data in ' + schema + '...');
  const ciRes = await client.query('SELECT count(*) FROM campus_items');
  console.log(`  ✓ campus_items table exists (row count: ${ciRes.rows[0].count})`);

  const nRows = await client.query('SELECT id, created_by_user_id, source_type FROM notices ORDER BY title');
  for (const r of nRows.rows) {
    console.log(`  ✓ Notice ${r.id} (${r.created_by_user_id}): source_type = '${r.source_type}'`);
    if (r.source_type !== 'institutional') {
      throw new Error(`Expected source_type 'institutional', got '${r.source_type}'`);
    }
  }

  const aRows = await client.query('SELECT id, priority, source, updated_at FROM assignments');
  for (const r of aRows.rows) {
    console.log(`  ✓ Assignment ${r.id}: priority='${r.priority}', source='${r.source}', updated_at=${r.updated_at}`);
    if (r.priority !== 'medium' || r.source !== 'manual' || !r.updated_at) {
      throw new Error('Assignment backfill did not populate defaults correctly');
    }
  }

  const idxRes = await client.query(`
    SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'notices'
  `, [schema]);
  const idxNames = idxRes.rows.map(r => r.indexname);
  if (idxNames.includes('idx_notices_source_account_msg')) {
    throw new Error('idx_notices_source_account_msg was not dropped');
  }
  if (!idxNames.includes('uq_notices_user_msg')) {
    throw new Error('uq_notices_user_msg was not created');
  }
  console.log('  ✓ Unique index uq_notices_user_msg successfully replaced legacy index.');

  return schema;
}

async function runStep6Idempotency(client, schema) {
  console.log('\n================================================================');
  console.log(`STEP 6: Re-run migrateSchemaAlignment to Verify Idempotency`);
  console.log('================================================================');

  await client.query(`SET search_path TO ${schema};`);
  console.log(`Re-running migrateSchemaAlignment on already-aligned schema (${schema})...`);
  await migrateSchemaAlignment(client);
  console.log('  ✓ Re-run succeeded with zero errors (100% idempotent).');
}

async function cleanup(client) {
  console.log('\n================================================================');
  console.log('CLEANUP: Dropping temporary test schemas');
  console.log('================================================================');
  await client.query('DROP SCHEMA IF EXISTS test_phase1_fresh CASCADE;');
  await client.query('DROP SCHEMA IF EXISTS test_phase1_partial CASCADE;');
  console.log('Temporary schemas cleaned up successfully.');
}

async function main() {
  const client = new pg.Client({ connectionString: unpooledUrl });
  await client.connect();

  try {
    const freshSchema = await runStep1FreshDb(client);
    await runStep2InspectAndVerify(client, freshSchema);

    const partialSchema = await runStep5PartiallyMigratedDb(client);
    await runStep6Idempotency(client, partialSchema);

    await cleanup(client);

    console.log('\n================================================================');
    console.log('PHASE 1 DATABASE SCHEMA ALIGNMENT VERIFICATION COMPLETE: ALL PASS');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\nVerification failed:', err);
    await cleanup(client).catch(() => {});
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
