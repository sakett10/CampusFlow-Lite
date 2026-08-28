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
  `);

  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as pg.Pool;
}
