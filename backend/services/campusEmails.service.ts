import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import type { CampusEmail, NoticeCandidate } from '../types.js';

export const campusEmailsService = {
  persistEmail: async (data: {
    userId: string;
    sourceAccountEmail: string;
    sourceMessageId: string;
    sourceThreadId?: string | null;
    senderEmail?: string | null;
    senderName?: string | null;
    subject?: string | null;
    receivedAt?: string | null;
    bodyText?: string | null;
    snippet?: string | null;
  }): Promise<CampusEmail> => {
    const id = randomUUID();

    const query = `
      INSERT INTO campus_emails (
        id,
        user_id,
        source_account_email,
        source_message_id,
        source_thread_id,
        sender_email,
        sender_name,
        subject,
        received_at,
        body_text,
        snippet,
        analysis_status,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (source_account_email, source_message_id) DO UPDATE SET
        subject = EXCLUDED.subject,
        body_text = COALESCE(EXCLUDED.body_text, campus_emails.body_text),
        snippet = COALESCE(EXCLUDED.snippet, campus_emails.snippet),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      id,
      data.userId,
      data.sourceAccountEmail,
      data.sourceMessageId,
      data.sourceThreadId || null,
      data.senderEmail || null,
      data.senderName || null,
      data.subject || 'Untitled University Email',
      data.receivedAt || new Date().toISOString(),
      data.bodyText || null,
      data.snippet || null,
    ];

    const { rows } = await pool.query(query, values);
    return mapRowToCampusEmail(rows[0]);
  },

  updateAnalysisSuccess: async (
    sourceAccountEmail: string,
    sourceMessageId: string,
    candidate: NoticeCandidate,
  ): Promise<CampusEmail | null> => {
    let eventDate: string | null = null;
    let deadline: string | null = null;

    if (candidate.importantDates && candidate.importantDates.length > 0) {
      eventDate = candidate.importantDates[0].date;
      const deadlineObj = candidate.importantDates.find(
        (d) =>
          d.label.toLowerCase().includes('deadline') ||
          d.label.toLowerCase().includes('last date') ||
          d.label.toLowerCase().includes('due'),
      );
      if (deadlineObj) {
        deadline = deadlineObj.date;
      }
    }

    const actions = candidate.actionRequired ? [candidate.actionRequired] : [];

    const query = `
      UPDATE campus_emails
      SET
        analysis_status = 'completed',
        analysis_error = NULL,
        category = $1,
        audience = $2,
        importance = $3,
        summary = $4,
        event_date = $5,
        deadline = $6,
        venue = $7,
        organizer = $8,
        important_actions = $9,
        links = $10,
        documents = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE source_account_email = $12 AND source_message_id = $13
      RETURNING *
    `;

    const values = [
      candidate.category,
      candidate.audience || null,
      candidate.priority,
      candidate.summary,
      eventDate,
      deadline,
      candidate.venue || null,
      candidate.source?.sender || null,
      JSON.stringify(actions),
      JSON.stringify(candidate.links || []),
      JSON.stringify(candidate.documents || []),
      sourceAccountEmail,
      sourceMessageId,
    ];

    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return null;
    return mapRowToCampusEmail(rows[0]);
  },

  updateAnalysisFailure: async (
    sourceAccountEmail: string,
    sourceMessageId: string,
    errorMessage: string,
  ): Promise<CampusEmail | null> => {
    const query = `
      UPDATE campus_emails
      SET
        analysis_status = 'failed',
        analysis_error = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE source_account_email = $2 AND source_message_id = $3
      RETURNING *
    `;

    const { rows } = await pool.query(query, [errorMessage, sourceAccountEmail, sourceMessageId]);
    if (rows.length === 0) return null;
    return mapRowToCampusEmail(rows[0]);
  },

  getAllForUser: async (userId: string): Promise<CampusEmail[]> => {
    const { rows } = await pool.query(
      `
      SELECT * FROM campus_emails
      WHERE user_id = $1
      ORDER BY received_at DESC NULLS LAST, created_at DESC
      `,
      [userId],
    );

    return rows.map(mapRowToCampusEmail);
  },

  getBySourceMessageId: async (
    sourceAccountEmail: string,
    sourceMessageId: string,
  ): Promise<CampusEmail | null> => {
    const { rows } = await pool.query(
      `
      SELECT * FROM campus_emails
      WHERE source_account_email = $1 AND source_message_id = $2
      LIMIT 1
      `,
      [sourceAccountEmail, sourceMessageId],
    );

    if (rows.length === 0) return null;
    return mapRowToCampusEmail(rows[0]);
  },
};

function mapRowToCampusEmail(row: Record<string, unknown>): CampusEmail {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sourceAccountEmail: String(row.source_account_email),
    sourceMessageId: String(row.source_message_id),
    sourceThreadId: row.source_thread_id ? String(row.source_thread_id) : null,
    senderEmail: row.sender_email ? String(row.sender_email) : null,
    senderName: row.sender_name ? String(row.sender_name) : null,
    subject: row.subject ? String(row.subject) : null,
    receivedAt: row.received_at ? new Date(row.received_at as string).toISOString() : null,
    bodyText: row.body_text ? String(row.body_text) : null,
    snippet: row.snippet ? String(row.snippet) : null,
    analysisStatus: (row.analysis_status as CampusEmail['analysisStatus']) || 'pending',
    analysisError: row.analysis_error ? String(row.analysis_error) : null,
    category: row.category ? String(row.category) : null,
    audience: row.audience ? String(row.audience) : null,
    importance: row.importance ? String(row.importance) : null,
    summary: row.summary ? String(row.summary) : null,
    eventDate: row.event_date ? String(row.event_date) : null,
    deadline: row.deadline ? String(row.deadline) : null,
    venue: row.venue ? String(row.venue) : null,
    organizer: row.organizer ? String(row.organizer) : null,
    importantActions: Array.isArray(row.important_actions) ? (row.important_actions as string[]) : [],
    links: Array.isArray(row.links) ? (row.links as Array<{ label: string; url: string }>) : [],
    documents: Array.isArray(row.documents) ? (row.documents as Array<{ label: string; url: string }>) : [],
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
  };
}
