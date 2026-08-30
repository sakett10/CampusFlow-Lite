const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrateCampusEmails() {
  try {
    console.log('--- Migrating campus_emails table ---');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campus_emails (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_account_email TEXT NOT NULL,
        source_message_id TEXT NOT NULL,
        source_thread_id TEXT,
        sender_email TEXT,
        sender_name TEXT,
        subject TEXT,
        received_at TIMESTAMP,
        body_text TEXT,
        snippet TEXT,
        analysis_status TEXT NOT NULL DEFAULT 'pending',
        analysis_error TEXT,
        category TEXT,
        audience TEXT,
        importance TEXT,
        summary TEXT,
        event_date TEXT,
        deadline TEXT,
        venue TEXT,
        organizer TEXT,
        important_actions JSONB,
        links JSONB,
        documents JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_campus_emails_account_msg UNIQUE (source_account_email, source_message_id)
      );

      CREATE INDEX IF NOT EXISTS idx_campus_emails_user_id ON campus_emails(user_id);
      CREATE INDEX IF NOT EXISTS idx_campus_emails_account_msg ON campus_emails(source_account_email, source_message_id);
    `);
    console.log('✅ campus_emails table and indexes successfully created!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrateCampusEmails();
