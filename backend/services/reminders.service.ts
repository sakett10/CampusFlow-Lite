import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { pushService } from './push.service.js';

export type ReminderType =
  | 'none'
  | 'at_due'
  | '5m_before'
  | '15m_before'
  | '30m_before'
  | '1h_before'
  | '2h_before'
  | '1d_before'
  | '2d_before'
  | 'morning_of'
  | 'custom';

export type ReminderStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';

export interface TaskReminder {
  id: string;
  taskId: string;
  userId: string;
  remindAt: string; // ISO UTC string
  timezone: string;
  reminderType: ReminderType;
  status: ReminderStatus;
  sentAt?: string | null;
  claimedAt?: string | null;
  attemptCount?: number;
  lastError?: string | null;
  claimExpiresAt?: string | null;
  retryCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskReminderClaimed {
  id: string;
  taskId: string;
  userId: string;
  remindAt: Date | string;
  timezone: string;
  reminderType: ReminderType;
  attemptCount: number;
  retryCount: number;
}

export const REMINDER_LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes claim lease for crash recovery
export const MAX_REMINDER_RETRIES = 3;

/**
 * Sanitizes and bounds error messages for storage in task_reminders.
 * Strips sensitive auth headers, private keys, secrets, tokens, and raw endpoint URLs.
 */
export function sanitizeErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  let message: string;
  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === 'string') {
    message = err;
  } else {
    message = String(err);
  }
  // Strip sensitive credentials, auth headers, tokens, and full endpoint URLs
  message = message.replace(/(auth|key|token|bearer|endpoint|secret)=([^\s&]+)/gi, '$1=[REDACTED]');
  message = message.replace(/https?:\/\/[^\s]+/gi, '[ENDPOINT]');
  return message.slice(0, 255);
}

export interface UserPreferences {
  userId: string;
  defaultReminderOffset: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export const REMINDER_OFFSETS_MINUTES: Record<string, number> = {
  at_due: 0,
  '5m_before': 5,
  '15m_before': 15,
  '30m_before': 30,
  '1h_before': 60,
  '2h_before': 120,
  '1d_before': 1440,
  '2d_before': 2880,
};

/**
 * Accurately parses a local date and time string in a specific IANA timezone to an exact UTC Date.
 * Handles DST shifts and arbitrary user timezones safely using standard Intl.DateTimeFormat.
 */
export function parseZonedDateTimeToUtc(
  dateStr: string, // YYYY-MM-DD
  timeStr: string, // HH:MM or HH:MM:SS
  timeZone: string = 'UTC',
): Date {
  const cleanDate = dateStr.trim();
  const cleanTime = timeStr.trim();
  const dateParts = cleanDate.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(isNaN)) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }

  const [year, month, day] = dateParts;
  const timeParts = cleanTime.split(':').map(Number);
  const hours = timeParts[0] ?? 0;
  const minutes = timeParts[1] ?? 0;
  const seconds = timeParts[2] ?? 0;

  // Validate IANA timezone by testing Intl.DateTimeFormat
  let validTimeZone = timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    validTimeZone = 'UTC';
  }

  // Initial UTC guess
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: validTimeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(utcGuess);
  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      p[part.type] = Number(part.value);
    }
  }

  const renderedHour = p.hour === 24 ? 0 : p.hour;
  const renderedUtc = Date.UTC(p.year, p.month - 1, p.day, renderedHour, p.minute, p.second || 0);
  const offsetMs = renderedUtc - utcGuess.getTime();

  // First approximation
  let result = new Date(utcGuess.getTime() - offsetMs);

  // Verification pass to handle DST boundaries
  const verifyParts = formatter.formatToParts(result);
  const vp: Record<string, number> = {};
  for (const part of verifyParts) {
    if (part.type !== 'literal') {
      vp[part.type] = Number(part.value);
    }
  }
  const vHour = vp.hour === 24 ? 0 : vp.hour;
  const vUtc = Date.UTC(vp.year, vp.month - 1, vp.day, vHour, vp.minute, vp.second || 0);
  const targetUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds);

  const diffMs = vUtc - targetUtc;
  if (diffMs !== 0) {
    result = new Date(result.getTime() - diffMs);
  }

  return result;
}

