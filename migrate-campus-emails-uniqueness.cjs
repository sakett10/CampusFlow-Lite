const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function runMigration() {
  const args = process.argv.slice(2);
  const stageArg = args.find((a) => a.startsWith('--stage='));
  const stage = stageArg ? stageArg.split('=')[1] : 'all';

  console.log(`=== CampusFlow Gmail Uniqueness Migration (Stage: ${stage}) ===`);

  if (!['1', '2', 'all'].includes(stage)) {
    console.error(`Invalid stage: "${stage}". Valid options are: --stage=1, --stage=2, --stage=all`);
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();

  try {
    if (stage === '1' || stage === 'all') {
      console.log('\n--- Running Stage 1: Validation, Backfill, Cleanup, and User Uniqueness Constraint ---');
      await client.query('BEGIN');

      // Pre-check 1: Check for duplicate (user_id, source_message_id)
      console.log('1. Checking for duplicate (user_id, source_message_id) rows in campus_emails...');
      const { rows: dupes } = await client.query(`
        SELECT user_id, source_message_id, COUNT(*) AS count
        FROM campus_emails
        GROUP BY user_id, source_message_id
        HAVING COUNT(*) > 1
      `);

      if (dupes.length > 0) {
        console.error('❌ ABORTING: Found duplicates for (user_id, source_message_id):');
        console.table(dupes);
        console.error('Automatic resolution is unsafe. Migration aborted without modifications.');
        await client.query('ROLLBACK');
        process.exitCode = 1;
        return;
      }
      console.log('✅ Pre-check passed: 0 duplicate (user_id, source_message_id) rows.');

      // Pre-check 2: Check for NULL or empty strings in user_id, source_account_email, source_message_id
      console.log('2. Checking for NULL or empty strings in user_id, source_account_email, source_message_id...');
      const { rows: nullCheck } = await client.query(`
        SELECT COUNT(*) AS count
        FROM campus_emails
        WHERE user_id IS NULL OR TRIM(user_id) = ''
           OR source_account_email IS NULL OR TRIM(source_account_email) = ''
           OR source_message_id IS NULL OR TRIM(source_message_id) = ''
      `);

      const invalidRowCount = parseInt(nullCheck[0].count, 10);
      if (invalidRowCount > 0) {
        console.error(`❌ ABORTING: Found ${invalidRowCount} rows with NULL or empty user_id, source_account_email, or source_message_id.`);
        await client.query('ROLLBACK');
        process.exitCode = 1;
        return;
      }
      console.log('✅ Pre-check passed: 0 invalid identifier rows.');

      // Step 3: Ensure processed_gmail_messages contains all historical ignored_personal records
      console.log('3. Backfilling processed_gmail_messages for historical ignored_personal emails...');
      await client.query(`
        INSERT INTO processed_gmail_messages (id, user_id, gmail_message_id, processed_at)
        SELECT gen_random_uuid(), user_id, source_message_id, COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
        FROM campus_emails
        WHERE analysis_status = 'ignored_personal'
        ON CONFLICT (user_id, gmail_message_id) DO NOTHING
      `);
      console.log('✅ Backfill complete. Inserted/ensured processed_gmail_messages records.');

      // Step 4: Delete historical ignored_personal rows from campus_emails
      console.log('4. Deleting historical ignored_personal rows from campus_emails...');
      const deleteResult = await client.query(`
        DELETE FROM campus_emails
        WHERE analysis_status = 'ignored_personal'
      `);
      console.log(`✅ Deleted ${deleteResult.rowCount} historical ignored_personal rows from campus_emails.`);

      // Step 5: Add constraint uq_campus_emails_user_msg
      console.log('5. Adding unique constraint uq_campus_emails_user_msg UNIQUE (user_id, source_message_id)...');
      const { rows: existingConstraint } = await client.query(`
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_campus_emails_user_msg'
      `);

      if (existingConstraint.length === 0) {
        await client.query(`
          ALTER TABLE campus_emails
          ADD CONSTRAINT uq_campus_emails_user_msg UNIQUE (user_id, source_message_id)
        `);
        console.log('✅ Successfully added constraint uq_campus_emails_user_msg.');
      } else {
        console.log('ℹ️ Constraint uq_campus_emails_user_msg already exists.');
      }

      if (stage === '1') {
        await client.query('COMMIT');
        console.log('\n🎉 Stage 1 completed successfully and committed.');
        console.log('NOTE: Legacy constraint uq_campus_emails_account_msg remains intact for zero-downtime application deployment.');
        return;
      }
    }

    if (stage === '2' || stage === 'all') {
      console.log('\n--- Running Stage 2: Dropping Legacy Constraint and Redundant Index ---');
      if (stage === '2') {
        await client.query('BEGIN');
      }

      console.log('6. Dropping legacy constraint uq_campus_emails_account_msg...');
      await client.query(`
        ALTER TABLE campus_emails
        DROP CONSTRAINT IF EXISTS uq_campus_emails_account_msg
      `);
      console.log('✅ Dropped constraint uq_campus_emails_account_msg (if it existed).');

      console.log('7. Dropping redundant index idx_campus_emails_account_msg...');
      await client.query(`
        DROP INDEX IF EXISTS idx_campus_emails_account_msg
      `);
      console.log('✅ Dropped index idx_campus_emails_account_msg (if it existed).');

      await client.query('COMMIT');
      console.log('\n🎉 Stage 2 / Full migration completed successfully and committed.');
    }
  } catch (err) {
    console.error('❌ Migration transaction failed. Rolling back...', err);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback error:', rollbackErr);
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
