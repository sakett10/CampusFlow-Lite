const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('--- Running safe date & isolation migration ---');
    await client.query('BEGIN');

    // 1. Add source_received_at column to notices
    await client.query(`
      ALTER TABLE notices ADD COLUMN IF NOT EXISTS source_received_at TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_notices_created_by ON notices(created_by_user_id);
      CREATE INDEX IF NOT EXISTS idx_notices_source_account ON notices(source_account_email);
      CREATE INDEX IF NOT EXISTS idx_notices_source_received_at ON notices(source_received_at);
    `);

    // 2. Backfill source_received_at from campus_emails
    const updateRes = await client.query(`
      UPDATE notices n
      SET source_received_at = ce.received_at
      FROM campus_emails ce
      WHERE n.source_message_id = ce.source_message_id
        AND n.source_received_at IS NULL
        AND ce.received_at IS NOT NULL
    `);
    console.log(`Backfilled source_received_at for ${updateRes.rowCount} notices from campus_emails`);

    // 3. For any remaining notices with null source_received_at, default to created_at
    await client.query(`
      UPDATE notices
      SET source_received_at = created_at
      WHERE source_received_at IS NULL
    `);

    await client.query('COMMIT');
    console.log('✅ Safe migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
