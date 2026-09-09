import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import type {
  Notice,
  NoticeCandidate,
  NoticeCategory,
  NoticePriority,
  NoticeStatus,
  Assignment,
} from '../types.js';
import { validateNoticeCandidate, NoticeValidationError } from './noticeValidator.js';
import {
  createAuthenticatedGmailClient,
  parseGmailMessageDetails,
  toStructuredGmailMessage,
  GmailNotConnectedError,
} from './gmail.service.js';
import { noticeAnalyzerService } from './noticeAnalyzer.service.js';
import { notificationsService } from './notifications.service.js';
import { mapRowToAssignment } from './assignments.service.js';
import { parseNaturalDate } from './deadlineParser.service.js';
import { isReviewerUserId } from '../middleware/requireAuth.js';

export class UnauthorizedNoticeAccessError extends Error {
  constructor(message = 'You do not have permission to access or convert this notice') {
    super(message);
    this.name = 'UnauthorizedNoticeAccessError';
  }
}



export class DuplicateNoticeError extends Error {
  public readonly existingNoticeId?: string;

  constructor(message: string, existingNoticeId?: string) {
    super(message);
    this.name = 'DuplicateNoticeError';
    this.existingNoticeId = existingNoticeId;
  }
}

export class NoticeSuppressedError extends Error {
  constructor(message = 'Notice is suppressed or previously deleted') {
    super(message);
    this.name = 'NoticeSuppressedError';
  }
}

export class InvalidNoticeStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNoticeStateTransitionError';
  }
}

export class NoticeNotFoundError extends Error {
  constructor(message = 'Notice not found') {
    super(message);
    this.name = 'NoticeNotFoundError';
  }
}

