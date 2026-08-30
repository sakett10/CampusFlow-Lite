const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrateNoticeSuppressions() {
  try {
    console.log('--- Migrating notice_suppressions table ---');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notice_suppressions (
        id UUID PRIMARY KEY,
        source_account_email TEXT,
        source_message_id TEXT,
        normalized_fingerprint TEXT,
        suppressed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_notice_suppression_account_msg UNIQUE (source_account_email, source_message_id)
      );

      CREATE INDEX IF NOT EXISTS idx_notice_suppressions_fingerprint ON notice_suppressions(normalized_fingerprint);
      CREATE INDEX IF NOT EXISTS idx_notice_suppressions_account_msg ON notice_suppressions(source_account_email, source_message_id);
    `);
    console.log('✅ notice_suppressions table and indexes successfully created!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrateNoticeSuppressions();
