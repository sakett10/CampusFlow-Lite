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
      due_time TEXT,
      reminder TEXT,
      priority TEXT DEFAULT 'medium',
      source TEXT DEFAULT 'manual',
      source_id TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
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
      source_type TEXT NOT NULL DEFAULT 'institutional' CHECK (source_type IN ('institutional', 'gmail_personal')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'published', 'rejected', 'archived')) DEFAULT 'pending',
      is_converted BOOLEAN NOT NULL DEFAULT FALSE,
      converted_to_task_id UUID,
      converted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMP,
      source_received_at TIMESTAMP,
      CONSTRAINT uq_notices_user_msg UNIQUE (created_by_user_id, source_message_id)
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

    CREATE TABLE notification_dismissals (
      user_id TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, notification_id)
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
      CONSTRAINT uq_campus_emails_user_msg UNIQUE (user_id, source_message_id)
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




  const { Pool, Client } = db.adapters.createPg();
  const testPool = new Pool() as unknown as pg.Pool;

  const activeLocks = new Map<string, symbol>();
  const lockWaiters = new Map<string, Array<() => void>>();

  function releaseLockHelper(lockKey: string, clientId: symbol): boolean {
    if (activeLocks.get(lockKey) === clientId) {
      activeLocks.delete(lockKey);
      const waiters = lockWaiters.get(lockKey);
      if (waiters && waiters.length > 0) {
        const next = waiters.shift();
        if (next) next();
      }
      return true;
    }
    return false;
  }

  function createQueryInterceptor(
    origQuery: (...args: unknown[]) => unknown,
    clientId: symbol,
  ) {
    return async (...args: unknown[]) => {
      const text = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text || '';
      const params = Array.isArray(args[1])
        ? args[1]
        : (typeof args[0] === 'object' && Array.isArray((args[0] as { values?: unknown[] })?.values)
          ? (args[0] as { values?: unknown[] }).values!
          : []);

      if (/\bpg_try_advisory_lock\b/i.test(text)) {
        const lockKey = params.slice(0, 2).join(':');
        if (activeLocks.has(lockKey)) {
          return { rows: [{ locked: false }] };
        }
        activeLocks.set(lockKey, clientId);
        return { rows: [{ locked: true }] };
      }

      if (/\bpg_advisory_unlock\b/i.test(text)) {
        const lockKey = params.slice(0, 2).join(':');
        const unlocked = releaseLockHelper(lockKey, clientId);
        return { rows: [{ unlocked }] };
      }

      // Explicitly check for blocking pg_advisory_lock without accidentally matching pg_try_advisory_lock or pg_advisory_unlock
      if (
        /\bpg_advisory_lock\b/i.test(text) &&
        !/\bpg_try_advisory_lock\b/i.test(text) &&
        !/\bpg_advisory_unlock\b/i.test(text)
      ) {
        const lockKey = params.slice(0, 2).join(':');
        while (activeLocks.has(lockKey) && activeLocks.get(lockKey) !== clientId) {
          await new Promise<void>((resolve) => {
            if (!lockWaiters.has(lockKey)) lockWaiters.set(lockKey, []);
            lockWaiters.get(lockKey)!.push(resolve);
          });
        }
        activeLocks.set(lockKey, clientId);
        return { rows: [] };
      }

      return origQuery(...args);
    };
  }

  testPool.connect = (async () => {
    const client = new Client();
    await client.connect();
    const clientId = Symbol('client');
    let txBackup: { restore: () => void } | null = null;
    const origQuery = client.query.bind(client);
    const origRelease = client.release ? client.release.bind(client) : () => {};

    client.release = (...args: unknown[]) => {
      for (const [k, holder] of activeLocks.entries()) {
        if (holder === clientId) {
          releaseLockHelper(k, clientId);
        }
      }
      return (origRelease as (...a: unknown[]) => unknown)(...args);
    };

    const intercepted = createQueryInterceptor(origQuery, clientId);

    client.query = (async (...args: unknown[]) => {
      const q = (typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text || '').trim().toUpperCase();
      if (q === 'BEGIN') {
        txBackup = db.backup();
        return intercepted(...args);
      }
      if (q === 'ROLLBACK') {
        if (txBackup) {
          txBackup.restore();
          txBackup = null;
        }
        return intercepted(...args);
      }
      if (q === 'COMMIT') {
        txBackup = null;
        return intercepted(...args);
      }
      return intercepted(...args);
    }) as typeof client.query;
    return client;
  }) as typeof testPool.connect;

  return testPool;
}
