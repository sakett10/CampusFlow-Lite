import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';

import type { Assignment } from '../types.js';

const mapRowToAssignment = (row: Record<string, unknown>): Assignment => ({
  id: row.id as string,
  courseId: row.course_id as string,
  title: row.title as string,
  description: row.description as string,
  dueDate: row.due_date as string,
  status: row.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
});

export const assignmentsService = {
  getAll: async (userId: string): Promise<Assignment[]> => {
    const { rows } = await pool.query(
      'SELECT * FROM assignments WHERE user_id = $1 ORDER BY due_date ASC',
      [userId],
    );

    return rows.map(mapRowToAssignment);
  },

  add: async (
    userId: string,
    item: Omit<Assignment, 'id'>,
  ): Promise<Assignment> => {
    const id = randomUUID();

    const query = `
      INSERT INTO assignments (
        id,
        user_id,
        course_id,
        title,
        description,
        due_date,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      id,
      userId,
      item.courseId,
      item.title,
      item.description || '',
      item.dueDate,
      item.status || 'PENDING',
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

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }

    if (fields.length === 0) {
      return null;
    }

    values.push(id);
    const idIndex = idx++;

    values.push(userId);
    const userIdIndex = idx++;

    let courseOwnershipClause = '';

    if (updates.courseId !== undefined) {
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
