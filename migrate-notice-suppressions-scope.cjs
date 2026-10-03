const pg = require('pg');
require('dotenv').config();

const baseDbUrl = process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString: baseDbUrl,
});

async function migrateNoticeSuppressionsScope(clientOverride) {
  const client = clientOverride || (await pool.connect());
  const shouldRelease = !clientOverride;

  try {
    console.log('--- Starting Notice Suppressions Scope Migration (CF-SEC-05) ---');
    await client.query('BEGIN');

    const { rows: schemaRows } = await client.query('SELECT current_schema()');
    if (!schemaRows[0].current_schema) {
      await client.query('SET search_path TO public;');
    }

    // 1. Ensure table exists (in case running on fresh DB before migrate-notice-suppressions)
    await client.query(`
      CREATE TABLE IF NOT EXISTS notice_suppressions (
        id UUID PRIMARY KEY,
        source_account_email TEXT,
        source_message_id TEXT,
        normalized_fingerprint TEXT,
        suppressed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Add user_id column with default empty string
    await client.query(`
      ALTER TABLE notice_suppressions ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT '';
    `);
    await client.query(`
      UPDATE notice_suppressions SET user_id = '' WHERE user_id IS NULL;
    `);
    await client.query(`
      ALTER TABLE notice_suppressions ALTER COLUMN user_id SET DEFAULT '';
      ALTER TABLE notice_suppressions ALTER COLUMN user_id SET NOT NULL;
    `);

    // 3. Add source_type column with default 'institutional'
    await client.query(`
      ALTER TABLE notice_suppressions ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'institutional';
    `);
    await client.query(`
      UPDATE notice_suppressions SET source_type = 'institutional' WHERE source_type IS NULL;
    `);
    await client.query(`
      ALTER TABLE notice_suppressions ALTER COLUMN source_type SET DEFAULT 'institutional';
      ALTER TABLE notice_suppressions ALTER COLUMN source_type SET NOT NULL;
    `);

    // 4. Check constraint on source_type
    await client.query(`
      ALTER TABLE notice_suppressions DROP CONSTRAINT IF EXISTS notice_suppressions_source_type_check;
      ALTER TABLE notice_suppressions ADD CONSTRAINT notice_suppressions_source_type_check
        CHECK (source_type IN ('institutional', 'gmail_personal'));
    `);

    // 5. Ensure source_message_id is NOT NULL (for manual notices, notice.id was used; backfill any legacy nulls with id)
    await client.query(`
      UPDATE notice_suppressions SET source_message_id = id::text WHERE source_message_id IS NULL OR TRIM(source_message_id) = '';
    `);
    await client.query(`
      ALTER TABLE notice_suppressions ALTER COLUMN source_message_id SET NOT NULL;
    `);

    // 6. Drop legacy unscoped uniqueness constraint (source_account_email, source_message_id)
    await client.query(`
      ALTER TABLE notice_suppressions DROP CONSTRAINT IF EXISTS uq_notice_suppression_account_msg;
    `);

    // 7. Check for duplicate rows on new uniqueness key (source_type, user_id, source_message_id)
    const { rows: dupes } = await client.query(`
      SELECT source_type, user_id, source_message_id, COUNT(*) AS count, array_agg(id) AS ids
      FROM notice_suppressions
      GROUP BY source_type, user_id, source_message_id
      HAVING COUNT(*) > 1;
    `);

    if (dupes.length > 0) {
      console.warn('Found duplicate suppression rows before applying unique constraint, retaining most recent:');
      for (const d of dupes) {
        console.warn(`   Scope: ${d.source_type}, User: "${d.user_id}", Message: "${d.source_message_id}", Count: ${d.count}`);
        // Keep the latest suppressed_at row, delete older duplicates
        await client.query(`
          DELETE FROM notice_suppressions
          WHERE source_type = $1 AND user_id = $2 AND source_message_id = $3
            AND id != (
              SELECT id FROM notice_suppressions
              WHERE source_type = $1 AND user_id = $2 AND source_message_id = $3
              ORDER BY suppressed_at DESC, id DESC
              LIMIT 1
            );
        `, [d.source_type, d.user_id, d.source_message_id]);
      }
    }

    // 8. Add scoped uniqueness constraint: UNIQUE (source_type, user_id, source_message_id)
    await client.query(`
      ALTER TABLE notice_suppressions DROP CONSTRAINT IF EXISTS uq_notice_suppressions_scope_msg;
      ALTER TABLE notice_suppressions
        ADD CONSTRAINT uq_notice_suppressions_scope_msg
        UNIQUE (source_type, user_id, source_message_id);
    `);

    // 9. Create optimized lookup indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notice_suppressions_inst_fp
        ON notice_suppressions(normalized_fingerprint)
        WHERE (source_type = 'institutional');

      CREATE INDEX IF NOT EXISTS idx_notice_suppressions_user_fp
        ON notice_suppressions(user_id, normalized_fingerprint)
        WHERE (source_type = 'gmail_personal');
    `);

    await client.query('COMMIT');
    console.log('✅ Notice Suppressions Scope Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Notice Suppressions Scope Migration failed:', err);
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
  migrateNoticeSuppressionsScope()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrateNoticeSuppressionsScope };
