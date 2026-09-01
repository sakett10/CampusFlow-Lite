import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import type { CampusItem } from '../types.js';

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

function isPersonalCertificateEmail(row: {
  subject?: string | null;
  summary?: string | null;
  category?: string | null;
  audience?: string | null;
}): boolean {
  const sub = (row.subject || '').toLowerCase();
  const sum = (row.summary || '').toLowerCase();
  const aud = (row.audience || '').toLowerCase();
  const cat = (row.category || '').toLowerCase();

  return (
    sub.includes('certificate verification') ||
    sub.includes('fresher - certificate') ||
    sum.includes('certificate verification') ||
    sum.includes('fresher - certificate') ||
    sub.includes('missing document') ||
    sum.includes('missing document') ||
    sub.includes('candidate [') ||
    sum.includes('candidate [') ||
    sub.includes('physical fitness') ||
    sum.includes('physical fitness') ||
    sub.includes('provisional admission') ||
    sum.includes('provisional admission') ||
    aud.includes('individual') ||
    aud.includes('candidate') ||
    cat === 'admission'
  );
}

export function parseDateString(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 1970 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // 2. Day-first formats: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (year >= 1970 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // 3. Natural language formats (e.g. "25 September 2026", "September 25, 2026", "25 Sep 2026")
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
    };
  }

  return null;
}

export function isItemActive(
  item: { date?: string | null; endTime?: string | null; registrationDeadline?: string | null },
  referenceNowMs?: number,
): boolean {
  const dateStr = item.date || item.registrationDeadline;
  if (!dateStr) return true;

  const parsed = parseDateString(dateStr);
  if (!parsed) {
    // If the date string cannot be determined or parsed, keep the item active rather than prematurely expiring it
    return true;
  }

  let hours = 23;
  let minutes = 59;
  let hasEndTime = false;

  if (item.endTime && typeof item.endTime === 'string') {
    const rawEndTime = item.endTime.trim().toLowerCase();

    // Check 12-hour AM/PM formats e.g. "5:00 PM", "5 PM", "2:30 pm"
    const ampmMatch = rawEndTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampmMatch) {
      let h = Number(ampmMatch[1]);
      const m = ampmMatch[2] ? Number(ampmMatch[2]) : 0;
      const isPm = ampmMatch[3].toLowerCase() === 'pm';
      if (isPm && h < 12) h += 12;
      if (!isPm && h === 12) h = 0;
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        hours = h;
        minutes = m;
        hasEndTime = true;
      }
    } else {
      // Check 24-hour HH:mm
      const timeParts = rawEndTime.split(':');
      if (timeParts.length >= 2) {
        const h = Number(timeParts[0]);
        const m = Number(timeParts[1]);
        if (!Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          hours = h;
          minutes = m;
          hasEndTime = true;
        }
      }
    }
  }

  const eventEnd = new Date(parsed.year, parsed.month - 1, parsed.day, hours, minutes, 0, 0);
  const expiresAt = eventEnd.getTime() + (hasEndTime ? 60 * 60 * 1000 : 0);
  const now = typeof referenceNowMs === 'number' && referenceNowMs > 0 ? referenceNowMs : Date.now();
  return expiresAt > now;
}


export const storageService = {
  getAll: async (userId: string): Promise<CampusItem[]> => {
    // 1. Personal user items
    let personalItems: CampusItem[] = [];
    try {
      const { rows } = await pool.query(
        'SELECT * FROM campus_items WHERE user_id = $1 ORDER BY created_at DESC',
        [userId],
      );

      personalItems = rows
        .map((row) => ({
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
          sourceText: row.source_text,
          sourceType: 'personal' as const,
        }))
        .filter((item) => isItemActive(item));
    } catch {
      // Continue if query fails
    }

    // 2. Campus-wide published notices (Authoritative curated notices only)
    let publishedNoticeItems: CampusItem[] = [];
    const seenItemKeys = new Set<string>();

    try {
      const { rows: noticeRows } = await pool.query(
        `
        SELECT * FROM notices 
        WHERE status = 'published' 
        ORDER BY (CASE WHEN published_at IS NOT NULL THEN published_at ELSE created_at END) DESC, created_at DESC
        `,
      );

      publishedNoticeItems = noticeRows
        .filter((row) => !isPersonalCertificateEmail(row))
        .map((row) => {
          let itemType: CampusItem['type'] = 'ANNOUNCEMENT';
          if (row.category === 'exam' || row.category === 'assignment') {
            itemType = 'DEADLINE';
          } else if (row.category === 'event') {
            itemType = 'EVENT';
          }

          const dates = (row.important_dates as Array<{ label: string; date: string }>) || [];
          const eventDate = dates.length > 0 ? dates[0].date : null;

          const deadlineObj = dates.find(
            (d) =>
              d.label.toLowerCase().includes('deadline') ||
              d.label.toLowerCase().includes('last date') ||
              d.label.toLowerCase().includes('due'),
          );
          const regDeadline = deadlineObj ? deadlineObj.date : null;

          const actions = row.action_required ? [row.action_required as string] : [];

          return {
            id: row.id,
            title: row.title,
            type: itemType,
            description: row.summary,
            date: eventDate,
            startTime: null,
            endTime: null,
            registrationDeadline: regDeadline,
            venue: row.venue || null,
            eligibility: row.audience || null,
            organizer: row.source_sender || 'University Administration',
            importantActions: actions,
            sourceText: row.summary,
            sourceType: 'notice' as const,
          };
        })
        .filter((item) => isItemActive(item));

    } catch {
      // Continue if query fails
    }

    // 3. Merge published notices and personal items with deduplication
    const result: CampusItem[] = [];
    for (const item of [...publishedNoticeItems, ...personalItems]) {
      const key = `${(item.title || '').trim().toLowerCase()}|${item.date || ''}`;
      if (!seenItemKeys.has(key)) {
        seenItemKeys.add(key);
        result.push(item);
      }
    }

    return result;
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
