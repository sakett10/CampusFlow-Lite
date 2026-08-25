import pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Assignment } from '../types.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const assignmentsService = {
  getAll: async (): Promise<Assignment[]> => {
    const { rows } = await pool.query('SELECT * FROM assignments ORDER BY due_date ASC');
    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      status: row.status,
    }));
  },

  add: async (item: Omit<Assignment, 'id'>): Promise<Assignment> => {
    const id = randomUUID();
    const query = `
      INSERT INTO assignments (
        id, course_id, title, description, due_date, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      ) RETURNING *
    `;
    const values = [
      id,
      item.courseId,
      item.title,
      item.description || '',
      item.dueDate,
      item.status || 'PENDING'
    ];

    const { rows } = await pool.query(query, values);
    const row = rows[0];
    return {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      status: row.status,
    };
  },

  update: async (id: string, updates: Partial<Assignment>): Promise<Assignment | null> => {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.courseId !== undefined) { fields.push(`course_id = $${idx++}`); values.push(updates.courseId); }
    if (updates.title !== undefined) { fields.push(`title = $${idx++}`); values.push(updates.title); }
    if (updates.description !== undefined) { fields.push(`description = $${idx++}`); values.push(updates.description); }
    if (updates.dueDate !== undefined) { fields.push(`due_date = $${idx++}`); values.push(updates.dueDate); }
    if (updates.status !== undefined) { fields.push(`status = $${idx++}`); values.push(updates.status); }

    if (fields.length === 0) return null;

    values.push(id);
    const query = `UPDATE assignments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      status: row.status,
    };
  },

  delete: async (id: string): Promise<boolean> => {
    const { rowCount } = await pool.query('DELETE FROM assignments WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
