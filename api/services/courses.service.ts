import pg from 'pg';
import { randomUUID } from 'node:crypto';

import type { Course } from '../types.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const mapRowToCourse = (row: Record<string, unknown>): Course => ({
  id: row.id as string,
  code: row.code as string,
  title: row.title as string,
  instructor: row.instructor as string,
  credits: row.credits as number,
  attendedClasses: row.attended_classes as number,
  totalClasses: row.total_classes as number,
  attendanceThreshold: row.attendance_threshold as number,
});

export const coursesService = {
  getAll: async (userId: string): Promise<Course[]> => {
    const { rows } = await pool.query(
      'SELECT * FROM courses WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );

    return rows.map(mapRowToCourse);
  },

  add: async (
    userId: string,
    item: Omit<Course, 'id'>,
  ): Promise<Course> => {
    const id = randomUUID();

    const query = `
      INSERT INTO courses (
        id,
        user_id,
        code,
        title,
        instructor,
        credits,
        attended_classes,
        total_classes,
        attendance_threshold
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      id,
      userId,
      item.code,
      item.title,
      item.instructor,
      item.credits || 3,
      item.attendedClasses || 0,
      item.totalClasses || 0,
      item.attendanceThreshold || 75,
    ];

    const { rows } = await pool.query(query, values);

    return mapRowToCourse(rows[0]);
  },

  update: async (
    userId: string,
    id: string,
    updates: Partial<Course>,
  ): Promise<Course | null> => {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.code !== undefined) {
      fields.push(`code = $${idx++}`);
      values.push(updates.code);
    }

    if (updates.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(updates.title);
    }

    if (updates.instructor !== undefined) {
      fields.push(`instructor = $${idx++}`);
      values.push(updates.instructor);
    }

    if (updates.credits !== undefined) {
      fields.push(`credits = $${idx++}`);
      values.push(updates.credits);
    }

    if (updates.attendedClasses !== undefined) {
      fields.push(`attended_classes = $${idx++}`);
      values.push(updates.attendedClasses);
    }

    if (updates.totalClasses !== undefined) {
      fields.push(`total_classes = $${idx++}`);
      values.push(updates.totalClasses);
    }

    if (updates.attendanceThreshold !== undefined) {
      fields.push(`attendance_threshold = $${idx++}`);
      values.push(updates.attendanceThreshold);
    }

    if (fields.length === 0) {
      return null;
    }

    values.push(id);
    values.push(userId);

    const query = `
      UPDATE courses
      SET ${fields.join(', ')}
      WHERE id = $${idx}
        AND user_id = $${idx + 1}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return null;
    }

    return mapRowToCourse(rows[0]);
  },

  delete: async (userId: string, id: string): Promise<boolean> => {
    const { rowCount } = await pool.query(
      'DELETE FROM courses WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return (rowCount ?? 0) > 0;
  },
};