/**
 * Calculates absolute UTC remind_at timestamp for a task based on its due date, time, reminder type, and user timezone.
 */
export function calculateRemindAtUtc(params: {
  dueDate?: string | null;
  dueTime?: string | null;
  reminderType: ReminderType;
  customRemindAt?: string | null; // ISO string or YYYY-MM-DDTHH:MM
  customDate?: string | null;
  customTime?: string | null;
  timezone: string;
}): Date | null {
  const { dueDate, dueTime, reminderType, customRemindAt, customDate, customTime, timezone } = params;

  if (!reminderType || reminderType === 'none') {
    return null;
  }

  if (reminderType === 'custom') {
    if (customDate && customTime) {
      return parseZonedDateTimeToUtc(customDate, customTime, timezone);
    }
    if (customRemindAt) {
      const parsed = new Date(customRemindAt);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return null;
  }

  // Relative reminders require a dueDate
  if (!dueDate || !dueDate.trim()) {
    return null;
  }

  if (reminderType === 'morning_of') {
    const effectiveTime = dueTime && dueTime.trim() ? dueTime.trim() : '23:59';
    const deadlineUtc = parseZonedDateTimeToUtc(dueDate, effectiveTime, timezone);
    // 09:00 AM local time on dueDate
    const morningOfUtc = parseZonedDateTimeToUtc(dueDate, '09:00', timezone);
    if (morningOfUtc.getTime() >= deadlineUtc.getTime()) {
      // If 9:00 AM is at or after deadline, fall back to 2 hours before deadline
      return new Date(deadlineUtc.getTime() - 2 * 60 * 60 * 1000);
    }
    return morningOfUtc;
  }

  const offsetMinutes = REMINDER_OFFSETS_MINUTES[reminderType];
  if (offsetMinutes === undefined) {
    return null;
  }

  const effectiveTime = dueTime && dueTime.trim() ? dueTime.trim() : '23:59';
  const deadlineUtc = parseZonedDateTimeToUtc(dueDate, effectiveTime, timezone);

  return new Date(deadlineUtc.getTime() - offsetMinutes * 60 * 1000);
}

export function formatReminderLabel(reminder: TaskReminder): string {
  if (reminder.reminderType === 'none') return 'No reminder';
  if (reminder.reminderType === 'at_due') return 'At due time';
  if (reminder.reminderType === '5m_before') return '5 min before';
  if (reminder.reminderType === '15m_before') return '15 min before';
  if (reminder.reminderType === '30m_before') return '30 min before';
  if (reminder.reminderType === '1h_before') return '1 hour before';
  if (reminder.reminderType === '2h_before') return '2 hours before';
  if (reminder.reminderType === '1d_before') return '1 day before';
  if (reminder.reminderType === '2d_before') return '2 days before';
  if (reminder.reminderType === 'morning_of') return 'Morning of due date (9:00 AM)';

  if (reminder.reminderType === 'custom') {
    try {
      const d = new Date(reminder.remindAt);
      return new Intl.DateTimeFormat('en-US', {
        timeZone: reminder.timezone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(d);
    } catch {
      return 'Custom reminder';
    }
  }

  return 'Reminder';
}

function mapRowToTaskReminder(row: Record<string, unknown>): TaskReminder {
  // retry_count is the authoritative counter maintained by the retry state machine
  // (claim gate `retry_count < MAX_REMINDER_RETRIES` and `retry_count = retry_count + 1` increments).
  // attempt_count is a legacy column kept in sync by processDueReminders; fall back to it if retry_count is absent.
  const attemptCount = row.retry_count != null ? Number(row.retry_count) : (row.attempt_count != null ? Number(row.attempt_count) : 0);
  const claimedAt = row.claimed_at ? new Date(row.claimed_at as string | Date).toISOString() : null;
  const claimExpiresAt = row.claim_expires_at ? new Date(row.claim_expires_at as string | Date).toISOString() : null;

  return {
    id: row.id as string,
    taskId: row.task_id as string,
    userId: row.user_id as string,
    remindAt: new Date(row.remind_at as string | Date).toISOString(),
    timezone: row.timezone as string,
    reminderType: row.reminder_type as ReminderType,
    status: row.status as ReminderStatus,
    sentAt: row.sent_at ? new Date(row.sent_at as string | Date).toISOString() : null,
    claimedAt,
    attemptCount,
    lastError: (row.last_error as string) || null,
    claimExpiresAt: claimExpiresAt || claimedAt,
    retryCount: attemptCount,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const remindersService = {
  getUserPreferences: async (userId: string): Promise<UserPreferences> => {
    const { rows } = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId],
    );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        userId: row.user_id,
        defaultReminderOffset: row.default_reminder_offset || '30m_before',
        timezone: row.timezone || 'UTC',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    return {
      userId,
      defaultReminderOffset: '30m_before',
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  setUserPreferences: async (
    userId: string,
    updates: { defaultReminderOffset?: string; timezone?: string },
  ): Promise<UserPreferences> => {
    const current = await remindersService.getUserPreferences(userId);
    const newOffset = updates.defaultReminderOffset || current.defaultReminderOffset;
    const newTz = updates.timezone || current.timezone;

    const { rows } = await pool.query(
      `
      INSERT INTO user_preferences (user_id, default_reminder_offset, timezone, created_at, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id)
      DO UPDATE SET
        default_reminder_offset = EXCLUDED.default_reminder_offset,
        timezone = EXCLUDED.timezone,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [userId, newOffset, newTz],
    );

    const row = rows[0];
    return {
      userId: row.user_id,
      defaultReminderOffset: row.default_reminder_offset,
      timezone: row.timezone,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  getByTaskId: async (
    userId: string,
    taskId: string,
    customDb: PoolClient | typeof pool = pool,
  ): Promise<TaskReminder | null> => {
    const { rows } = await customDb.query(
      'SELECT * FROM task_reminders WHERE user_id = $1 AND task_id = $2 LIMIT 1',
      [userId, taskId],
    );

    if (rows.length === 0) return null;
    return mapRowToTaskReminder(rows[0]);
  },

  upsertTaskReminder: async (params: {
    userId: string;
    taskId: string;
    reminderType: ReminderType;
    customRemindAt?: string | null;
    customDate?: string | null;
    customTime?: string | null;
    timezone?: string;
    client?: PoolClient | typeof pool;
  }): Promise<TaskReminder | null> => {
    const { userId, taskId, reminderType, customRemindAt, customDate, customTime, timezone, client } = params;
    const db = client || pool;

    // Verify task exists and belongs to this user
    const { rows: taskRows } = await db.query(
      'SELECT id, due_date, due_time, status FROM assignments WHERE id = $1 AND user_id = $2',
      [taskId, userId],
    );

    if (taskRows.length === 0) {
      throw new Error('Task not found or access denied');
    }

    const task = taskRows[0];
    const effectiveTz = timezone || 'UTC';

    if (reminderType === 'none') {
      await db.query(
        'DELETE FROM task_reminders WHERE user_id = $1 AND task_id = $2',
        [userId, taskId],
      );
      // Also clear reminder column on task
      await db.query(
        'UPDATE assignments SET reminder = NULL WHERE id = $1 AND user_id = $2',
        [taskId, userId],
      );
      return null;
    }

    const remindAtUtc = calculateRemindAtUtc({
      dueDate: task.due_date,
      dueTime: task.due_time,
      reminderType,
      customRemindAt,
      customDate,
      customTime,
      timezone: effectiveTz,
    });

    if (!remindAtUtc) {
      throw new Error(`Unable to calculate reminder timestamp for reminder type "${reminderType}".`);
    }

    const initialStatus: ReminderStatus = task.status === 'COMPLETED' ? 'cancelled' : 'pending';

    const id = randomUUID();
    const { rows } = await db.query(
      `
      INSERT INTO task_reminders (
        id, task_id, user_id, remind_at, timezone, reminder_type, status,
        attempt_count, retry_count, claimed_at, claim_expires_at, last_error, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (task_id) DO NOTHING
      RETURNING *
      `,
      [id, taskId, userId, remindAtUtc.toISOString(), effectiveTz, reminderType, initialStatus],
    );

    let row = rows[0];
    if (!row) {
      // Update existing reminder by task_id and user_id, resetting retry and lease state
      const { rows: updateRows } = await db.query(
        `
        UPDATE task_reminders
        SET
          remind_at = $3,
          timezone = $4,
          reminder_type = $5,
          status = $6,
          sent_at = NULL,
          claimed_at = NULL,
          attempt_count = 0,
          retry_count = 0,
          claim_expires_at = NULL,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND task_id = $2
        RETURNING *
        `,
        [userId, taskId, remindAtUtc.toISOString(), effectiveTz, reminderType, initialStatus],
      );
      row = updateRows[0];
    }

    // Update assignment reminder string for backward compatibility
    await db.query(
      'UPDATE assignments SET reminder = $1 WHERE id = $2 AND user_id = $3',
      [reminderType, taskId, userId],
    );

    return mapRowToTaskReminder(row);
  },

  deleteReminder: async (
    userId: string,
    taskId: string,
    customDb: PoolClient | typeof pool = pool,
  ): Promise<boolean> => {
    const { rowCount } = await customDb.query(
      'DELETE FROM task_reminders WHERE user_id = $1 AND task_id = $2',
      [userId, taskId],
    );

    await customDb.query(
      'UPDATE assignments SET reminder = NULL WHERE id = $1 AND user_id = $2',
      [taskId, userId],
    );

    return (rowCount ?? 0) > 0;
  },

  /**
   * Called when a task's due date, due time, or completion status is updated.
   * - If relative reminder, recalculates remind_at based on new due date/time.
   * - If custom reminder, preserves explicit custom remind_at!
   * - If task marked COMPLETED, sets reminder status to 'cancelled'.
   * - If task uncompleted, reactivates pending if remind_at is in the future.
   */
  onTaskUpdated: async (
    userId: string,
    taskId: string,
    task: { dueDate?: string | null; dueTime?: string | null; status?: string },
    customDb: PoolClient | typeof pool = pool,
  ): Promise<void> => {
    const existing = await remindersService.getByTaskId(userId, taskId, customDb);
    if (!existing) return;

    if (task.status === 'COMPLETED') {
      await customDb.query(
        "UPDATE task_reminders SET status = 'cancelled', claimed_at = NULL, claim_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [existing.id],
      );
      return;
    }

    if (task.status && task.status !== 'COMPLETED' && existing.status === 'cancelled') {
      const isFuture = new Date(existing.remindAt).getTime() > Date.now();
      if (isFuture) {
        await customDb.query(
          "UPDATE task_reminders SET status = 'pending', claimed_at = NULL, claim_expires_at = NULL, attempt_count = 0, retry_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [existing.id],
        );
      }
    }

    // If relative reminder and due date/time changed, recalculate
    if (existing.reminderType !== 'custom' && existing.reminderType !== 'none') {
      const newRemindAt = calculateRemindAtUtc({
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        reminderType: existing.reminderType,
        timezone: existing.timezone,
      });

      if (newRemindAt) {
        const isFuture = newRemindAt.getTime() > Date.now();
        const newStatus: ReminderStatus = isFuture ? 'pending' : existing.status;
        await customDb.query(
          `UPDATE task_reminders
           SET remind_at = $1, status = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newRemindAt.toISOString(), newStatus, existing.id],
        );
      }
    }
  },

  /**
   * Safe batch processing for Vercel Cron.
   * Atomically claims due reminders to prevent duplicate execution across overlapping instances.
   */
  processDueReminders: async (
    limit = 50,
  ): Promise<{ processed: number; sent: number; cancelled: number; failed: number }> => {
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const skipLocked = isTestEnv ? '' : 'SKIP LOCKED';

    const leaseExpiresAt = new Date(Date.now() + REMINDER_LEASE_DURATION_MS);

    const claimQuery = `
      UPDATE task_reminders
      SET status = 'processing',
          claim_expires_at = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT id FROM task_reminders
        WHERE (
          (status = 'pending' AND remind_at <= CURRENT_TIMESTAMP)
          OR
          (status = 'processing' AND claim_expires_at <= CURRENT_TIMESTAMP)
        )
        AND retry_count < $3
        ORDER BY remind_at ASC
        LIMIT $1
        FOR UPDATE ${skipLocked}
      )
      RETURNING id, task_id, user_id, remind_at, timezone, reminder_type, retry_count
    `;

    let claimedReminders: Array<{
      id: string;
      task_id: string;
      user_id: string;
      remind_at: Date;
      timezone: string;
      reminder_type: string;
      retry_count: number;
    }>;

    try {
      const { rows } = await pool.query(claimQuery, [limit, leaseExpiresAt, MAX_REMINDER_RETRIES]);
      claimedReminders = rows;
    } catch (err) {
      console.error('Error claiming due reminders:', err);
      return { processed: 0, sent: 0, cancelled: 0, failed: 0 };
    }

    if (claimedReminders.length === 0) {
      return { processed: 0, sent: 0, cancelled: 0, failed: 0 };
    }

    let sent = 0;
    let cancelled = 0;
    let failed = 0;

    for (const rem of claimedReminders) {
      try {
        // Load associated task
        const { rows: taskRows } = await pool.query(
          'SELECT id, title, due_date, due_time, status FROM assignments WHERE id = $1',
          [rem.task_id],
        );

        if (taskRows.length === 0) {
          // Task was deleted; cancel reminder
          await pool.query(
            "UPDATE task_reminders SET status = 'cancelled', claim_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [rem.id],
          );
          cancelled++;
          continue;
        }

        const task = taskRows[0];
        if (task.status === 'COMPLETED') {
          // Task completed; cancel reminder
          await pool.query(
            "UPDATE task_reminders SET status = 'cancelled', claim_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [rem.id],
          );
          cancelled++;
          continue;
        }

        // Formulate concise reminder notification body
        let timingDetail = 'is due soon';
        if (rem.reminder_type === 'at_due') {
          timingDetail = 'is due now';
        } else if (rem.reminder_type === '5m_before') {
          timingDetail = 'is due in 5 minutes';
        } else if (rem.reminder_type === '15m_before') {
          timingDetail = 'is due in 15 minutes';
        } else if (rem.reminder_type === '30m_before') {
          timingDetail = 'is due in 30 minutes';
        } else if (rem.reminder_type === '1h_before') {
          timingDetail = 'is due in 1 hour';
        } else if (rem.reminder_type === '2h_before') {
          timingDetail = 'is due in 2 hours';
        } else if (rem.reminder_type === '1d_before') {
          timingDetail = 'is due tomorrow';
        } else if (rem.reminder_type === '2d_before') {
          timingDetail = 'is due in 2 days';
        } else if (rem.reminder_type === 'morning_of') {
          timingDetail = 'is due today';
        } else if (rem.reminder_type === 'custom') {
          timingDetail = 'scheduled reminder';
        }

        const body = rem.reminder_type === 'custom'
          ? `Reminder: "${task.title}".`
          : `Reminder: "${task.title}" ${timingDetail}.`;

        const pushRes = await pushService.sendToUser(rem.user_id, {
          title: 'CampusFlow',
          body,
          tag: `task-reminder-${task.id}`,
          data: {
            taskId: task.id,
            url: '/assignments',
          },
        });

        // If at least one device was reached (pushRes.sent > 0), OR if there were no transient network failures
        // (i.e. user has 0 subscriptions or expired subscriptions were pruned with HTTP 404/410),
        // we mark the reminder as sent to avoid an infinite retry loop on non-existent devices.
        if (pushRes.sent > 0 || pushRes.transientFailed === 0) {
          await pool.query(
            "UPDATE task_reminders SET status = 'sent', sent_at = CURRENT_TIMESTAMP, claim_expires_at = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [rem.id],
          );
          sent++;
        } else {
          // Transient failure on all reachable endpoints
          const nextRetry = (rem.retry_count ?? 0) + 1;
          if (nextRetry < MAX_REMINDER_RETRIES) {
            const retryDelayMs = 60 * 1000 * Math.pow(2, nextRetry - 1); // 1m, 2m exponential backoff
            const nextRemindAt = new Date(Date.now() + retryDelayMs);
            await pool.query(
              `UPDATE task_reminders
               SET status = 'pending',
                   remind_at = $2,
                   claim_expires_at = NULL,
                   retry_count = retry_count + 1,
                   attempt_count = attempt_count + 1,
                   last_error = $3,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [rem.id, nextRemindAt, 'Transient Web Push delivery failure'],
            );
          } else {
            await pool.query(
              `UPDATE task_reminders
               SET status = 'failed',
                   claim_expires_at = NULL,
                   retry_count = retry_count + 1,
                   attempt_count = attempt_count + 1,
                   last_error = $2,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [rem.id, 'Max Web Push delivery retries exceeded'],
            );
          }
          failed++;
        }
      } catch (err: unknown) {
        console.error(`Failed to dispatch reminder for task ${rem.task_id}:`, err);
        const nextRetry = (rem.retry_count ?? 0) + 1;
        const errMsg = err instanceof Error ? err.message : 'Unexpected reminder dispatch error';
        try {
          if (nextRetry < MAX_REMINDER_RETRIES) {
            const retryDelayMs = 60 * 1000 * Math.pow(2, nextRetry - 1);
            const nextRemindAt = new Date(Date.now() + retryDelayMs);
            await pool.query(
              `UPDATE task_reminders
               SET status = 'pending',
                   remind_at = $2,
                   claim_expires_at = NULL,
                   retry_count = retry_count + 1,
                   attempt_count = attempt_count + 1,
                   last_error = $3,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [rem.id, nextRemindAt, errMsg],
            );
          } else {
            await pool.query(
              `UPDATE task_reminders
               SET status = 'failed',
                   claim_expires_at = NULL,
                   retry_count = retry_count + 1,
                   attempt_count = attempt_count + 1,
                   last_error = $2,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [rem.id, errMsg],
            );
          }
        } catch (updateErr) {
          console.error(`Failed to update retry state for reminder ${rem.id}:`, updateErr);
        }
        failed++;
      }
    }

    return {
      processed: claimedReminders.length,
      sent,
      cancelled,
      failed,
    };
  },

  migrateExistingAssignments: (customPool = pool) => migrateExistingAssignmentsToReminders(customPool),
};

/**
 * Migrates legacy assignment reminders (e.g. 2h_before, 1d_before, 2d_before, morning_of)
 * to durable task_reminders records without altering or destroying the original assignment records.
 */
export async function migrateExistingAssignmentsToReminders(
  customPool = pool,
): Promise<{ totalFound: number; migratedCount: number; skippedCount: number }> {
  const { rows } = await customPool.query(`
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
    const taskId = row.id as string;
    const userId = row.user_id as string;
    const dueDate = row.due_date as string | null;
    const dueTime = row.due_time as string | null;
    const reminder = row.reminder as string;
    const status = row.status as string;

    if (!dueDate || !dueDate.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
      // Lack sufficient date information; preserve original assignment data and skip
      skippedCount++;
      continue;
    }

    // Lookup user preference timezone if available
    let userTz = 'UTC';
    try {
      const prefRes = await customPool.query(
        'SELECT timezone FROM user_preferences WHERE user_id = $1',
        [userId],
      );
      if (prefRes.rows[0]?.timezone) {
        userTz = prefRes.rows[0].timezone as string;
      }
    } catch {
      // Default to UTC
    }

    let calculatedRemindAt: Date | null;
    try {
      calculatedRemindAt = calculateRemindAtUtc({
        dueDate,
        dueTime,
        reminderType: reminder as ReminderType,
        timezone: userTz,
      });
    } catch {
      calculatedRemindAt = null;
    }

    if (!calculatedRemindAt || isNaN(calculatedRemindAt.getTime())) {
      skippedCount++;
      continue;
    }

    // Determine initial status
    let initialStatus: ReminderStatus = 'pending';
    if (status === 'COMPLETED') {
      initialStatus = 'cancelled';
    } else if (calculatedRemindAt.getTime() <= Date.now()) {
      // Past reminder: mark sent so it is not immediately re-spammed by cron
      initialStatus = 'sent';
    }

    await customPool.query(
      `
      INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
      `,
      [
        randomUUID(),
        taskId,
        userId,
        calculatedRemindAt,
        userTz,
        reminder,
        initialStatus,
        initialStatus === 'sent' ? new Date() : null,
      ],
    );

    migratedCount++;
  }

  return {
    totalFound: rows.length,
    migratedCount,
    skippedCount,
  };
}

