const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notice_attachments (
        id UUID PRIMARY KEY,
        notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        storage_key TEXT NOT NULL,
        gmail_message_id TEXT,
        gmail_attachment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notice_attachments_notice_id ON notice_attachments(notice_id);
      CREATE INDEX IF NOT EXISTS idx_notice_attachments_user_id ON notice_attachments(user_id);
    `);

    console.log('Notice attachments schema created successfully.');
  } catch (error) {
    console.error('Notice attachments migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
