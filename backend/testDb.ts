import { newDb } from 'pg-mem';
import type pg from 'pg';

export function createTestPool(): pg.Pool {
  const db = newDb();

  db.public.none(`
    CREATE TABLE courses (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      instructor TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 3,
      attended_classes INTEGER NOT NULL DEFAULT 0,
      total_classes INTEGER NOT NULL DEFAULT 0,
      attendance_threshold INTEGER NOT NULL DEFAULT 75,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE assignments (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE campus_items (
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

    CREATE TABLE gmail_connections (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      google_email TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expiry_date BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE processed_gmail_messages (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      gmail_message_id TEXT NOT NULL,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_processed_gmail_messages_user_msg UNIQUE (user_id, gmail_message_id)
    );

    CREATE TABLE notices (
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

    CREATE TABLE notifications (
      id UUID PRIMARY KEY,
      user_id TEXT,
      recipient_role TEXT NOT NULL DEFAULT 'all',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('notice_published', 'pending_review', 'deadline_reminder', 'system')),
      notice_id UUID,
      link TEXT,
      read_by JSONB DEFAULT '[]'::jsonb,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE campus_emails (
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

    CREATE TABLE notice_suppressions (
      id UUID PRIMARY KEY,
      source_account_email TEXT,
      source_message_id TEXT,
      normalized_fingerprint TEXT,
      suppressed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_notice_suppression_account_msg UNIQUE (source_account_email, source_message_id)
    );
  `);




  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as pg.Pool;
}
