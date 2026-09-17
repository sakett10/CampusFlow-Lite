import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import type { Assignment } from '../types.js';
import { noticesService, UnauthorizedNoticeAccessError } from './notices.service.js';
import { remindersService, type ReminderType } from './reminders.service.js';
export { UnauthorizedNoticeAccessError };

export interface TaskReminderInput {
  customRemindAt?: string | null;
  customDate?: string | null;
  customTime?: string | null;
  timezone?: string | null;
}

export const mapRowToAssignment = (row: Record<string, unknown>): Assignment => ({
  id: row.id as string,
  courseId: (row.course_id as string) || null,
  title: row.title as string,
  description: (row.description as string) || '',
  dueDate: (row.due_date as string) || '',
  status: row.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
  dueTime: (row.due_time as string) || null,
  reminder: (row.reminder_rule_type as string) || (row.reminder as string) || null,
  reminderRemindAt: row.reminder_remind_at ? new Date(row.reminder_remind_at as string).toISOString() : null,
  reminderTimezone: (row.reminder_timezone as string) || null,
  reminderStatus: (row.reminder_status as 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled') || null,
  priority: (row.priority as 'low' | 'medium' | 'high' | 'urgent') || 'medium',
  source: (row.source as string) || 'manual',
  sourceId: (row.source_id as string) || null,
  createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
  completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
});

export class CourseNotFoundError extends Error {
  constructor(message = 'Course not found or access denied') {
    super(message);
    this.name = 'CourseNotFoundError';
  }
}

export class UnauthorizedSourceEmailError extends Error {
  constructor(message = 'Source email not found or access denied') {
    super(message);
    this.name = 'UnauthorizedSourceEmailError';
  }
}

export const assignmentsService = {
  getAll: async (userId: string): Promise<Assignment[]> => {
    const { rows } = await pool.query(
      `
      SELECT a.*,
             tr.remind_at AS reminder_remind_at,
             tr.timezone AS reminder_timezone,
             tr.reminder_type AS reminder_rule_type,
             tr.status AS reminder_status
      FROM assignments a
      LEFT JOIN task_reminders tr ON tr.task_id = a.id AND tr.user_id = a.user_id
      WHERE a.user_id = $1
      ORDER BY a.due_date ASC
      `,
      [userId],
    );

    return rows.map(mapRowToAssignment);
  },

  getBySourceId: async (userId: string, sourceId: string): Promise<Assignment | null> => {
    const { rows } = await pool.query(
      `
      SELECT a.*,
             tr.remind_at AS reminder_remind_at,
             tr.timezone AS reminder_timezone,
             tr.reminder_type AS reminder_rule_type,
             tr.status AS reminder_status
      FROM assignments a
      LEFT JOIN task_reminders tr ON tr.task_id = a.id AND tr.user_id = a.user_id
      WHERE a.user_id = $1 AND a.source_id = $2
      LIMIT 1
      `,
      [userId, sourceId],
    );

    if (rows.length === 0) return null;
    return mapRowToAssignment(rows[0]);
  },

  add: async (
    userId: string,
    item: Omit<Assignment, 'id'> & TaskReminderInput,
    client?: PoolClient,
  ): Promise<Assignment> => {
    const db = client || pool;
    if (item.courseId) {
      const courseCheck = await db.query(
        'SELECT id FROM courses WHERE id = $1 AND user_id = $2',
        [item.courseId, userId],
      );
      if (courseCheck.rows.length === 0) {
        throw new CourseNotFoundError();
      }
    }

    if (item.source === 'gmail' || item.source === 'email') {
      if (!item.sourceId) {
        throw new UnauthorizedSourceEmailError('Source email ID is required');
      }
      const emailCheck = await db.query(
        'SELECT id FROM campus_emails WHERE user_id = $1 AND (source_message_id = $2 OR id::text = $2) LIMIT 1',
        [userId, item.sourceId],
      );
      if (emailCheck.rows.length === 0) {
        throw new UnauthorizedSourceEmailError();
      }
    }

    if (item.source === 'notice') {
      if (!item.sourceId) {
        throw new UnauthorizedNoticeAccessError('Notice ID is required');
      }
      const notice = await noticesService.getById(item.sourceId, false, userId, client);
      if (!notice || notice.status === 'archived' || (notice.createdByUserId !== userId && notice.status !== 'published')) {
        throw new UnauthorizedNoticeAccessError();
      }
    }

    const id = randomUUID();

    const query = `
      INSERT INTO assignments (
        id,
        user_id,
        course_id,
        title,
        description,
        due_date,
        status,
        due_time,
        reminder,
        priority,
        source,
        source_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const values = [
      id,
      userId,
      item.courseId || null,
      item.title,
      item.description || '',
      item.dueDate || '',
      item.status || 'PENDING',
      item.dueTime || null,
      item.reminder || null,
      item.priority || 'medium',
      item.source || 'manual',
      item.sourceId || null,
    ];

    const { rows } = await db.query(query, values);
    const created = mapRowToAssignment(rows[0]);

    if (item.reminder && item.reminder !== 'none') {
      try {
        const rem = await remindersService.upsertTaskReminder({
          userId,
          taskId: id,
          reminderType: item.reminder as ReminderType,
          customRemindAt: item.customRemindAt,
          customDate: item.customDate,
          customTime: item.customTime,
          timezone: item.timezone || 'UTC',
          client: db,
        });
        if (rem) {
          created.reminder = rem.reminderType;
          created.reminderRemindAt = rem.remindAt;
          created.reminderTimezone = rem.timezone;
          created.reminderStatus = rem.status;
        }
      } catch (err) {
        console.warn('Failed to set initial task reminder:', err);
        if (client) {
          throw err;
        }
        await db.query('UPDATE assignments SET reminder = NULL WHERE id = $1', [id]).catch(() => {});
        created.reminder = null;
        created.reminderRemindAt = null;
        created.reminderTimezone = null;
        created.reminderStatus = null;
      }
    }

    return created;
  },

  update: async (
    userId: string,
    id: string,
    updates: Partial<Assignment> & TaskReminderInput,
  ): Promise<Assignment | null> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Load and lock the existing assignment owned by the authenticated user
      const { rows: existingRows } = await client.query(
        'SELECT * FROM assignments WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [id, userId],
      );
      if (existingRows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const existing = mapRowToAssignment(existingRows[0]);

      // 2. Merge existing source/sourceId with incoming fields
      const effectiveSource = updates.source !== undefined ? updates.source : existing.source;
      const effectiveSourceId = updates.sourceId !== undefined ? updates.sourceId : existing.sourceId;

      // 3. Determine if source/sourceId are changed
      const sourceChanged = updates.source !== undefined && updates.source !== existing.source;
      const sourceIdChanged = updates.sourceId !== undefined && updates.sourceId !== existing.sourceId;

      // 4. Validate effective source/sourceId pair BEFORE writing changes if either changed
      if (sourceChanged || sourceIdChanged) {
        if (effectiveSource === 'gmail' || effectiveSource === 'email') {
          if (!effectiveSourceId) {
            throw new UnauthorizedSourceEmailError('Source email ID is required');
          }
          const emailCheck = await client.query(
            'SELECT id FROM campus_emails WHERE user_id = $1 AND (source_message_id = $2 OR id::text = $2) LIMIT 1',
            [userId, effectiveSourceId],
          );
          if (emailCheck.rows.length === 0) {
            throw new UnauthorizedSourceEmailError();
          }
        } else if (effectiveSource === 'notice') {
          if (!effectiveSourceId) {
            throw new UnauthorizedNoticeAccessError('Notice ID is required');
          }
          const notice = await noticesService.getById(effectiveSourceId, false, userId, client);
          if (!notice || notice.status === 'archived' || (notice.createdByUserId !== userId && notice.status !== 'published')) {
            throw new UnauthorizedNoticeAccessError();
          }
        }
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (updates.courseId !== undefined) {
        fields.push(`course_id = $${idx++}`);
        values.push(updates.courseId);
      }

      if (updates.title !== undefined) {
        fields.push(`title = $${idx++}`);
        values.push(updates.title);
      }

      if (updates.description !== undefined) {
        fields.push(`description = $${idx++}`);
        values.push(updates.description);
      }

      if (updates.dueDate !== undefined) {
        fields.push(`due_date = $${idx++}`);
        values.push(updates.dueDate);
      }

      if (updates.dueTime !== undefined) {
        fields.push(`due_time = $${idx++}`);
        values.push(updates.dueTime);
      }

      if (updates.reminder !== undefined) {
        fields.push(`reminder = $${idx++}`);
        values.push(updates.reminder);
      }

      if (updates.priority !== undefined) {
        fields.push(`priority = $${idx++}`);
        values.push(updates.priority);
      }

      if (updates.source !== undefined) {
        fields.push(`source = $${idx++}`);
        values.push(updates.source);
      }

      if (updates.sourceId !== undefined) {
        fields.push(`source_id = $${idx++}`);
        values.push(updates.sourceId);
      }

      if (updates.status !== undefined) {
        fields.push(`status = $${idx++}`);
        values.push(updates.status);

        if (updates.status === 'COMPLETED') {
          fields.push(`completed_at = CURRENT_TIMESTAMP`);
        } else {
          fields.push(`completed_at = NULL`);
        }
      }

      const hasSchedulingChanges =
        updates.reminder !== undefined ||
        updates.customRemindAt !== undefined ||
        updates.customDate !== undefined ||
        updates.customTime !== undefined ||
        updates.timezone !== undefined;

      if (fields.length === 0 && !hasSchedulingChanges) {
        await client.query('ROLLBACK');
        return null;
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(id);
      const idIndex = idx++;

      values.push(userId);
      const userIdIndex = idx++;

      let courseOwnershipClause = '';

      if (updates.courseId !== undefined && updates.courseId !== null) {
        values.push(updates.courseId);
        const courseIdIndex = idx;

        courseOwnershipClause = `
          AND EXISTS (
            SELECT 1
            FROM courses c
            WHERE c.id = $${courseIdIndex}
              AND c.user_id = $${userIdIndex}
          )
        `;
      }

      const query = `
        UPDATE assignments
        SET ${fields.join(', ')}
        WHERE id = $${idIndex}
          AND user_id = $${userIdIndex}
          ${courseOwnershipClause}
        RETURNING *
      `;

      const { rows } = await client.query(query, values);

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const updated = mapRowToAssignment(rows[0]);

      const effectiveReminderType =
        updates.reminder !== undefined
          ? (updates.reminder || 'none')
          : (existing.reminder || 'none');

      if (hasSchedulingChanges) {
        if (!effectiveReminderType || effectiveReminderType === 'none') {
          await remindersService.deleteReminder(userId, id, client);
        } else {
          await remindersService.upsertTaskReminder({
            userId,
            taskId: id,
            reminderType: effectiveReminderType as ReminderType,
            customRemindAt: updates.customRemindAt,
            customDate: updates.customDate,
            customTime: updates.customTime,
            timezone: updates.timezone || undefined,
            client,
          });
        }
      } else if (
        updates.dueDate !== undefined ||
        updates.dueTime !== undefined ||
        updates.status !== undefined
      ) {
        await remindersService.onTaskUpdated(
          userId,
          id,
          {
            dueDate: updated.dueDate,
            dueTime: updated.dueTime,
            status: updated.status,
          },
          client,
        );
      }

      // Always reload latest reminder state before commit to ensure complete metadata is returned
      const currentRem = await remindersService.getByTaskId(userId, id, client);
      if (currentRem) {
        updated.reminder = currentRem.reminderType;
        updated.reminderRemindAt = currentRem.remindAt;
        updated.reminderTimezone = currentRem.timezone;
        updated.reminderStatus = currentRem.status;
      } else {
        if (effectiveReminderType === 'none' || updates.reminder === 'none') {
          await client.query(
            'UPDATE assignments SET reminder = NULL WHERE id = $1 AND user_id = $2',
            [id, userId],
          );
          updated.reminder = null;
        }
        updated.reminderRemindAt = null;
        updated.reminderTimezone = null;
        updated.reminderStatus = null;
      }

      await client.query('COMMIT');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Failed to update assignment ${id}:`, err);
      throw err;
    } finally {
      client.release();
    }
  },

  delete: async (userId: string, id: string): Promise<boolean> => {
    // Foreign key constraint task_reminders.task_id -> assignments(id) ON DELETE CASCADE
    // ensures associated reminders are deleted atomically in the database.
    const { rowCount } = await pool.query(
      'DELETE FROM assignments WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return (rowCount ?? 0) > 0;
  },
};
