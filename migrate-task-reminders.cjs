const pg = require('pg');
const { randomUUID } = require('crypto');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

function calculateLegacyRemindAt(dueDate, dueTime, reminderType) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) return null;
  const time = dueTime && dueTime.trim() ? dueTime.trim() : '23:59';
  const [year, month, day] = dueDate.trim().split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);

  const deadline = new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0));

  switch (reminderType) {
    case 'at_due':
      return deadline;
    case '5m_before':
      return new Date(deadline.getTime() - 5 * 60 * 1000);
    case '15m_before':
      return new Date(deadline.getTime() - 15 * 60 * 1000);
    case '30m_before':
      return new Date(deadline.getTime() - 30 * 60 * 1000);
    case '1h_before':
      return new Date(deadline.getTime() - 60 * 60 * 1000);
    case '2h_before':
      return new Date(deadline.getTime() - 2 * 60 * 60 * 1000);
    case '1d_before':
      return new Date(deadline.getTime() - 24 * 60 * 60 * 1000);
    case '2d_before':
      return new Date(deadline.getTime() - 48 * 60 * 60 * 1000);
    case 'morning_of': {
      const morningOf = new Date(Date.UTC(year, month - 1, day, 9, 0, 0));
      if (morningOf.getTime() >= deadline.getTime()) {
        return new Date(deadline.getTime() - 2 * 60 * 60 * 1000);
      }
      return morningOf;
    }
    default:
      return null;
  }
}

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        remind_at TIMESTAMPTZ NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        reminder_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
        sent_at TIMESTAMPTZ,
        claimed_at TIMESTAMPTZ,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        claim_expires_at TIMESTAMPTZ,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_task_reminders_task_id UNIQUE (task_id)
      );

      ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
      ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;
      ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS last_error TEXT;
      ALTER TABLE task_reminders DROP CONSTRAINT IF EXISTS task_reminders_status_check;
      ALTER TABLE task_reminders ADD CONSTRAINT task_reminders_status_check CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled'));

      CREATE INDEX IF NOT EXISTS idx_task_reminders_user_status_remind ON task_reminders(user_id, status, remind_at);
      CREATE INDEX IF NOT EXISTS idx_task_reminders_status_remind ON task_reminders(status, remind_at);
      CREATE INDEX IF NOT EXISTS idx_task_reminders_claimed_at ON task_reminders(status, claimed_at);
      CREATE INDEX IF NOT EXISTS idx_task_reminders_claim_expires ON task_reminders(status, claim_expires_at);
      CREATE INDEX IF NOT EXISTS idx_task_reminders_task_id ON task_reminders(task_id);

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        default_reminder_offset TEXT NOT NULL DEFAULT '30m_before',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Task reminders schema created successfully.');

    // Existing reminder migration
    const { rows } = await pool.query(`
      SELECT a.id, a.user_id, a.due_date, a.due_time, a.reminder, a.status
      FROM assignments a
      LEFT JOIN task_reminders tr ON tr.task_id = a.id
      WHERE a.reminder IS NOT NULL
        AND a.reminder != 'none'
        AND tr.id IS NULL
    `);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      const calculatedRemindAt = calculateLegacyRemindAt(row.due_date, row.due_time, row.reminder);
      if (!calculatedRemindAt) {
        skippedCount++;
        continue;
      }

      let initialStatus = 'pending';
      if (row.status === 'COMPLETED') {
        initialStatus = 'cancelled';
      } else if (calculatedRemindAt.getTime() <= Date.now()) {
        initialStatus = 'sent';
      }

      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
        `,
        [
          randomUUID(),
          row.id,
          row.user_id,
          calculatedRemindAt,
          'UTC',
          row.reminder,
          initialStatus,
          initialStatus === 'sent' ? new Date() : null,
        ],
      );
      migratedCount++;
    }

    console.log(`Reminder migration complete: ${migratedCount} migrated, ${skippedCount} skipped (insufficient date info preserved in assignments table). Total inspected: ${rows.length}.`);
  } catch (error) {
    console.error('Task reminders migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
