const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS processed_gmail_messages (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        gmail_message_id TEXT NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_processed_gmail_messages_user_msg UNIQUE (user_id, gmail_message_id)
      );

      CREATE INDEX IF NOT EXISTS idx_processed_gmail_messages_user_id
      ON processed_gmail_messages(user_id);
    `);

    console.log('Processed Gmail messages schema created successfully.');
  } catch (error) {
    console.error('Gmail sync migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
