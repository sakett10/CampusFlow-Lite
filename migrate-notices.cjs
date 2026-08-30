const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    await pool.query(`
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

      CREATE UNIQUE INDEX IF NOT EXISTS idx_notices_source_account_msg 
      ON notices(source_account_email, source_message_id) 
      WHERE source_message_id IS NOT NULL AND source_account_email IS NOT NULL;
    `);

    console.log('Notices schema created successfully.');
  } catch (error) {
    console.error('Notices migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
