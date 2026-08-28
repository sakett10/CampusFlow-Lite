const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    await pool.query(`
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

      CREATE INDEX IF NOT EXISTS idx_gmail_connections_user_id
      ON gmail_connections(user_id);
    `);

    console.log('Gmail schema created successfully.');
  } catch (error) {
    console.error('Gmail migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();