import pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { CampusItem } from '../types.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// We assume a table exists:
// CREATE TABLE campus_items (
//   id UUID PRIMARY KEY,
//   title TEXT,
//   type TEXT,
//   description TEXT,
//   date TEXT,
//   start_time TEXT,
//   end_time TEXT,
//   registration_deadline TEXT,
//   venue TEXT,
//   eligibility TEXT,
//   organizer TEXT,
//   important_actions JSONB,
//   source_text TEXT,
//   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

export const storageService = {
  getAll: async (): Promise<CampusItem[]> => {
    const { rows } = await pool.query('SELECT * FROM campus_items ORDER BY created_at DESC');
    const now = Date.now();

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      description: row.description,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      registrationDeadline: row.registration_deadline,
      venue: row.venue,
      eligibility: row.eligibility,
      organizer: row.organizer,
      importantActions: row.important_actions || [],
      sourceText: row.source_text
    })).filter(item => {
      if (!item.date || !item.endTime) return true;

      const parts = item.date.split('-');
      if (parts.length !== 3) return true;

      const timeParts = item.endTime.split(':');
      if (timeParts.length < 2) return true;

      const [year, month, day] = parts.map(Number);
      const [hours, minutes] = timeParts.map(Number);

      if (Number.isNaN(year) || Number.isNaN(hours)) return true;

      const endDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
      const expiresAt = endDate.getTime() + 60 * 60 * 1000; // end time + 1 hour

      return expiresAt > now;
    });
  },

  add: async (userId: string, item: Omit<CampusItem, 'id'>): Promise<CampusItem> => {
    const id = randomUUID();
    const query = `
      INSERT INTO campus_items (
        id, user_id, title, type, description, date, start_time, end_time,
        registration_deadline, venue, eligibility, organizer, important_actions, source_text
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *
    `;
    const values = [
      id,
      userId,
      item.title,
      item.type,
      item.description,
      item.date,
      item.startTime,
      item.endTime,
      item.registrationDeadline,
      item.venue,
      item.eligibility,
      item.organizer,
      JSON.stringify(item.importantActions || []),
      item.sourceText || ''
    ];

    const { rows } = await pool.query(query, values);
    const row = rows[0];
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      description: row.description,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      registrationDeadline: row.registration_deadline,
      venue: row.venue,
      eligibility: row.eligibility,
      organizer: row.organizer,
      importantActions: row.important_actions || [],
      sourceText: row.source_text
    };
  },

  delete: async (userId: string, id: string): Promise<boolean> => {
    const { rowCount } = await pool.query('DELETE FROM campus_items WHERE id = $1 AND user_id = $2', [id, userId]);
    return (rowCount ?? 0) > 0;
  },
};