export function generateNoticeFingerprint(
  title: string,
  eventDate?: string | null,
  venue?: string | null,
  organizer?: string | null,
): string {
  const normTitle = (title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normDate = (eventDate || '').trim();
  const normVenue = (venue || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normOrg = (organizer || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${normTitle}|${normDate}|${normVenue}|${normOrg}`;
}

export function isPersonalOrNonNotice(candidate: {
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  audience?: string | null;
  isPersonal?: boolean;
  isCampusWide?: boolean;
}): boolean {
  if (candidate.isPersonal === true) return true;
  if (candidate.isCampusWide === false) return true;

  const title = (candidate.title || '').toLowerCase();
  const summary = (candidate.summary || '').toLowerCase();
  const audience = (candidate.audience || '').toLowerCase();
  const category = (candidate.category || '').toLowerCase();

  const excludedPatterns = [
    'fresher - certificate verification',
    'certificate verification',
    'certificate of physical fitness',
    'missing 12th mark list',
    'pending document upload',
    'provisional admission letter required',
    'candidate [',
    'candidate verification',
    'document verification',
    'upload missing',
    'provisional admission',
    'admission document',
    'verification process',
  ];

  for (const pattern of excludedPatterns) {
    if (title.includes(pattern) || summary.includes(pattern)) {
      return true;
    }
  }

  if (audience.includes('individual') || audience.includes('candidate')) {
    return true;
  }

  if (category === 'admission') {
    return true;
  }

  return false;
}

export async function isNoticeSuppressed(
  accountEmail: string,
  messageId?: string | null,
  fingerprint?: string | null,
): Promise<boolean> {
  if (messageId) {
    const { rows } = await pool.query(
      'SELECT id FROM notice_suppressions WHERE source_account_email = $1 AND source_message_id = $2 LIMIT 1',
      [accountEmail, messageId],
    );
    if (rows.length > 0) return true;
  }

  if (fingerprint) {
    const { rows } = await pool.query(
      'SELECT id FROM notice_suppressions WHERE normalized_fingerprint = $1 LIMIT 1',
      [fingerprint],
    );
    if (rows.length > 0) return true;
  }

  return false;
}

const ALLOWED_TRANSITIONS: Record<NoticeStatus, NoticeStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['published', 'rejected'],
  published: ['archived'],
  rejected: ['archived'],
  archived: [],
};

const mapRowToNotice = (row: Record<string, unknown>): Notice => ({
  id: row.id as string,
  createdByUserId: row.created_by_user_id as string,
  title: row.title as string,
  summary: row.summary as string,
  category: row.category as NoticeCategory,
  priority: row.priority as NoticePriority,
  audience: (row.audience as string) || null,
  importantDates: (row.important_dates as Array<{ label: string; date: string }>) || [],
  actionRequired: (row.action_required as string) || null,
  venue: (row.venue as string) || null,
  links: (row.links as Array<{ label: string; url: string }>) || [],
  documents: (row.documents as Array<{ label: string; url: string }>) || [],
  sourceProvider: (row.source_provider as string) || 'gmail',
  sourceConnectionId: (row.source_connection_id as string) || null,
  sourceAccountEmail: (row.source_account_email as string) || null,
  sourceMessageId: (row.source_message_id as string) || null,
  sourceSender: (row.source_sender as string) || null,
  sourceSubject: (row.source_subject as string) || null,
  status: row.status as NoticeStatus,
  isConverted: Boolean(row.is_converted),
  convertedToTaskId: (row.converted_to_task_id as string) || null,
  convertedAt: row.converted_at ? new Date(row.converted_at as string).toISOString() : null,
  createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : new Date().toISOString(),
  updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : new Date().toISOString(),
  publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null,
  sourceReceivedAt: row.source_received_at
    ? new Date(row.source_received_at as string).toISOString()
    : row.created_at
    ? new Date(row.created_at as string).toISOString()
    : null,
});

export interface NoticeFilters {
  isReviewer: boolean;
  userId?: string;
  status?: NoticeStatus;
  category?: NoticeCategory;
  priority?: NoticePriority;
  search?: string;
}

export const noticesService = {
  createFromCandidate: async (
    userId: string,
    candidate: NoticeCandidate,
    sourceMeta?: { connectionId?: string; accountEmail?: string; initialStatus?: NoticeStatus; sourceReceivedAt?: string | null },
  ): Promise<Notice> => {
    // 1. Exclude personal / candidate verification emails
    if (isPersonalOrNonNotice(candidate)) {
      throw new NoticeValidationError('Personal or candidate-specific email excluded from campus notice curation', [
        'category',
      ]);
    }

    const validated = validateNoticeCandidate(candidate, candidate.source);
    const id = randomUUID();
    const status: NoticeStatus = sourceMeta?.initialStatus || 'pending';

    const dates = validated.importantDates || [];
    const eventDate = dates.length > 0 ? dates[0].date : null;
    const fingerprint = generateNoticeFingerprint(
      validated.title,
      eventDate,
      validated.venue,
      validated.source.sender,
    );

    // 2. Check persistent suppression table
    const isSuppressed = await isNoticeSuppressed(
      sourceMeta?.accountEmail || 'manual',
      validated.source.messageId,
      fingerprint,
    );
    if (isSuppressed) {
      throw new NoticeSuppressedError('Notice was previously deleted or suppressed');
    }

    // 3. Check account-scoped duplicate by messageId in connected account
    if (sourceMeta?.accountEmail && validated.source.messageId) {
      const { rows: existingRows } = await pool.query(
        `
        SELECT id FROM notices
        WHERE source_account_email = $1 AND source_message_id = $2
        LIMIT 1
        `,
        [sourceMeta.accountEmail, validated.source.messageId],
      );

      if (existingRows.length > 0) {
        throw new DuplicateNoticeError(
          'Notice for this Gmail message already exists in the connected account',
          existingRows[0].id,
        );
      }
    }

    const isPublished = status === 'published';
    const sourceReceivedAt = sourceMeta?.sourceReceivedAt || validated.source.receivedAt || null;
    const query = `
      INSERT INTO notices (
        id,
        created_by_user_id,
        title,
        summary,
        category,
        priority,
        audience,
        important_dates,
        action_required,
        venue,
        links,
        documents,
        source_provider,
        source_connection_id,
        source_account_email,
        source_message_id,
        source_sender,
        source_subject,
        status,
        published_at,
        source_received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *
    `;

    const values = [
      id,
      userId,
      validated.title,
      validated.summary,
      validated.category,
      validated.priority,
      validated.audience || null,
      JSON.stringify(validated.importantDates || []),
      validated.actionRequired || null,
      validated.venue || null,
      JSON.stringify(validated.links || []),
      JSON.stringify(validated.documents || []),
      validated.source.provider || 'gmail',
      sourceMeta?.connectionId || null,
      sourceMeta?.accountEmail || null,
      validated.source.messageId || null,
      validated.source.sender || null,
      validated.source.subject || null,
      status,
      isPublished ? (sourceReceivedAt || new Date().toISOString()) : null,
      sourceReceivedAt,
    ];

    const { rows } = await pool.query(query, values);
    const notice = mapRowToNotice(rows[0]);

    if (isPublished) {
      const isCampusNotice = isReviewerUserId(userId) || userId === 'admin' || !sourceMeta?.accountEmail;
      if (isCampusNotice) {
        try {
          await notificationsService.notifyNoticePublished(notice);
        } catch (notifErr) {
          console.error('Failed to notify notice published on creation:', notifErr);
        }
      }
    }

    return notice;
  },


  getAll: async (filters: NoticeFilters): Promise<Notice[]> => {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const reviewerIds = (process.env.REVIEWER_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const authorizedReviewers = Array.from(new Set(['admin', ...reviewerIds, ...adminIds]));

    // Strict account isolation:
    // Any notice with source_account_email set is a Gmail-derived notice.
    // If not created by an authorized reviewer or admin, it MUST only be visible to its creator.
    // Notices with source_account_email IS NULL or created by authorized reviewers are campus-wide institutional notices.
    if (!filters.isReviewer) {
      if (filters.userId) {
        if (filters.status) {
          conditions.push(`(
            (status = $${idx} AND (
              source_account_email IS NULL OR
              created_by_user_id = ANY($${idx + 2}::text[]) OR
              created_by_user_id LIKE 'reviewer%'
            )) OR
            (created_by_user_id = $${idx + 1} AND status = $${idx})
          )`);
          values.push(filters.status, filters.userId, authorizedReviewers);
          idx += 3;
        } else {
          conditions.push(`(
            (status = 'published' AND (
              source_account_email IS NULL OR
              created_by_user_id = ANY($${idx + 1}::text[]) OR
              created_by_user_id LIKE 'reviewer%'
            )) OR
            (created_by_user_id = $${idx})
          )`);
          values.push(filters.userId, authorizedReviewers);
          idx += 2;
        }
      } else {
        conditions.push(`(
          status = 'published' AND (
            source_account_email IS NULL OR
            created_by_user_id = ANY($${idx}::text[]) OR
            created_by_user_id LIKE 'reviewer%'
          )
        )`);
        values.push(authorizedReviewers);
        idx++;
        if (filters.status) {
          conditions.push(`status = $${idx++}`);
          values.push(filters.status);
        }
      }
    } else {
      if (filters.userId) {
        conditions.push(`(
          source_account_email IS NULL OR
          created_by_user_id = ANY($${idx + 1}::text[]) OR
          created_by_user_id LIKE 'reviewer%' OR
          created_by_user_id = $${idx}
        )`);
        values.push(filters.userId, authorizedReviewers);
        idx += 2;
      } else {
        conditions.push(`(
          source_account_email IS NULL OR
          created_by_user_id = ANY($${idx}::text[]) OR
          created_by_user_id LIKE 'reviewer%'
        )`);
        values.push(authorizedReviewers);
        idx++;
      }
      if (filters.status) {
        conditions.push(`status = $${idx++}`);
        values.push(filters.status);
      }
    }

    if (filters.category) {
      conditions.push(`category = $${idx++}`);
      values.push(filters.category);
    }

    if (filters.priority) {
      conditions.push(`priority = $${idx++}`);
      values.push(filters.priority);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        `(title ILIKE $${idx} OR summary ILIKE $${idx} OR venue ILIKE $${idx} OR audience ILIKE $${idx})`,
      );
      values.push(term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT * FROM notices
      ${whereClause}
      ORDER BY COALESCE(source_received_at, published_at, created_at) DESC, created_at DESC
    `;

    const { rows } = await pool.query(query, values);
    return rows.map(mapRowToNotice);
  },

  getById: async (id: string, isReviewer: boolean, userId?: string): Promise<Notice | null> => {
    const { rows } = await pool.query('SELECT * FROM notices WHERE id = $1', [id]);
    if (rows.length === 0) return null;

    const notice = mapRowToNotice(rows[0]);
    const isOwner = Boolean(userId && notice.createdByUserId === userId);
    const isCampusNotice =
      isReviewerUserId(notice.createdByUserId) ||
      notice.createdByUserId === 'admin' ||
      notice.createdByUserId.startsWith('reviewer') ||
      !notice.sourceAccountEmail;

    // Strict account isolation: Gmail-derived notices are strictly private to their owner unless institutional
    if (!isOwner && !isCampusNotice) {
      return null;
    }

    // Students cannot view unpublished institutional notices (avoids leaking draft existence)
    if (!isReviewer && !isOwner && notice.status !== 'published') {
      return null;
    }

    return notice;
  },

  update: async (
    id: string,
    updates: Partial<NoticeCandidate>,
  ): Promise<Notice | null> => {
    const { rows: existingRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [id]);
    if (existingRows.length === 0) return null;

    const current = mapRowToNotice(existingRows[0]);
    if (current.status === 'archived') {
      throw new InvalidNoticeStateTransitionError('Archived notices cannot be modified');
    }

    // Merge and validate
    const candidateToValidate: NoticeCandidate = {
      title: updates.title !== undefined ? updates.title : current.title,
      summary: updates.summary !== undefined ? updates.summary : current.summary,
      category: updates.category !== undefined ? updates.category : current.category,
      priority: updates.priority !== undefined ? updates.priority : current.priority,
      audience: updates.audience !== undefined ? updates.audience : current.audience || undefined,
      importantDates: updates.importantDates !== undefined ? updates.importantDates : current.importantDates,
      actionRequired: updates.actionRequired !== undefined ? updates.actionRequired : current.actionRequired || undefined,
      venue: updates.venue !== undefined ? updates.venue : current.venue || undefined,
      links: updates.links !== undefined ? updates.links : current.links,
      documents: updates.documents !== undefined ? updates.documents : current.documents,
      source: {
        provider: 'gmail',
        messageId: current.sourceMessageId || '',
        sender: current.sourceSender || '',
        subject: current.sourceSubject || '',
      },
    };

    const validated = validateNoticeCandidate(candidateToValidate, candidateToValidate.source);

    const query = `
      UPDATE notices
      SET
        title = $1,
        summary = $2,
        category = $3,
        priority = $4,
        audience = $5,
        important_dates = $6,
        action_required = $7,
        venue = $8,
        links = $9,
        documents = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `;

    const values = [
      validated.title,
      validated.summary,
      validated.category,
      validated.priority,
      validated.audience || null,
      JSON.stringify(validated.importantDates || []),
      validated.actionRequired || null,
      validated.venue || null,
      JSON.stringify(validated.links || []),
      JSON.stringify(validated.documents || []),
      id,
    ];

    const { rows } = await pool.query(query, values);
    return mapRowToNotice(rows[0]);
  },

  transitionStatus: async (id: string, targetStatus: NoticeStatus): Promise<Notice> => {
    const { rows: existingRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [id]);
    if (existingRows.length === 0) {
      throw new NoticeNotFoundError();
    }

    const current = mapRowToNotice(existingRows[0]);
    const allowed = ALLOWED_TRANSITIONS[current.status] || [];

    if (!allowed.includes(targetStatus)) {
      throw new InvalidNoticeStateTransitionError(
        `Cannot transition notice from '${current.status}' to '${targetStatus}'. Allowed: ${allowed.join(', ') || 'none (terminal)'}`,
      );
    }

    let query: string;
    let values: unknown[];

    if (targetStatus === 'published') {
      query = `
        UPDATE notices
        SET status = $1, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      values = [targetStatus, id];
    } else {
      query = `
        UPDATE notices
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      values = [targetStatus, id];
    }

    const { rows } = await pool.query(query, values);
    const updatedNotice = mapRowToNotice(rows[0]);

    if (targetStatus === 'published') {
      try {
        await notificationsService.notifyNoticePublished(updatedNotice);
      } catch (err) {
        console.error('Failed to create published notice notification:', err);
      }
    }

    return updatedNotice;
  },


  approve: async (id: string): Promise<Notice> => {
    return noticesService.transitionStatus(id, 'approved');
  },

  publish: async (id: string): Promise<Notice> => {
    return noticesService.transitionStatus(id, 'published');
  },

  reject: async (id: string): Promise<Notice> => {
    return noticesService.transitionStatus(id, 'rejected');
  },

  archive: async (id: string): Promise<Notice> => {
    return noticesService.transitionStatus(id, 'archived');
  },

  delete: async (id: string): Promise<boolean> => {
    // 1. Fetch notice before deletion to extract suppression metadata
    const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE id = $1', [id]);
    if (noticeRows.length === 0) {
      return false;
    }
    const notice = noticeRows[0];
    const dates = (notice.important_dates as Array<{ label: string; date: string }>) || [];
    const eventDate = dates.length > 0 ? dates[0].date : null;
    const fingerprint = generateNoticeFingerprint(
      notice.title,
      eventDate,
      notice.venue,
      notice.source_sender,
    );

    // 2. Persist suppression record
    try {
      if (notice.source_account_email && notice.source_message_id) {
        await pool.query(
          `
          INSERT INTO notice_suppressions (id, source_account_email, source_message_id, normalized_fingerprint, suppressed_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (source_account_email, source_message_id) DO UPDATE SET
            normalized_fingerprint = EXCLUDED.normalized_fingerprint,
            suppressed_at = CURRENT_TIMESTAMP
          `,
          [randomUUID(), notice.source_account_email, notice.source_message_id, fingerprint],
        );
      } else {
        await pool.query(
          `
          INSERT INTO notice_suppressions (id, source_account_email, source_message_id, normalized_fingerprint, suppressed_at)
          VALUES ($1, 'manual', $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (source_account_email, source_message_id) DO NOTHING
          `,
          [randomUUID(), id, fingerprint],
        );
      }
    } catch (suppressErr) {
      console.error('Failed to record notice suppression:', suppressErr);
    }

    // 3. Delete referencing notifications
    try {
      await pool.query('DELETE FROM notifications WHERE notice_id = $1', [id]);
    } catch {
      // Ignore if notifications table doesn't have the record
    }

    // 4. Delete notice row from PostgreSQL
    const { rowCount } = await pool.query('DELETE FROM notices WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },



  createFromGmailMessage: async (userId: string, messageId: string): Promise<Notice> => {
    const { rows: connRows } = await pool.query(
      `
      SELECT id, google_email, access_token, refresh_token, expiry_date
      FROM gmail_connections
      WHERE user_id = $1
      `,
      [userId],
    );

    if (connRows.length === 0) {
      throw new GmailNotConnectedError('Gmail account is not connected');
    }

    const conn = connRows[0];

    // Pre-check duplicate under connected Gmail account
    const { rows: existingRows } = await pool.query(
      `
      SELECT id FROM notices
      WHERE source_account_email = $1 AND source_message_id = $2
      LIMIT 1
      `,
      [conn.google_email, messageId],
    );

    if (existingRows.length > 0) {
      throw new DuplicateNoticeError(
        'Notice for this Gmail message already exists in the connected account',
        existingRows[0].id,
      );
    }

    const gmail = createAuthenticatedGmailClient({
      accessToken: conn.access_token,
      refreshToken: conn.refresh_token,
      expiryDate: conn.expiry_date,
    });

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const messageDetails = parseGmailMessageDetails(response.data, messageId);
    const structuredMessage = toStructuredGmailMessage(messageDetails);
    const candidate = await noticeAnalyzerService.analyze(structuredMessage);

    return noticesService.createFromCandidate(userId, candidate, {
      connectionId: conn.id,
      accountEmail: conn.google_email,
    });
  },

  convertToTask: async (
    userId: string,
    noticeId: string,
    customData?: {
      title?: string;
      dueDate?: string;
      dueTime?: string | null;
      reminder?: string | null;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      courseId?: string | null;
    },
  ): Promise<{ task: Assignment; notice: Notice; alreadyConverted: boolean }> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch notice FOR UPDATE to ensure isolation and prevent race conditions
      const { rows: noticeRows } = await client.query(
        'SELECT * FROM notices WHERE id = $1 FOR UPDATE',
        [noticeId],
      );

      if (noticeRows.length === 0) {
        throw new NoticeNotFoundError('Notice not found');
      }

      const rawNotice = noticeRows[0];
      const notice = mapRowToNotice(rawNotice);

      // 2. Authorization: student can convert their own notice OR an official published campus notice
      const isOwner = notice.createdByUserId === userId;
      const isCampusNotice =
        notice.status === 'published' &&
        (isReviewerUserId(notice.createdByUserId) ||
          notice.createdByUserId === 'admin' ||
          notice.createdByUserId.startsWith('reviewer') ||
          !notice.sourceAccountEmail);

      if (!isOwner && !isCampusNotice) {
        throw new UnauthorizedNoticeAccessError(
          "You cannot convert another student's notice to a task",
        );
      }

      // 3. Check if already converted for this user (prevent duplicate tasks)
      if (rawNotice.is_converted && rawNotice.converted_to_task_id) {
        const { rows: existingTaskRows } = await client.query(
          'SELECT * FROM assignments WHERE id = $1 AND user_id = $2 LIMIT 1',
          [rawNotice.converted_to_task_id, userId],
        );
        if (existingTaskRows.length > 0) {
          await client.query('COMMIT');
          return {
            task: mapRowToAssignment(existingTaskRows[0]),
            notice,
            alreadyConverted: true,
          };
        }
      }

      // Check if assignment exists by provenance (source = 'notice' and source_id = noticeId)
      const { rows: existingBySource } = await client.query(
        'SELECT * FROM assignments WHERE user_id = $1 AND source = $2 AND source_id = $3 LIMIT 1',
        [userId, 'notice', noticeId],
      );
      if (existingBySource.length > 0) {
        await client.query(
          'UPDATE notices SET is_converted = TRUE, converted_to_task_id = $1, converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [existingBySource[0].id, noticeId],
        );
        await client.query('COMMIT');
        return {
          task: mapRowToAssignment(existingBySource[0]),
          notice: { ...notice, isConverted: true, convertedToTaskId: existingBySource[0].id },
          alreadyConverted: true,
        };
      }

      // 4. Extract deadline without fabricating data
      let dueDate = customData?.dueDate || '';
      if (!dueDate && notice.importantDates && notice.importantDates.length > 0) {
        const deadlineDate = notice.importantDates.find((d) => {
          const lbl = (d.label || '').toLowerCase();
          return (
            lbl.includes('deadline') ||
            lbl.includes('due') ||
            lbl.includes('last date') ||
            lbl.includes('submission')
          );
        });

        if (deadlineDate?.date) {
          const parsed = parseNaturalDate(deadlineDate.date);
          dueDate = parsed?.isoDate || deadlineDate.date;
        }
      }

      const title = (customData?.title || notice.title).trim();
      const description = notice.summary || '';
      const priority =
        customData?.priority ||
        (notice.priority === 'urgent'
          ? 'urgent'
          : notice.priority === 'important'
          ? 'high'
          : 'medium');
      const dueTime = customData?.dueTime || null;
      const reminder = customData?.reminder || (dueDate ? '1d_before' : null);
      const courseId = customData?.courseId || null;

      const taskId = randomUUID();

      // 5. Insert Task into assignments table
      const insertQuery = `
        INSERT INTO assignments (
          id, user_id, course_id, title, description, due_date, status,
          due_time, reminder, priority, source, source_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, 'notice', $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING *
      `;
      const { rows: insertedTaskRows } = await client.query(insertQuery, [
        taskId,
        userId,
        courseId,
        title,
        description,
        dueDate,
        dueTime,
        reminder,
        priority,
        notice.id,
      ]);

      // 6. Record conversion on Notice
      const updateNoticeQuery = `
        UPDATE notices
        SET is_converted = TRUE, converted_to_task_id = $1, converted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      const { rows: updatedNoticeRows } = await client.query(updateNoticeQuery, [taskId, notice.id]);

      await client.query('COMMIT');

      return {
        task: mapRowToAssignment(insertedTaskRows[0]),
        notice: mapRowToNotice(updatedNoticeRows[0]),
        alreadyConverted: false,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
