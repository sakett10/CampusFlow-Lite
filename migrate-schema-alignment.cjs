const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrateSchemaAlignment(clientOverride) {
  const client = clientOverride || (await pool.connect());
  const shouldRelease = !clientOverride;
  try {
    console.log('--- Starting Phase 1 Schema Alignment Migration ---');
    await client.query('BEGIN');

    // =========================================================================
    // 1. CAMPUS_ITEMS TABLE CREATION & INDEXING
    // =========================================================================
    console.log('1. Ensuring campus_items table exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS campus_items (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campus_items_user_id ON campus_items(user_id);
    `);

    // =========================================================================
    // 2. ASSIGNMENTS TABLE ALIGNMENT (7 MISSING COLUMNS)
    // =========================================================================
    console.log('2. Ensuring assignments columns exist...');
    await client.query(`
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS due_time TEXT;
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS reminder TEXT;
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source_id TEXT;
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    `);

    // Backfill defaults for null values in existing rows
    const prioRes = await client.query(`UPDATE assignments SET priority = 'medium' WHERE priority IS NULL;`);
    const srcRes = await client.query(`UPDATE assignments SET source = 'manual' WHERE source IS NULL;`);
    const updRes = await client.query(`UPDATE assignments SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;`);
    console.log(`Backfilled assignments: ${prioRes.rowCount} priority, ${srcRes.rowCount} source, ${updRes.rowCount} updated_at.`);

    // =========================================================================
    // 3. NOTICES TABLE ALIGNMENT (source_type & CONSTRAINTS)
    // =========================================================================
    console.log('3. Aligning notices.source_type...');
    await client.query(`
      ALTER TABLE notices ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'institutional';
    `);

    // Safest historically defensible backfill: legacy rows without source_type were all institutional campus notices
    const backfillRes = await client.query(`
      UPDATE notices
      SET source_type = 'institutional'
      WHERE source_type IS NULL;
    `);
    console.log(`Backfilled source_type = 'institutional' for ${backfillRes.rowCount} legacy notices.`);

    await client.query(`
      ALTER TABLE notices ALTER COLUMN source_type SET DEFAULT 'institutional';
      ALTER TABLE notices ALTER COLUMN source_type SET NOT NULL;
      ALTER TABLE notices DROP CONSTRAINT IF EXISTS notices_source_type_check;
      ALTER TABLE notices ADD CONSTRAINT notices_source_type_check
        CHECK (source_type IN ('institutional', 'gmail_personal'));
    `);

    // =========================================================================
    // 4. NOTICES UNIQUENESS CONSTRAINT REPLACEMENT (CF-SEC-02)
    // =========================================================================
    console.log('4. Checking for duplicate notices before index migration...');
    const { rows: duplicates } = await client.query(`
      SELECT created_by_user_id, source_message_id, COUNT(*) AS count, array_agg(id) AS duplicate_ids
      FROM notices
      WHERE source_message_id IS NOT NULL
      GROUP BY created_by_user_id, source_message_id
      HAVING COUNT(*) > 1;
    `);

    if (duplicates.length > 0) {
      console.error('❌ Cannot create uq_notices_user_msg: Duplicate (created_by_user_id, source_message_id) rows exist:');
      for (const d of duplicates) {
        console.error(`   User: ${d.created_by_user_id}, Message: ${d.source_message_id}, Count: ${d.count}, IDs: [${d.duplicate_ids.join(', ')}]`);
      }
      throw new Error('Migration aborted: manual deduplication required before applying uq_notices_user_msg index.');
    }

    console.log('Dropping legacy cross-user index idx_notices_source_account_msg if present...');
    await client.query(`
      DROP INDEX IF EXISTS idx_notices_source_account_msg;
    `);

    console.log('Creating user-scoped unique index uq_notices_user_msg...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notices_user_msg
        ON notices (created_by_user_id, source_message_id)
        WHERE source_message_id IS NOT NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ Phase 1 Schema Alignment completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed and rolled back:', err);
    process.exitCode = 1;
    throw err;
  } finally {
    if (shouldRelease) {
      client.release();
      await pool.end();
    }
  }
}

if (require.main === module) {
  migrateSchemaAlignment()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrateSchemaAlignment };
