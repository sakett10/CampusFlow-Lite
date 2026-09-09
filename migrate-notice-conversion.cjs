const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrateNoticeConversion() {
  const client = await pool.connect();
  try {
    console.log('--- Migrating notices table for task conversion ---');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_converted BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE notices ADD COLUMN IF NOT EXISTS converted_to_task_id UUID;
      ALTER TABLE notices ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;

      CREATE INDEX IF NOT EXISTS idx_notices_is_converted ON notices(is_converted);
      CREATE INDEX IF NOT EXISTS idx_notices_converted_task ON notices(converted_to_task_id);
    `);

    await client.query('COMMIT');
    console.log('✅ Notices conversion columns successfully added!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateNoticeConversion();
