import pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Course } from '../types.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const coursesService = {
  getAll: async (): Promise<Course[]> => {
    const { rows } = await pool.query('SELECT * FROM courses ORDER BY created_at DESC');
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      instructor: row.instructor,
      credits: row.credits,
      attendedClasses: row.attended_classes,
      totalClasses: row.total_classes,
      attendanceThreshold: row.attendance_threshold,
    }));
  },

  add: async (item: Omit<Course, 'id'>): Promise<Course> => {
    const id = randomUUID();
    const query = `
      INSERT INTO courses (
        id, code, title, instructor, credits, attended_classes, total_classes, attendance_threshold
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      ) RETURNING *
    `;
    const values = [
      id,
      item.code,
      item.title,
      item.instructor,
      item.credits || 3,
      item.attendedClasses || 0,
      item.totalClasses || 0,
      item.attendanceThreshold || 75
    ];

    const { rows } = await pool.query(query, values);
    const row = rows[0];
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      instructor: row.instructor,
      credits: row.credits,
      attendedClasses: row.attended_classes,
      totalClasses: row.total_classes,
      attendanceThreshold: row.attendance_threshold,
    };
  },

  update: async (id: string, updates: Partial<Course>): Promise<Course | null> => {
    // Basic update builder for existing fields.
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.code !== undefined) { fields.push(`code = $${idx++}`); values.push(updates.code); }
    if (updates.title !== undefined) { fields.push(`title = $${idx++}`); values.push(updates.title); }
    if (updates.instructor !== undefined) { fields.push(`instructor = $${idx++}`); values.push(updates.instructor); }
    if (updates.credits !== undefined) { fields.push(`credits = $${idx++}`); values.push(updates.credits); }
    if (updates.attendedClasses !== undefined) { fields.push(`attended_classes = $${idx++}`); values.push(updates.attendedClasses); }
    if (updates.totalClasses !== undefined) { fields.push(`total_classes = $${idx++}`); values.push(updates.totalClasses); }
    if (updates.attendanceThreshold !== undefined) { fields.push(`attendance_threshold = $${idx++}`); values.push(updates.attendanceThreshold); }

    if (fields.length === 0) return null;

    values.push(id);
    const query = `UPDATE courses SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      instructor: row.instructor,
      credits: row.credits,
      attendedClasses: row.attended_classes,
      totalClasses: row.total_classes,
      attendanceThreshold: row.attendance_threshold,
    };
  },

  delete: async (id: string): Promise<boolean> => {
    const { rowCount } = await pool.query('DELETE FROM courses WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
