import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import type { Assignment } from '../types.js';

export const mapRowToAssignment = (row: Record<string, unknown>): Assignment => ({
  id: row.id as string,
  courseId: (row.course_id as string) || null,
  title: row.title as string,
  description: (row.description as string) || '',
  dueDate: (row.due_date as string) || '',
  status: row.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
  dueTime: (row.due_time as string) || null,
  reminder: (row.reminder as string) || null,
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

export const assignmentsService = {
  getAll: async (userId: string): Promise<Assignment[]> => {
    const { rows } = await pool.query(
      'SELECT * FROM assignments WHERE user_id = $1 ORDER BY due_date ASC',
      [userId],
    );

    return rows.map(mapRowToAssignment);
  },

  getBySourceId: async (userId: string, sourceId: string): Promise<Assignment | null> => {
    const { rows } = await pool.query(
      'SELECT * FROM assignments WHERE user_id = $1 AND source_id = $2 LIMIT 1',
      [userId, sourceId],
    );

    if (rows.length === 0) return null;
    return mapRowToAssignment(rows[0]);
  },

  add: async (
    userId: string,
    item: Omit<Assignment, 'id'>,
  ): Promise<Assignment> => {
    if (item.courseId) {
      const courseCheck = await pool.query(
        'SELECT id FROM courses WHERE id = $1 AND user_id = $2',
        [item.courseId, userId],
      );
      if (courseCheck.rows.length === 0) {
        throw new CourseNotFoundError();
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

    const { rows } = await pool.query(query, values);
    return mapRowToAssignment(rows[0]);
  },

  update: async (
    userId: string,
    id: string,
    updates: Partial<Assignment>,
  ): Promise<Assignment | null> => {
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

    if (fields.length === 0) {
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

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return null;
    }

    return mapRowToAssignment(rows[0]);
  },

  delete: async (userId: string, id: string): Promise<boolean> => {
    const { rowCount } = await pool.query(
      'DELETE FROM assignments WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return (rowCount ?? 0) > 0;
  },
};
