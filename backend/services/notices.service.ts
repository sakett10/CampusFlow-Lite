import type { PoolClient } from 'pg';
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
import { mapRowToAssignment, assignmentsService } from './assignments.service.js';
import { parseNaturalDate } from './deadlineParser.service.js';
import { isReviewerUserId } from '../middleware/requireAuth.js';

export const SYSTEM_INSTITUTIONAL_USER_ID = 'admin';

export class UnauthorizedNoticeAccessError extends Error {
  constructor(message = 'Notice not found or access denied') {
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

  const excludedPatterns = [
    'fresher - certificate verification',
    'certificate verification',
    'certificate of physical fitness',
    'physical fitness certificate',
    'missing 12th mark list',
    'pending document upload',
    'provisional admission letter required',
    'candidate [',
    'candidate verification',
    'personal document verification',
    'upload missing',
  ];

  for (const pattern of excludedPatterns) {
    if (title.includes(pattern) || summary.includes(pattern)) {
      return true;
    }
  }

  if (audience.includes('individual') || audience.includes('private')) {
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

const mapRowToNotice = (row: Record<string, unknown>, userId?: string): Notice => {
  const hasUserConversion = row.user_converted_task_id !== undefined;
  const isConverted = hasUserConversion
    ? Boolean(row.user_converted_task_id)
    : (userId ? (row.created_by_user_id === userId && Boolean(row.is_converted)) : Boolean(row.is_converted));
  const convertedToTaskId = hasUserConversion
    ? (row.user_converted_task_id as string) || null
    : (userId ? (row.created_by_user_id === userId ? (row.converted_to_task_id as string) : null) : (row.converted_to_task_id as string) || null);
  const convertedAt = hasUserConversion
    ? (row.user_converted_at ? new Date(row.user_converted_at as string).toISOString() : null)
    : (row.converted_at ? new Date(row.converted_at as string).toISOString() : null);

  return {
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
    sourceType: (row.source_type as 'institutional' | 'gmail_personal') || (row.source_provider === 'gmail' || row.source_message_id ? 'gmail_personal' : 'institutional'),
    status: row.status as NoticeStatus,
    isConverted,
    convertedToTaskId,
    convertedAt,
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : new Date().toISOString(),
    publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null,
    sourceReceivedAt: row.source_received_at
      ? new Date(row.source_received_at as string).toISOString()
      : row.created_at
      ? new Date(row.created_at as string).toISOString()
      : null,
  };
};

export function isPersonalAccountEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (lower.includes('student.')) return true;
  if (
    lower.endsWith('@gmail.com') ||
    lower.endsWith('@googlemail.com') ||
    lower.endsWith('@yahoo.com') ||
    lower.endsWith('@outlook.com') ||
    lower.endsWith('@hotmail.com') ||
    lower.endsWith('@icloud.com')
  ) {
    return true;
  }
  return false;
}

/**
 * Validates and converts a YYYY-MM month parameter into an exclusive date range.
 * Examples:
 *   '2026-09' -> { start: '2026-09-01 00:00:00', end: '2026-10-01 00:00:00' }
 *   '2026-12' -> { start: '2026-12-01 00:00:00', end: '2027-01-01 00:00:00' }
 *
 * Rejects malformed values: '2026', '09-2026', '2026-9', 'abc', '2026-13', '2026-00'.
 */
export function parseMonthRange(monthStr: unknown): { start: string; end: string } | null {
  if (typeof monthStr !== 'string') return null;
  const match = monthStr.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  const startYear = year;
  const startMonth = String(month).padStart(2, '0');
  const start = `${startYear}-${startMonth}-01 00:00:00`;

  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`;

  return { start, end };
}

export interface NoticeFilters {
  isReviewer: boolean;
  userId?: string;
  status?: NoticeStatus;
  category?: NoticeCategory;
  priority?: NoticePriority;
  search?: string;
  monthRange?: { start: string; end: string };
}

export const noticesService = {
  createFromCandidate: async (
    userId: string,
    candidate: NoticeCandidate,
    sourceMeta?: {
      connectionId?: string;
      accountEmail?: string;
      initialStatus?: NoticeStatus;
      sourceReceivedAt?: string | null;
      sourceType?: 'institutional' | 'gmail_personal';
    },
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
    const accountEmail = sourceMeta?.accountEmail || (validated.source?.sender ? validated.source.sender : null);
    const isPersonalAccount = isPersonalAccountEmail(accountEmail);
    const isCreatorReviewer =
      isReviewerUserId(userId) ||
      (process.env.NODE_ENV !== 'production' &&
        (userId.startsWith('reviewer') || userId.startsWith('admin')));
    const sourceType: 'institutional' | 'gmail_personal' =
      sourceMeta?.sourceType ||
      (isCreatorReviewer && !isPersonalAccount ? 'institutional' : 'gmail_personal');

    if (sourceType === 'gmail_personal') {
      if (!userId || !userId.trim()) {
        throw new Error('Personal notices require an immutable owner userId');
      }
    }

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

    // 3. Check user-scoped duplicate by messageId for personal notices, or account-scoped for institutional
    if (validated.source.messageId) {
      const { rows: existingRows } = await pool.query(
        `
        SELECT id FROM notices
        WHERE created_by_user_id = $1 AND source_message_id = $2
        LIMIT 1
        `,
        [userId, validated.source.messageId],
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
        source_type,
        status,
        published_at,
        source_received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
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
      sourceType,
      status,
      isPublished ? (sourceReceivedAt || new Date().toISOString()) : null,
      sourceReceivedAt,
    ];

    const { rows } = await pool.query(query, values);
    const notice = mapRowToNotice(rows[0]);

    if (isPublished && sourceType === 'institutional') {
      const isCampusNotice =
        isReviewerUserId(userId) ||
        (process.env.NODE_ENV !== 'production' && userId === 'admin');
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

    const isNonProd = process.env.NODE_ENV !== 'production';
    const reviewerIds = (process.env.REVIEWER_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const authorizedReviewers = Array.from(new Set([SYSTEM_INSTITUTIONAL_USER_ID, ...reviewerIds, ...adminIds]));
    const reviewerPrefixCheck = isNonProd
      ? "(notices.created_by_user_id LIKE 'reviewer%' OR notices.created_by_user_id LIKE 'admin%')"
      : "FALSE";

    // Strict tenant isolation:
    // 1. Personal Gmail data (source_type = 'gmail_personal') MUST ONLY EVER be accessible to its exact creator (created_by_user_id = $userId).
    //    ADMIN_USER_IDS / REVIEWER_USER_IDS must NEVER grant access to another user's gmail_personal notices.
    // 2. Institutional notices (source_type = 'institutional') are visible according to reviewer/institutional rules:
    //    - Reviewers can view all institutional notices (or filtered by status).
    //    - Students can only view published institutional notices.
    if (filters.userId) {
      if (!filters.isReviewer) {
        // Regular student:
        // - Personal: only their own
        // - Institutional: only published ones from authorized reviewers
        if (filters.status) {
          conditions.push(`(
            (notices.source_type = 'gmail_personal' AND notices.created_by_user_id = $${idx} AND notices.status = $${idx + 1})
            OR
            (notices.source_type = 'institutional' AND notices.status = 'published' AND notices.status = $${idx + 1} AND (
              notices.created_by_user_id = ANY($${idx + 2}::text[]) OR ${reviewerPrefixCheck}
            ))
          )`);
          values.push(filters.userId, filters.status, authorizedReviewers);
          idx += 3;
        } else {
          conditions.push(`(
            (notices.source_type = 'gmail_personal' AND notices.created_by_user_id = $${idx})
            OR
            (notices.source_type = 'institutional' AND notices.status = 'published' AND (
              notices.created_by_user_id = ANY($${idx + 1}::text[]) OR ${reviewerPrefixCheck}
            ))
          )`);
          values.push(filters.userId, authorizedReviewers);
          idx += 2;
        }
      } else {
        // Reviewer/admin:
        // - Personal: ONLY their own gmail_personal notices (never another user's!)
        // - Institutional: all institutional notices from authorized reviewers
        if (filters.status) {
          conditions.push(`(
            (notices.source_type = 'gmail_personal' AND notices.created_by_user_id = $${idx} AND notices.status = $${idx + 1})
            OR
            (notices.source_type = 'institutional' AND notices.status = $${idx + 1} AND (
              notices.created_by_user_id = ANY($${idx + 2}::text[]) OR ${reviewerPrefixCheck}
            ))
          )`);
          values.push(filters.userId, filters.status, authorizedReviewers);
          idx += 3;
        } else {
          conditions.push(`(
            (notices.source_type = 'gmail_personal' AND notices.created_by_user_id = $${idx})
            OR
            (notices.source_type = 'institutional' AND (
              notices.created_by_user_id = ANY($${idx + 1}::text[]) OR ${reviewerPrefixCheck}
            ))
          )`);
          values.push(filters.userId, authorizedReviewers);
          idx += 2;
        }
      }
    } else {
      // Unauthenticated (or institutional-only query without user context):
      // Only published institutional notices, NEVER any personal notices
      conditions.push(`(
        notices.source_type = 'institutional' AND notices.status = 'published' AND (
          notices.created_by_user_id = ANY($${idx}::text[]) OR ${reviewerPrefixCheck}
        )
      )`);
      values.push(authorizedReviewers);
      idx++;
      if (filters.status) {
        conditions.push(`notices.status = $${idx++}`);
        values.push(filters.status);
      }
    }

    if (filters.category) {
      conditions.push(`notices.category = $${idx++}`);
      values.push(filters.category);
    }

    if (filters.priority) {
      conditions.push(`notices.priority = $${idx++}`);
      values.push(filters.priority);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        `(notices.title ILIKE $${idx} OR notices.summary ILIKE $${idx} OR notices.venue ILIKE $${idx} OR notices.audience ILIKE $${idx})`,
      );
      values.push(term);
      idx++;
    }

    // Month-scoped notice filtering:
    // We filter on COALESCE(notices.source_received_at, notices.published_at, notices.created_at)
    // because this is the canonical chronology timestamp used for ordering notices in CampusFlow-Lite:
    // 1. source_received_at for Gmail-synced notices
    // 2. published_at for official published circulars
    // 3. created_at as immutable fallback
    // The filter is applied with parameterized SQL >= start AND < end (exclusive boundary).
    if (filters.monthRange) {
      conditions.push(
        `COALESCE(notices.source_received_at, notices.published_at, notices.created_at) >= $${idx++} AND COALESCE(notices.source_received_at, notices.published_at, notices.created_at) < $${idx++}`,
      );
      values.push(filters.monthRange.start, filters.monthRange.end);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    let query: string;
    if (filters.userId) {
      query = `
        SELECT notices.*,
               a.id AS user_converted_task_id,
               a.created_at AS user_converted_at
        FROM notices
        LEFT JOIN assignments a
          ON a.user_id = $${idx}
         AND a.source = 'notice'
         AND a.source_id = notices.id::text
        ${whereClause}
        ORDER BY COALESCE(notices.source_received_at, notices.published_at, notices.created_at) DESC, notices.created_at DESC
      `;
      values.push(filters.userId);
    } else {
      query = `
        SELECT notices.*,
               NULL AS user_converted_task_id,
               NULL AS user_converted_at
        FROM notices
        ${whereClause}
        ORDER BY COALESCE(notices.source_received_at, notices.published_at, notices.created_at) DESC, notices.created_at DESC
      `;
    }

    const { rows } = await pool.query(query, values);
    return rows.map((r) => mapRowToNotice(r, filters.userId));
  },

  getById: async (
    id: string,
    isReviewer: boolean,
    userId?: string,
    client?: PoolClient,
  ): Promise<Notice | null> => {
    let query: string;
    let values: unknown[];

    if (userId) {
      query = `
        SELECT notices.*,
               a.id AS user_converted_task_id,
               a.created_at AS user_converted_at
        FROM notices
        LEFT JOIN assignments a
          ON a.user_id = $2
         AND a.source = 'notice'
         AND a.source_id = notices.id::text
        WHERE notices.id::text = $1
      `;
      values = [id, userId];
    } else {
      query = 'SELECT * FROM notices WHERE id::text = $1';
      values = [id];
    }

    const db = client || pool;
    const { rows } = await db.query(query, values);
    if (rows.length === 0) return null;

    const notice = mapRowToNotice(rows[0], userId);
    const isNonProd = process.env.NODE_ENV !== 'production';
    const isOwner = Boolean(userId && notice.createdByUserId === userId);

    // Strict account isolation:
    // If personal Gmail notice: ONLY the exact owner can access.
    // Reviewers/admins CANNOT bypass personal ownership!
    if (notice.sourceType === 'gmail_personal') {
      if (!isOwner) {
        return null;
      }
      return notice;
    }

    // Institutional notice authorization:
    const isCampusNotice =
      notice.createdByUserId === SYSTEM_INSTITUTIONAL_USER_ID ||
      isReviewerUserId(notice.createdByUserId) ||
      (isNonProd &&
        (notice.createdByUserId.startsWith('reviewer') ||
          notice.createdByUserId.startsWith('admin')));

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

      // 1. Lock source notice row with FOR UPDATE
      const { rows: noticeRows } = await client.query(
        'SELECT * FROM notices WHERE id::text = $1 FOR UPDATE',
        [noticeId],
      );

      if (noticeRows.length === 0) {
        throw new NoticeNotFoundError('Notice not found');
      }

      const rawNotice = noticeRows[0];
      const isNonProd = process.env.NODE_ENV !== 'production';
      const isOwner = Boolean(rawNotice.created_by_user_id === userId);

      const isPersonalNotice = rawNotice.source_type === 'gmail_personal';
      const isCampusNotice =
        rawNotice.source_type === 'institutional' &&
        (rawNotice.created_by_user_id === SYSTEM_INSTITUTIONAL_USER_ID ||
          isReviewerUserId(rawNotice.created_by_user_id) ||
          (isNonProd &&
            (rawNotice.created_by_user_id.startsWith('reviewer') ||
              rawNotice.created_by_user_id.startsWith('admin'))));

      // Strict tenant isolation:
      // If personal Gmail notice: ONLY the owner can convert it to a task.
      // Reviewers/admins CANNOT convert another user's personal notice!
      if (isPersonalNotice) {
        if (!isOwner) {
          throw new UnauthorizedNoticeAccessError(
            "You cannot convert another student's notice to a task",
          );
        }
      } else {
        // 2. Verify source notice is accessible to the authenticated user
        if (!isOwner && !isCampusNotice) {
          throw new UnauthorizedNoticeAccessError(
            "You cannot convert another student's notice to a task",
          );
        }

        if (rawNotice.status === 'archived' || (!isOwner && rawNotice.status !== 'published')) {
          throw new UnauthorizedNoticeAccessError(
            'Notice is archived or cannot be converted to a task',
          );
        }
      }

      // 3. Check per-user duplicate conversion using the same transaction client
      const { rows: existingBySource } = await client.query(
        'SELECT * FROM assignments WHERE user_id = $1 AND source = $2 AND source_id = $3 LIMIT 1',
        [userId, 'notice', noticeId],
      );

      if (existingBySource.length > 0) {
        const existingTask = mapRowToAssignment(existingBySource[0]);
        await client.query('COMMIT');
        return {
          task: existingTask,
          notice: {
            ...mapRowToNotice(rawNotice, userId),
            isConverted: true,
            convertedToTaskId: existingTask.id,
            convertedAt: existingTask.createdAt || null,
          },
          alreadyConverted: true,
        };
      }

      // 4. Extract deadline without fabricating data
      let dueDate = customData?.dueDate || '';
      const importantDates =
        (rawNotice.important_dates as Array<{ label: string; date: string }>) || [];
      if (!dueDate && importantDates.length > 0) {
        const deadlineDate = importantDates.find((d) => {
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

      const title = (customData?.title || rawNotice.title).trim();
      const description = rawNotice.summary || '';
      const priority =
        customData?.priority ||
        (rawNotice.priority === 'urgent'
          ? 'urgent'
          : rawNotice.priority === 'important'
          ? 'high'
          : 'medium');
      const dueTime = customData?.dueTime || null;
      const reminder = customData?.reminder || (dueDate ? '1d_before' : null);
      const courseId = customData?.courseId || null;

      // 5. Create the assignment using the same transaction client
      const task = await assignmentsService.add(
        userId,
        {
          title,
          description,
          dueDate,
          dueTime,
          reminder,
          priority,
          status: 'PENDING',
          courseId,
          source: 'notice',
          sourceId: rawNotice.id,
        },
        client,
      );

      // 6. Perform notice metadata update ONLY for genuinely user-owned/private notices
      // Shared institutional notices must NEVER be mutated with an individual user's task ID
      if (isOwner && !isCampusNotice) {
        const updateRes = await client.query(
          `UPDATE notices
           SET is_converted = TRUE, converted_to_task_id = $1, converted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND created_by_user_id = $3`,
          [task.id, rawNotice.id, userId],
        );

        if (updateRes.rowCount !== 1) {
          throw new Error(
            `Notice conversion update failed: expected 1 row affected, got ${updateRes.rowCount}`,
          );
        }
      }

      // 7. COMMIT
      await client.query('COMMIT');

      const responseNotice: Notice = {
        ...mapRowToNotice(rawNotice, userId),
        isConverted: true,
        convertedToTaskId: task.id,
        convertedAt: new Date().toISOString(),
      };

      return {
        task,
        notice: responseNotice,
        alreadyConverted: false,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure if connection was severed
      }
      throw err;
    } finally {
      client.release();
    }
  },

  getBySourceMessageId: async (
    userId: string,
    accountEmail: string,
    messageId: string,
  ): Promise<Notice | null> => {
    const { rows } = await pool.query(
      `SELECT * FROM notices 
       WHERE created_by_user_id = $1 AND source_account_email = $2 AND source_message_id = $3 
       LIMIT 1`,
      [userId, accountEmail, messageId],
    );
    if (rows.length === 0) return null;
    return mapRowToNotice(rows[0], userId);
  },
};
