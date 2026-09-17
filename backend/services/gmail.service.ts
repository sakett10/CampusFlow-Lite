import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { isServerlessEnvironment } from '../config.js';
import type { GmailSyncStats, StructuredGmailMessage, NoticeCandidate, NoticeCategory, NoticePriority, CampusEmail } from '../types.js';

import { noticeAnalyzerService, extractHeuristicCandidate } from './noticeAnalyzer.service.js';
import {
  noticesService,
  DuplicateNoticeError,
  NoticeSuppressedError,
  isPersonalOrNonNotice,
  isNoticeSuppressed,
  generateNoticeFingerprint,
  isPersonalAccountEmail,
} from './notices.service.js';
import { NoticeValidationError, validateNoticeCandidate } from './noticeValidator.js';
import { notificationsService } from './notifications.service.js';
import { campusEmailsService } from './campusEmails.service.js';
import { isReviewerUserId } from '../middleware/requireAuth.js';
import { encryptToken, decryptToken } from './crypto.service.js';
import { classifyEmail } from './emailClassifier.service.js';
import { extractDeadlineAndTask } from './deadlineParser.service.js';
import { isStudentInstitutionSender } from '../config/institutions.js';
import {
  getObjectStorageDriver,
  sanitizeAttachmentFilename,
  generateStorageKey,
  normalizeAttachmentMimeType,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_NOTICE,
} from './objectStorage.service.js';
import { attachmentsService } from './attachments.service.js';
import type { SupportedAttachmentMimeType } from '../types.js';

export function getOAuthCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) are not configured.',
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function getStateSecret(): string {
  const stateSecret = process.env.GMAIL_OAUTH_STATE_SECRET;
  if (!stateSecret) {
    throw new Error('GMAIL_OAUTH_STATE_SECRET is not configured.');
  }
  return stateSecret;
}

export function createOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  const { clientId, clientSecret, redirectUri } = getOAuthCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Proxied client that lazily reads credentials when methods are invoked
export const gmailOAuth2Client = new Proxy({} as InstanceType<typeof google.auth.OAuth2>, {
  get(_target, prop, receiver) {
    const client = createOAuth2Client();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export const createOAuthState = (userId: string): string => {
  return jwt.sign(
    { userId },
    getStateSecret(),
    {
      expiresIn: '10m',
    },
  );
};

export const verifyOAuthState = (state: string): { userId: string } => {
  const payload = jwt.verify(state, getStateSecret());

  if (
    typeof payload === 'string' ||
    !payload.userId ||
    typeof payload.userId !== 'string'
  ) {
    throw new Error('Invalid OAuth state');
  }

  return {
    userId: payload.userId,
  };
};

export const getGoogleAuthUrl = (state: string): string => {
  return gmailOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
  });
};

export interface StoredOAuthTokens {
  accessToken?: string | null;
  access_token?: string | null;
  refreshToken?: string | null;
  refresh_token?: string | null;
  expiryDate?: number | string | null;
  expiry_date?: number | string | null;
}

export const createAuthenticatedGmailClient = (
  tokens: StoredOAuthTokens,
  onTokensRefreshed?: (newTokens: { access_token?: string | null; expiry_date?: number | null }) => Promise<void>,
) => {
  const rawAccess = tokens.accessToken || tokens.access_token;
  const rawRefresh = tokens.refreshToken || tokens.refresh_token;
  const rawExpiry = tokens.expiryDate ?? tokens.expiry_date;
  const expiryDate = rawExpiry != null ? Number(rawExpiry) : undefined;

  if (!rawAccess || !rawRefresh) {
    throw new Error(
      'Access token and refresh token are required to create an authenticated Gmail client',
    );
  }

  const { text: accessToken } = decryptToken(rawAccess);
  const { text: refreshToken } = decryptToken(rawRefresh);
  const { clientId, clientSecret, redirectUri } = getOAuthCredentials();

  const authClient = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
  );

  authClient.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate,
  });

  if (onTokensRefreshed && typeof (authClient as unknown as { on?: unknown }).on === 'function') {
    (authClient as unknown as { on: (event: string, cb: (tokens: unknown) => void) => void }).on('tokens', (newTokens: unknown) => {
      onTokensRefreshed(newTokens as { access_token?: string | null; expiry_date?: number | null }).catch((err) => {
        console.error('Failed to update refreshed tokens:', err);
      });
    });
  }

  return google.gmail({
    version: 'v1',
    auth: authClient,
  });
};

export interface SafeGmailMessageDetail {
  id: string;
  threadId: string | null;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  bodyText: string;
  internalDate?: string;
}

export function getHeaderValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  if (!headers || !Array.isArray(headers)) return '';
  const header = headers.find(
    (h) => h?.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || '';
}

function decodeBase64Url(data: string): string {
  try {
    return Buffer.from(data, 'base64url').toString('utf8');
  } catch {
    try {
      return Buffer.from(
        data.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8');
    } catch {
      return '';
    }
  }
}

export interface MessagePartLike {
  partId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  body?: {
    data?: string | null;
    attachmentId?: string | null;
    size?: number | null;
  } | null;
  parts?: MessagePartLike[] | null;
}

function findPartText(part: MessagePartLike, targetMimeType: string): string | null {
  if (part.mimeType === targetMimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.parts && part.parts.length > 0) {
    for (const subPart of part.parts) {
      const result = findPartText(subPart, targetMimeType);
      if (result !== null) {
        return result;
      }
    }
  }

  return null;
}

export function extractMessageBodyText(payload?: MessagePartLike | null): string {
  if (!payload) {
    return '';
  }

  // Search for text/plain first
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      const plainText = findPartText(part, 'text/plain');
      if (plainText !== null && plainText.trim().length > 0) {
        return plainText;
      }
    }

    // Fallback to text/html if plain text was not found
    for (const part of payload.parts) {
      const htmlText = findPartText(part, 'text/html');
      if (htmlText !== null && htmlText.trim().length > 0) {
        return htmlText;
      }
    }
  }

  // If top-level payload body data exists (even if mimeType is undefined/other)
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return '';
}

export function parseGmailMessageDetails(
  message: {
    id?: string | null;
    threadId?: string | null;
    internalDate?: string | null;
    snippet?: string | null;
    payload?: MessagePartLike & {
      headers?: Array<{ name?: string | null; value?: string | null }> | null;
    } | null;
  },
  fallbackId = '',
): SafeGmailMessageDetail {
  const headers = message.payload?.headers || undefined;
  const from = getHeaderValue(headers, 'from');
  const to = getHeaderValue(headers, 'to');
  const subject = getHeaderValue(headers, 'subject');
  const rawDateHeader = getHeaderValue(headers, 'date');

  let date = rawDateHeader || '';
  if (!date && message.internalDate) {
    const epochMs = Number(message.internalDate);
    if (!Number.isNaN(epochMs) && epochMs > 0) {
      date = new Date(epochMs).toISOString();
    }
  }

  const snippet = message.snippet || '';
  const extractedBody = extractMessageBodyText(message.payload);
  const bodyText = extractedBody.trim().length > 0 ? extractedBody : snippet;

  const result: SafeGmailMessageDetail = {
    id: message.id || fallbackId,
    threadId: message.threadId ?? null,
    from,
    to,
    subject,
    date,
    snippet,
    body: bodyText,
    bodyText,
  };

  if (message.internalDate) {
    result.internalDate = message.internalDate;
  }

  return result;
}

export function extractSupportedAttachmentParts(payload?: MessagePartLike | null): Array<{
  filename: string;
  mimeType: SupportedAttachmentMimeType;
  attachmentId?: string | null;
  data?: string | null;
  sizeBytes?: number | null;
}> {
  if (!payload) return [];
  const results: Array<{
    filename: string;
    mimeType: SupportedAttachmentMimeType;
    attachmentId?: string | null;
    data?: string | null;
    sizeBytes?: number | null;
  }> = [];

  function traverse(part: MessagePartLike) {
    if (part.filename && typeof part.filename === 'string' && part.filename.trim().length > 0) {
      const normalizedMime = normalizeAttachmentMimeType(part.mimeType || '');
      if (normalizedMime) {
        results.push({
          filename: part.filename.trim(),
          mimeType: normalizedMime,
          attachmentId: part.body?.attachmentId || null,
          data: part.body?.data || null,
          sizeBytes: part.body?.size || null,
        });
      }
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        traverse(subPart);
      }
    }
  }

  traverse(payload);
  return results.slice(0, MAX_ATTACHMENTS_PER_NOTICE);
}

/**
 * Downloads and persists attachments to private object storage and notice_attachments table.
 * Strictly called AFTER notice creation succeeds. Failures are isolated and do NOT abort notice creation.
 */
export async function processNoticeAttachments(
  gmail: ReturnType<typeof google.gmail>,
  userId: string,
  noticeId: string,
  messageId: string,
  payload?: MessagePartLike | null,
): Promise<void> {
  const supportedParts = extractSupportedAttachmentParts(payload);
  if (supportedParts.length === 0) return;

  for (const part of supportedParts) {
    try {
      if (part.sizeBytes && part.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
        console.warn(`Attachment ${part.filename} exceeds 10MB limit, skipping.`);
        continue;
      }

      let buffer: Buffer | null = null;
      if (part.data) {
        buffer = Buffer.from(part.data, 'base64url');
      } else if (part.attachmentId) {
        const attRes = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId,
          id: part.attachmentId,
        });
        const rawData = attRes.data?.data;
        if (rawData) {
          buffer = Buffer.from(rawData, 'base64url');
        }
      }

      if (!buffer || buffer.length === 0) {
        continue;
      }

      if (buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
        console.warn(`Attachment ${part.filename} size exceeds 10MB limit, skipping.`);
        continue;
      }

      const safeFilename = sanitizeAttachmentFilename(part.filename);
      const storageKey = generateStorageKey(noticeId, safeFilename);

      const driver = getObjectStorageDriver();
      await driver.put(storageKey, buffer, part.mimeType);

      try {
        await attachmentsService.createAttachmentRecord({
          noticeId,
          userId,
          filename: safeFilename,
          mimeType: part.mimeType,
          sizeBytes: buffer.length,
          storageKey,
          gmailMessageId: messageId,
          gmailAttachmentId: part.attachmentId || null,
        });
      } catch (dbErr) {
        try {
          await driver.delete(storageKey);
        } catch (cleanupErr) {
          console.warn(`Failed to clean up orphaned storage object ${storageKey}:`, cleanupErr);
        }
        throw dbErr;
      }
    } catch (attErr) {
      console.warn(
        `Failed to store attachment ${part.filename} for notice ${noticeId}:`,
        attErr instanceof Error ? attErr.message : String(attErr),
      );
    }
  }
}

export class GmailNotConnectedError extends Error {
  constructor(message = 'Gmail account is not connected') {
    super(message);
    this.name = 'GmailNotConnectedError';
  }
}

export const isGmailMessageProcessed = async (
  userId: string,
  gmailMessageId: string,
): Promise<boolean> => {
  const { rows } = await pool.query(
    'SELECT 1 FROM processed_gmail_messages WHERE user_id = $1 AND gmail_message_id = $2 LIMIT 1',
    [userId, gmailMessageId],
  );
  return rows.length > 0;
};

export const markGmailMessageAsProcessed = async (
  userId: string,
  gmailMessageId: string,
): Promise<void> => {
  await pool.query(
    `
    INSERT INTO processed_gmail_messages (
      id,
      user_id,
      gmail_message_id
    )
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, gmail_message_id)
    DO NOTHING
    `,
    [randomUUID(), userId, gmailMessageId],
  );
};

export const toStructuredGmailMessage = (
  detail: SafeGmailMessageDetail,
): StructuredGmailMessage => ({
  id: detail.id,
  threadId: detail.threadId,
  sender: detail.from,
  recipient: detail.to,
  subject: detail.subject,
  date: detail.date,
  snippet: detail.snippet,
  bodyText: detail.bodyText,
  sourceMessageId: detail.id,
});

export async function reclassifyExistingCampusEmails(userId: string): Promise<{
  reclassifiedCount: number;
  tasksGenerated: number;
  ignoredCount: number;
}> {
  const emails = await campusEmailsService.getAllForUser(userId);
  let reclassifiedCount = 0;
  const tasksGenerated = 0;
  let ignoredCount = 0;

  for (const email of emails) {
    const classification = classifyEmail({
      sender: email.senderEmail,
      subject: email.subject,
      bodyText: email.bodyText,
      snippet: email.snippet,
    });

    if (!classification.isCampusRelevant) {
      // Only discard high-confidence personal/promotional mail; 'uncertain' emails are kept
      // so the second-stage analyzer can make the final campus-relevance decision.
      await campusEmailsService.deleteBySourceMessageId(userId, email.sourceMessageId);
      ignoredCount++;
      await markGmailMessageAsProcessed(userId, email.sourceMessageId);
      // Remove any assignments mistakenly created from personal email
      await pool.query(
        'DELETE FROM assignments WHERE user_id = $1 AND source_id = $2 AND source = $3',
        [userId, email.sourceMessageId, 'gmail'],
      );
    } else {
      reclassifiedCount++;
      let candidateObj: NoticeCandidate | null = null;
      if (email.analysisStatus === 'failed' || email.analysisStatus === 'pending') {
        const structuredMsg: StructuredGmailMessage = {
          id: email.sourceMessageId,
          sourceMessageId: email.sourceMessageId,
          threadId: email.sourceThreadId ?? null,
          sender: email.senderEmail || '',
          recipient: '',
          subject: email.subject || '',
          date: email.receivedAt || '',
          bodyText: email.bodyText || email.snippet || '',
          snippet: email.snippet || '',
        };
        let isDefinitiveRejection = false;
        try {
          candidateObj = await noticeAnalyzerService.analyze(structuredMsg);
        } catch (aiErr) {
          if (aiErr instanceof NoticeValidationError) {
            isDefinitiveRejection = true;
          } else {
            try {
              const rawCandidate = extractHeuristicCandidate(structuredMsg);
              candidateObj = validateNoticeCandidate(rawCandidate, {
                provider: 'gmail',
                messageId: email.sourceMessageId,
                sender: email.senderEmail || '',
                subject: email.subject || '',
              });
            } catch {
              // Heuristic validation also failed to establish notice structure
              isDefinitiveRejection = true;
            }
          }
        }

        if (candidateObj) {
          await campusEmailsService.updateAnalysisSuccess(
            userId,
            email.sourceAccountEmail,
            email.sourceMessageId,
            candidateObj,
          );
          await markGmailMessageAsProcessed(userId, email.sourceMessageId);
        } else if (classification.outcome === 'uncertain' && isDefinitiveRejection) {
          // Privacy: Ambiguous email definitively rejected by notice analysis. Purge from campus_emails.
          await campusEmailsService.deleteBySourceMessageId(userId, email.sourceMessageId);
          ignoredCount++;
          await markGmailMessageAsProcessed(userId, email.sourceMessageId);
          await pool.query(
            'DELETE FROM assignments WHERE user_id = $1 AND source_id = $2 AND source = $3',
            [userId, email.sourceMessageId, 'gmail'],
          );
          continue;
        } else {
          await campusEmailsService.updateAnalysisFailure(
            userId,
            email.sourceAccountEmail,
            email.sourceMessageId,
            'Reclassification analysis failed',
          );
        }
      }

      // Check for deadline / actionable task
      let candidateToUse: NoticeCandidate | null = candidateObj;
      if (!candidateToUse && email.analysisStatus === 'completed') {
        candidateToUse = {
          title: email.subject || 'Campus Notice',
          summary: email.summary || '',
          category: (email.category as NoticeCategory) || 'academic',
          priority: (email.importance === 'urgent' ? 'urgent' : email.importance === 'high' ? 'important' : email.importance === 'low' ? 'low' : 'normal') as NoticePriority,
          actionRequired: email.importantActions?.[0] || undefined,
          importantDates: email.deadline ? [{ label: 'Deadline', date: email.deadline }] : (email.eventDate ? [{ label: 'Event Date', date: email.eventDate }] : []),
          source: {
            provider: 'gmail',
            messageId: email.sourceMessageId,
            sender: email.senderEmail || '',
            subject: email.subject || '',
          },
        };
      }

      if (candidateToUse) {
        try {
          const isPersonalAccount = isPersonalAccountEmail(email.sourceAccountEmail);
          const isCreatorReviewer = isReviewerUserId(userId);
          const syncSourceType: 'institutional' | 'gmail_personal' =
            (!isPersonalAccount && isCreatorReviewer) ? 'institutional' : 'gmail_personal';

          await noticesService.createFromCandidate(userId, candidateToUse, {
            accountEmail: email.sourceAccountEmail,
            initialStatus: 'published',
            sourceType: syncSourceType,
          });
        } catch {
          // Notice may already exist or suppressed
        }
        await markGmailMessageAsProcessed(userId, email.sourceMessageId);
      }
    }
  }

  return { reclassifiedCount, tasksGenerated, ignoredCount };
}

/**
 * Derives a deterministic pair of 32-bit signed integers from a userId for PostgreSQL
 * 2-key advisory locking: pg_try_advisory_lock(int4, int4) / pg_advisory_lock(int4, int4).
 * This ensures deterministic, collision-resistant, parameterized lock identification across
 * multiple server/Vercel instances without string concatenation in SQL.
 */
export function deriveAdvisoryLockKeys(userId: string): [number, number] {
  const hash = createHash('sha256').update(userId).digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

/**
 * Attempts to acquire an advisory lock for a user on a dedicated connection.
 * If nonBlocking is true, uses pg_try_advisory_lock (returns false immediately if already locked).
 * If nonBlocking is false, uses pg_advisory_lock (waits until acquired).
 */
export async function acquireUserAdvisoryLock(
  client: PoolClient,
  userId: string,
  nonBlocking = false,
): Promise<boolean> {
  const [k1, k2] = deriveAdvisoryLockKeys(userId);
  if (nonBlocking) {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS locked',
      [k1, k2],
    );
    return Boolean(rows[0]?.locked);
  }
  await client.query('SELECT pg_advisory_lock($1, $2)', [k1, k2]);
  return true;
}

/**
 * Releases the session-scoped advisory lock for a user on a dedicated connection.
 */
export async function releaseUserAdvisoryLock(client: PoolClient, userId: string): Promise<boolean> {
  const [k1, k2] = deriveAdvisoryLockKeys(userId);
  try {
    const { rows } = await client.query<{ unlocked: boolean }>(
      'SELECT pg_advisory_unlock($1, $2) AS unlocked',
      [k1, k2],
    );
    return Boolean(rows[0]?.unlocked);
  } catch (err) {
    console.warn(`Failed to unlock advisory lock for user ${userId}:`, err);
    return false;
  }
}

export function getHistoricalSyncQuery(days = 90): string {
  const envDays = process.env.GMAIL_HISTORICAL_SYNC_DAYS ? parseInt(process.env.GMAIL_HISTORICAL_SYNC_DAYS, 10) : NaN;
  const syncDays = !Number.isNaN(envDays) && envDays > 0 ? envDays : days;
  const cutoffDate = new Date(Date.now() - syncDays * 24 * 60 * 60 * 1000);
  const yyyy = cutoffDate.getFullYear();
  const mm = String(cutoffDate.getMonth() + 1).padStart(2, '0');
  const dd = String(cutoffDate.getDate()).padStart(2, '0');
  return `after:${yyyy}/${mm}/${dd}`;
}

export const MAX_RECOVERY_COUNT = 50;

export function getRecoverySyncQuery(days = 14): string {
  const envDays = process.env.GMAIL_RECOVERY_DAYS ? parseInt(process.env.GMAIL_RECOVERY_DAYS, 10) : NaN;
  const syncDays = Math.min(Math.max(!Number.isNaN(envDays) && envDays > 0 ? envDays : days, 1), 30);
  const cutoffDate = new Date(Date.now() - syncDays * 24 * 60 * 60 * 1000);
  const yyyy = cutoffDate.getFullYear();
  const mm = String(cutoffDate.getMonth() + 1).padStart(2, '0');
  const dd = String(cutoffDate.getDate()).padStart(2, '0');
  return `after:${yyyy}/${mm}/${dd}`;
}

export interface GmailSyncOptions {
  query?: string;
  syncHistorical?: boolean;
  recoverHistorical?: boolean;
  recoveryDays?: number;
  maxRecoveryCount?: number;
  deadlineMs?: number;
  maxExecutionTimeMs?: number;
}

export interface GmailRecoveryOptions {
  recoveryDays?: number;
  maxCount?: number;
}

export interface GmailRecoveryStats {
  evaluatedCount: number;
  recoveredCount: number;
  skippedCount: number;
  noticesCreated: number;
  tasksGenerated: number;
  rejectedByClassifier: number;
  rejectedByAnalyzer: number;
}

// Local in-memory set kept as a lightweight single-process optimization
export function campusEmailToCandidate(email: CampusEmail): NoticeCandidate {
  const dates: Array<{ label: string; date: string }> = [];
  if (email.eventDate) {
    dates.push({ label: 'Event Date', date: email.eventDate });
  }
  if (email.deadline) {
    dates.push({ label: 'Deadline', date: email.deadline });
  }

  const validCategory = ['academic', 'administrative', 'event', 'club', 'career', 'exam', 'general'].includes(email.category || '')
    ? (email.category as NoticeCategory)
    : 'general';

  const validPriority: NoticePriority =
    email.importance === 'urgent'
      ? 'urgent'
      : email.importance === 'important' || email.importance === 'high'
      ? 'important'
      : email.importance === 'low'
      ? 'low'
      : 'normal';

  const title = (email.subject && email.subject.trim().length >= 3) ? email.subject.trim() : 'Campus Notice';
  const summary = (email.summary && email.summary.trim().length >= 5)
    ? email.summary.trim()
    : (email.snippet && email.snippet.trim().length >= 5)
    ? email.snippet.trim()
    : `${title} - University notice`;

  return {
    title,
    summary,
    category: validCategory,
    priority: validPriority,
    audience: email.audience || undefined,
    importantDates: dates,
    actionRequired: email.importantActions && email.importantActions.length > 0 ? email.importantActions[0] : undefined,
    venue: email.venue || undefined,
    links: email.links || [],
    documents: email.documents || [],
    source: {
      provider: 'gmail',
      messageId: email.sourceMessageId,
      sender: email.senderEmail || email.senderName || 'University',
      subject: email.subject || title,
      receivedAt: email.receivedAt || undefined,
    },
    isCampusWide: true,
  };
}

export async function recoverHistoricalGmailMessages(
  userId: string,
  options?: GmailRecoveryOptions,
): Promise<GmailRecoveryStats> {
  const stats: GmailRecoveryStats = {
    evaluatedCount: 0,
    recoveredCount: 0,
    skippedCount: 0,
    noticesCreated: 0,
    tasksGenerated: 0,
    rejectedByClassifier: 0,
    rejectedByAnalyzer: 0,
  };

  const { rows } = await pool.query(
    `
    SELECT id, google_email, access_token, refresh_token, expiry_date
    FROM gmail_connections
    WHERE user_id = $1
    `,
    [userId],
  );

  if (rows.length === 0) {
    throw new GmailNotConnectedError('Gmail account is not connected');
  }

  const conn = rows[0];
  const { text: decryptedAccessToken } = decryptToken(conn.access_token);
  const { text: decryptedRefreshToken } = decryptToken(conn.refresh_token);

  const gmail = createAuthenticatedGmailClient(
    {
      accessToken: decryptedAccessToken,
      refreshToken: decryptedRefreshToken,
      expiryDate: conn.expiry_date,
    },
    async (newTokens) => {
      if (newTokens.access_token) {
        await pool.query(
          `UPDATE gmail_connections SET access_token = $1, expiry_date = COALESCE($2, expiry_date), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [encryptToken(newTokens.access_token), newTokens.expiry_date ?? null, conn.id],
        );
      }
    },
  );

  const isAuthorizedReviewer = isReviewerUserId(userId);
  const rawDays = options?.recoveryDays;
  const recoveryDays = typeof rawDays === 'number' && rawDays > 0 ? rawDays : 14;
  const q = getRecoverySyncQuery(recoveryDays);
  const requestedMax = options?.maxCount || MAX_RECOVERY_COUNT;
  const boundedLimit = Math.min(Math.max(requestedMax, 1), MAX_RECOVERY_COUNT);

  // 1. Query Gmail API for the bounded date window first
  const listResponse = (await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: boundedLimit,
  })) as {
    data: {
      messages?: Array<{ id?: string | null }>;
    };
  };

  const candidateMessages = (listResponse.data.messages || []).slice(0, boundedLimit);

  for (const rawMsg of candidateMessages) {
    if (!rawMsg?.id || typeof rawMsg.id !== 'string') continue;
    const msgId = rawMsg.id;
    stats.evaluatedCount++;

    // Check if notice already exists for this user and message
    const existingNotice = await noticesService.getBySourceMessageId(userId, conn.google_email, msgId);
    if (existingNotice) {
      stats.skippedCount++;
      continue;
    }

    // Check if email already exists in campus_emails for this user
    const existingEmail = await campusEmailsService.getBySourceMessageId(userId, conn.google_email, msgId);
    if (existingEmail && existingEmail.analysisStatus === 'completed') {
      const candidate = campusEmailToCandidate(existingEmail);
      if (candidate.isCampusWide === false || isPersonalOrNonNotice(candidate)) {
        stats.skippedCount++;
        continue;
      }

      const dates = candidate.importantDates || [];
      const eventDate = dates.length > 0 ? dates[0].date : null;
      const fingerprint = generateNoticeFingerprint(
        candidate.title,
        eventDate,
        candidate.venue,
        candidate.source?.sender,
      );

      const suppressed = await isNoticeSuppressed(conn.google_email, msgId, fingerprint);
      if (suppressed) {
        stats.skippedCount++;
        continue;
      }

      try {
        const isPersonalAccount = isPersonalAccountEmail(conn.google_email);
        const isStudentSender = isStudentInstitutionSender(candidate.source?.sender || '');
        const isInstitutionalBroadcast = isAuthorizedReviewer && !isPersonalAccount && !isStudentSender;
        const syncSourceType: 'institutional' | 'gmail_personal' =
          isInstitutionalBroadcast ? 'institutional' : 'gmail_personal';

        await noticesService.createFromCandidate(userId, candidate, {
          connectionId: conn.id,
          accountEmail: conn.google_email,
          initialStatus: 'published',
          sourceReceivedAt: existingEmail.receivedAt || null,
          sourceType: syncSourceType,
        });
        stats.noticesCreated++;
        stats.recoveredCount++;
      } catch {
        // Duplicate or suppressed
      }
      continue;
    }

    // Otherwise, fetch payload from Gmail API
    let messageResponse: { data: Parameters<typeof parseGmailMessageDetails>[0] };
    try {
      messageResponse = (await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      })) as { data: Parameters<typeof parseGmailMessageDetails>[0] };
    } catch {
      continue;
    }

    const parsedDetails = parseGmailMessageDetails(messageResponse.data, msgId);
    const classification = classifyEmail({
      sender: parsedDetails.from,
      subject: parsedDetails.subject,
      bodyText: parsedDetails.bodyText,
      snippet: parsedDetails.snippet,
    });

    if (!classification.isCampusRelevant) {
      stats.rejectedByClassifier++;
      continue;
    }

    const structuredMessage = toStructuredGmailMessage(parsedDetails);
    let candidate: NoticeCandidate | null;

    try {
      candidate = await noticeAnalyzerService.analyze(structuredMessage);
    } catch (aiErr) {
      if (aiErr instanceof NoticeValidationError) {
        stats.rejectedByAnalyzer++;
        continue;
      }
      try {
        const rawCandidate = extractHeuristicCandidate(structuredMessage);
        candidate = validateNoticeCandidate(rawCandidate, {
          provider: 'gmail',
          messageId: msgId,
          sender: parsedDetails.from || 'University',
          subject: parsedDetails.subject || 'Campus Notice',
        });
      } catch {
        stats.rejectedByAnalyzer++;
        continue;
      }
    }

    if (!candidate || isPersonalOrNonNotice(candidate)) {
      stats.rejectedByAnalyzer++;
      continue;
    }

    const authoritativeDate = parsedDetails.internalDate
      ? new Date(Number(parsedDetails.internalDate)).toISOString()
      : parsedDetails.date && !Number.isNaN(new Date(parsedDetails.date).getTime())
      ? new Date(parsedDetails.date).toISOString()
      : new Date().toISOString();

    await campusEmailsService.persistEmail({
      userId,
      sourceAccountEmail: conn.google_email,
      sourceMessageId: msgId,
      sourceThreadId: parsedDetails.threadId,
      senderEmail: parsedDetails.from,
      senderName: parsedDetails.from,
      subject: parsedDetails.subject,
      receivedAt: authoritativeDate,
      bodyText: parsedDetails.bodyText,
      snippet: parsedDetails.snippet,
    });

    await campusEmailsService.updateAnalysisSuccess(userId, conn.google_email, msgId, candidate);

    const taskInfo = extractDeadlineAndTask(candidate, parsedDetails);
    if (taskInfo.hasDeadline || candidate.actionRequired || taskInfo.dueDate) {
      stats.tasksGenerated++;
    }

    if (candidate.isCampusWide !== false) {
      const dates = candidate.importantDates || [];
      const eventDate = dates.length > 0 ? dates[0].date : null;
      const fingerprint = generateNoticeFingerprint(
        candidate.title,
        eventDate,
        candidate.venue,
        candidate.source?.sender,
      );

      const suppressed = await isNoticeSuppressed(conn.google_email, msgId, fingerprint);
      if (!suppressed) {
        try {
          const isPersonalAccount = isPersonalAccountEmail(conn.google_email);
          const isStudentSender = isStudentInstitutionSender(candidate.source?.sender || '');
          const isInstitutionalBroadcast = isAuthorizedReviewer && !isPersonalAccount && !isStudentSender;
          const syncSourceType: 'institutional' | 'gmail_personal' =
            isInstitutionalBroadcast ? 'institutional' : 'gmail_personal';

          const createdNotice = await noticesService.createFromCandidate(userId, candidate, {
            connectionId: conn.id,
            accountEmail: conn.google_email,
            initialStatus: 'published',
            sourceReceivedAt: authoritativeDate,
            sourceType: syncSourceType,
          });
          stats.noticesCreated++;
          stats.recoveredCount++;

          // Ingest supported attachments into private object storage & notice_attachments
          await processNoticeAttachments(
            gmail,
            userId,
            createdNotice.id,
            msgId,
            (messageResponse.data.payload as MessagePartLike) || undefined,
          );
        } catch {
          // Ignored if duplicate
        }
      }
    }

    await markGmailMessageAsProcessed(userId, msgId);
  }

  return stats;
}

const activeSyncUsers = new Set<string>();

export const syncGmailMessagesForUser = async (
  userId: string,
  batchSize = 15,
  isReviewer?: boolean,
  options?: GmailSyncOptions,
): Promise<GmailSyncStats> => {
  // Local fast-path optimization
  if (activeSyncUsers.has(userId)) {
    return {
      checked: 0,
      newMessages: 0,
      skipped: 0,
      processed: 0,
      failed: 0,
      emailsPersisted: 0,
      analysesFailed: 0,
      noticesCreated: 0,
      pendingNoticesCount: 0,
      relevantAcademicMessages: 0,
      ignoredMessages: 0,
      deadlineCandidatesGenerated: 0,
      tasksGenerated: 0,
      inProgress: true,
      message: 'Sync already in progress for this user',
    };
  }

  // Database-authoritative advisory lock acquisition on a dedicated connection
  const lockClient = await pool.connect();
  let lockAcquired = false;

  try {
    lockAcquired = await acquireUserAdvisoryLock(lockClient, userId, true);
    if (!lockAcquired) {
      return {
        checked: 0,
        newMessages: 0,
        skipped: 0,
        processed: 0,
        failed: 0,
        emailsPersisted: 0,
        analysesFailed: 0,
        noticesCreated: 0,
        pendingNoticesCount: 0,
        relevantAcademicMessages: 0,
        ignoredMessages: 0,
        deadlineCandidatesGenerated: 0,
        tasksGenerated: 0,
        inProgress: true,
        message: 'Sync already in progress for this user',
      };
    }

    activeSyncUsers.add(userId);

    const { rows } = await pool.query(
    `
    SELECT id, google_email, access_token, refresh_token, expiry_date
    FROM gmail_connections
    WHERE user_id = $1
    `,
    [userId],
  );

  if (rows.length === 0) {
    throw new GmailNotConnectedError('Gmail account is not connected');
  }

  const conn = rows[0];
  const { text: decryptedAccessToken, wasEncrypted: accessWasEncrypted } = decryptToken(conn.access_token);
  const { text: decryptedRefreshToken, wasEncrypted: refreshWasEncrypted } = decryptToken(conn.refresh_token);

  // Transparent migration: if either token was legacy plaintext, re-encrypt it now
  if (!accessWasEncrypted || !refreshWasEncrypted) {
    try {
      await pool.query(
        `UPDATE gmail_connections SET access_token = $1, refresh_token = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [encryptToken(decryptedAccessToken), encryptToken(decryptedRefreshToken), conn.id],
      );
    } catch (migErr) {
      console.error('Failed to re-encrypt legacy plaintext tokens:', migErr);
    }
  }

  const isAuthorizedReviewer = typeof isReviewer === 'boolean' ? isReviewer : isReviewerUserId(userId);

  const gmail = createAuthenticatedGmailClient(
    {
      accessToken: decryptedAccessToken,
      refreshToken: decryptedRefreshToken,
      expiryDate: conn.expiry_date,
    },
    async (newTokens) => {
      if (newTokens.access_token) {
        await pool.query(
          `UPDATE gmail_connections SET access_token = $1, expiry_date = COALESCE($2, expiry_date), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [encryptToken(newTokens.access_token), newTokens.expiry_date ?? null, conn.id],
        );
      }
    },
  );

  const startTime = Date.now();
  const isServerless = isServerlessEnvironment();
  // In serverless, default to 8000ms deadline to safely return before Vercel's default 10s timeout
  const timeoutBudgetMs = options?.maxExecutionTimeMs ?? (isServerless ? 8000 : 0);
  const effectiveDeadline = options?.deadlineMs ?? (timeoutBudgetMs > 0 ? startTime + timeoutBudgetMs : undefined);

  let interrupted = false;
  let interruptMessage: string | undefined = undefined;

  // Fetch messages with pagination support strictly bounded by batchSize / historical query
  const rawMessages: Array<{ id?: string | null; threadId?: string | null }> = [];
  let pageToken: string | undefined = undefined;
  const q = options?.query || (options?.syncHistorical ? getHistoricalSyncQuery() : undefined);
  const targetLimit = options?.syncHistorical ? Math.max(batchSize, 100) : batchSize;

  do {
    if (effectiveDeadline && Date.now() >= effectiveDeadline) {
      interrupted = true;
      interruptMessage = 'Sync paused to avoid serverless timeout; remaining messages will be processed on next sync';
      break;
    }
    const remaining = targetLimit - rawMessages.length;
    if (remaining <= 0) break;
    const pageSize = Math.min(remaining, 50);

    try {
      const listParams: {
        userId: string;
        maxResults: number;
        pageToken?: string;
        q?: string;
      } = {
        userId: 'me',
        maxResults: pageSize,
      };
      if (pageToken) listParams.pageToken = pageToken;
      if (q) listParams.q = q;

      const listResponse = (await gmail.users.messages.list(listParams)) as {
        data: {
          messages?: Array<{ id?: string | null; threadId?: string | null }>;
          nextPageToken?: string | null;
        };
      };

      const pageMessages = listResponse.data.messages || [];
      if (pageMessages.length === 0) break;
      rawMessages.push(...pageMessages);
      pageToken = listResponse.data.nextPageToken || undefined;
    } catch (apiErr: unknown) {
      const err = apiErr as { message?: string; code?: number; status?: number };
      if (err?.message?.includes('invalid_grant') || err?.code === 400 || err?.code === 401 || err?.status === 401) {
        throw new GmailNotConnectedError('Gmail credentials expired or access revoked by user. Please reconnect your account.');
      }
      throw apiErr;
    }
  } while (pageToken && rawMessages.length < targetLimit);

  let checked = 0;
  let newMessages = 0;
  let skipped = 0;
  let processed = 0;
  let failed = 0;
  let emailsPersisted = 0;
  let analysesFailed = 0;
  let noticesCreated = 0;
  let pendingNoticesCount = 0;
  let relevantAcademicMessages = 0;
  let ignoredMessages = 0;
  let deadlineCandidatesGenerated = 0;
  const tasksGenerated = 0;

  const maybeCreateNoticeFromExistingEmail = async (email: CampusEmail): Promise<boolean> => {
    const existingNotice = await noticesService.getBySourceMessageId(userId, conn.google_email, email.sourceMessageId);
    if (existingNotice) return false;

    const candidate = campusEmailToCandidate(email);
    if (candidate.isCampusWide === false || isPersonalOrNonNotice(candidate)) {
      return false;
    }

    const dates = candidate.importantDates || [];
    const eventDate = dates.length > 0 ? dates[0].date : null;
    const fingerprint = generateNoticeFingerprint(
      candidate.title,
      eventDate,
      candidate.venue,
      candidate.source.sender,
    );

    const suppressed = await isNoticeSuppressed(conn.google_email, email.sourceMessageId, fingerprint);
    if (suppressed) return false;

    try {
      const isPersonalAccount = isPersonalAccountEmail(conn.google_email);
      const isStudentSender = isStudentInstitutionSender(candidate.source?.sender || '');
      const isInstitutionalBroadcast = isAuthorizedReviewer && !isPersonalAccount && !isStudentSender;
      const syncSourceType: 'institutional' | 'gmail_personal' =
        isInstitutionalBroadcast ? 'institutional' : 'gmail_personal';

      const createdNotice = await noticesService.createFromCandidate(userId, candidate, {
        connectionId: conn.id,
        accountEmail: conn.google_email,
        initialStatus: 'published',
        sourceReceivedAt: email.receivedAt || null,
        sourceType: syncSourceType,
      });
      noticesCreated++;
      if (createdNotice.status === 'pending') {
        pendingNoticesCount++;
      }
      return true;
    } catch (noticeErr) {
      if (
        !(noticeErr instanceof DuplicateNoticeError) &&
        !(noticeErr instanceof NoticeSuppressedError) &&
        !(noticeErr instanceof NoticeValidationError)
      ) {
        console.error('Notice recovery creation error:', noticeErr);
      }
      return false;
    }
  };

  // Process messages in bounded chunks (concurrency: 5) to accelerate throughput
  // without exceeding Gmail API rate limits or overwhelming serverless connection pools
  const CHUNK_SIZE = 5;
  for (let i = 0; i < rawMessages.length; i += CHUNK_SIZE) {
    if (effectiveDeadline && Date.now() >= effectiveDeadline) {
      interrupted = true;
      interruptMessage = 'Sync paused to avoid serverless timeout; remaining messages will be processed on next sync';
      break;
    }

    const chunk = rawMessages.slice(i, i + CHUNK_SIZE);

    // Filter out messages that don't need network retrieval
    const pendingChunk: Array<{ id: string }> = [];

    for (const rawMsg of chunk) {
      if (!rawMsg || !rawMsg.id || typeof rawMsg.id !== 'string') {
        continue;
      }
      checked++;

      const alreadyProcessed = await isGmailMessageProcessed(userId, rawMsg.id);
      if (alreadyProcessed) {
        skipped++;
        continue;
      }

      // Check if email already exists in campus_emails for this user
      const existingEmail = await campusEmailsService.getBySourceMessageId(userId, conn.google_email, rawMsg.id);
      if (existingEmail && existingEmail.analysisStatus === 'completed') {
        await maybeCreateNoticeFromExistingEmail(existingEmail);
        await markGmailMessageAsProcessed(userId, rawMsg.id);
        skipped++;
        continue;
      }

      // If email previously failed analysis, enforce cooldown before retrying to prevent repeated AI quota-burning
      if (existingEmail && existingEmail.analysisStatus === 'failed') {
        const cooldownMs = Number(process.env.GMAIL_FAILED_RETRY_COOLDOWN_MS) || 30 * 60 * 1000;
        const lastAttempt = existingEmail.updatedAt ? new Date(existingEmail.updatedAt).getTime() : 0;
        if (Date.now() - lastAttempt < cooldownMs) {
          skipped++;
          continue;
        }
      }

      pendingChunk.push({ id: rawMsg.id });
    }

    if (pendingChunk.length === 0) {
      continue;
    }

    newMessages += pendingChunk.length;

    // Concurrently fetch message payloads for the chunk with per-message error isolation
    const fetchedResults = await Promise.all(
      pendingChunk.map(async (msg) => {
        try {
          const messageResponse = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });
          const parsed = parseGmailMessageDetails(messageResponse.data, msg.id);
          return {
            id: msg.id,
            details: parsed,
            payload: (messageResponse.data.payload as MessagePartLike) || undefined,
            error: null,
          };
        } catch (fetchErr) {
          console.error(
            `Failed to fetch Gmail message ${msg.id}:`,
            fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          );
          return { id: msg.id, details: null, payload: undefined, error: fetchErr };
        }
      }),
    );

    // Sequentially evaluate, persist, and publish to maintain deterministic DB ordering
    for (const result of fetchedResults) {
      if (effectiveDeadline && Date.now() >= effectiveDeadline) {
        interrupted = true;
        interruptMessage = 'Sync paused to avoid serverless timeout; remaining messages will be processed on next sync';
        break;
      }

      if (!result.details || result.error) {
        failed++;
        continue;
      }

      const parsedDetails = result.details;
      const msgId = result.id;

      try {
        // Stage 1 classification: evaluate with metadata + snippet (no full body)
        let classification = classifyEmail({
          from: parsedDetails.from,
          subject: parsedDetails.subject,
          snippet: parsedDetails.snippet,
        });

        // If Stage 1 is uncertain, evaluate with body text in Stage 2
        if (classification.outcome === 'uncertain') {
          classification = classifyEmail({
            from: parsedDetails.from,
            subject: parsedDetails.subject,
            snippet: parsedDetails.snippet,
            bodyText: parsedDetails.bodyText || parsedDetails.body || parsedDetails.snippet,
          });
        }

        // First-stage campus-relevance gate: high-confidence personal / promotional mail
        // is silently discarded (zero persistence).
        const shouldIgnore =
          !classification.isCampusRelevant ||
          classification.outcome === 'personal' ||
          classification.outcome === 'promotional';

        if (shouldIgnore) {
          // Personal Email Zero-Persistence:
          // Non-academic and personal emails are NEVER inserted into campus_emails.
          // Only mark as processed in processed_gmail_messages for deduplication.
          await markGmailMessageAsProcessed(userId, msgId);
          ignoredMessages++;
          processed++;
          continue;
        }

        const authoritativeDate = parsedDetails.internalDate
          ? new Date(Number(parsedDetails.internalDate)).toISOString()
          : parsedDetails.date && !Number.isNaN(new Date(parsedDetails.date).getTime())
          ? new Date(parsedDetails.date).toISOString()
          : new Date().toISOString();

        const structuredMessage = toStructuredGmailMessage(parsedDetails);
        let candidate: NoticeCandidate | null = null;
        let analysisSucceeded = false;

        if (classification.outcome === 'uncertain') {
          // Privacy Gate for Ambiguous / Uncertain Emails:
          // Do NOT persist to campus_emails before second-stage notice analysis establishes relevance.
          try {
            candidate = await noticeAnalyzerService.analyze(structuredMessage);
            analysisSucceeded = true;
          } catch (aiErr) {
            if (aiErr instanceof NoticeValidationError) {
              // Definitive rejection: not a campus notice. Discard with zero persistence.
              await markGmailMessageAsProcessed(userId, msgId);
              ignoredMessages++;
              processed++;
              continue;
            } else {
              // Transient AI error: engage deterministic heuristic fallback
              try {
                const rawHeuristic = extractHeuristicCandidate(structuredMessage);
                candidate = validateNoticeCandidate(rawHeuristic, {
                  provider: 'gmail',
                  messageId: msgId,
                  sender: parsedDetails.from || 'University',
                  subject: parsedDetails.subject || 'Campus Notice',
                });
                analysisSucceeded = true;
              } catch {
                // Heuristic fallback also failed to validate notice structure.
                // Ambiguous non-campus mail is discarded with zero persistence.
                await markGmailMessageAsProcessed(userId, msgId);
                ignoredMessages++;
                processed++;
                continue;
              }
            }
          }

          // If second-stage analyzer classified the candidate as personal, discard with zero persistence
          if (!candidate || candidate.isPersonal === true) {
            await markGmailMessageAsProcessed(userId, msgId);
            ignoredMessages++;
            processed++;
            continue;
          }

          // Relevance is established! Persist to campus_emails now.
          relevantAcademicMessages++;
          await campusEmailsService.persistEmail({
            userId,
            sourceAccountEmail: conn.google_email,
            sourceMessageId: msgId,
            sourceThreadId: parsedDetails.threadId,
            senderEmail: parsedDetails.from,
            senderName: parsedDetails.from,
            subject: parsedDetails.subject,
            receivedAt: authoritativeDate,
            bodyText: parsedDetails.body || parsedDetails.bodyText || parsedDetails.snippet,
            snippet: parsedDetails.snippet,
          });
          emailsPersisted++;

          await campusEmailsService.updateAnalysisSuccess(userId, conn.google_email, msgId, candidate);
        } else {
          // Confident campus email ('campus'): relevance already established at classification gate.
          relevantAcademicMessages++;
          await campusEmailsService.persistEmail({
            userId,
            sourceAccountEmail: conn.google_email,
            sourceMessageId: msgId,
            sourceThreadId: parsedDetails.threadId,
            senderEmail: parsedDetails.from,
            senderName: parsedDetails.from,
            subject: parsedDetails.subject,
            receivedAt: authoritativeDate,
            bodyText: parsedDetails.body || parsedDetails.bodyText || parsedDetails.snippet,
            snippet: parsedDetails.snippet,
          });
          emailsPersisted++;

          try {
            candidate = await noticeAnalyzerService.analyze(structuredMessage);
            analysisSucceeded = true;
          } catch (aiErr) {
            if (aiErr instanceof NoticeValidationError) {
              // Definitively non-notice academic email
              await campusEmailsService.updateAnalysisFailure(
                userId,
                conn.google_email,
                msgId,
                'Non-notice email',
              );
            } else {
              console.warn(
                `AI analysis failed for message ${msgId}, engaging deterministic heuristic fallback:`,
                aiErr instanceof Error ? aiErr.message : String(aiErr),
              );

              // Deterministic heuristic fallback using existing extractor & validator
              try {
                const rawHeuristic = extractHeuristicCandidate(structuredMessage);
                candidate = validateNoticeCandidate(rawHeuristic, {
                  provider: 'gmail',
                  messageId: msgId,
                  sender: parsedDetails.from || 'University',
                  subject: parsedDetails.subject || 'Campus Notice',
                });
                analysisSucceeded = true;
              } catch (heuristicErr) {
                console.error(
                  `Heuristic fallback also failed for message ${msgId}:`,
                  heuristicErr instanceof Error ? heuristicErr.message : String(heuristicErr),
                );
                await campusEmailsService.updateAnalysisFailure(
                  userId,
                  conn.google_email,
                  msgId,
                  aiErr instanceof Error ? aiErr.message : 'Analysis failed',
                );
                analysesFailed++;
                failed++;
                continue;
              }
            }
          }

          if (analysisSucceeded && candidate) {
            await campusEmailsService.updateAnalysisSuccess(userId, conn.google_email, msgId, candidate);
          }
        }

        if (analysisSucceeded && candidate) {
          // Track student deadline candidate (tasks are NOT auto-created on sync)
          const taskInfo = extractDeadlineAndTask(candidate, parsedDetails);
          if (taskInfo.hasDeadline || candidate.actionRequired || taskInfo.dueDate) {
            deadlineCandidatesGenerated++;
          }

          // Safe dual-visibility notice curation model
          if (candidate.isCampusWide !== false && !isPersonalOrNonNotice(candidate)) {
            const dates = candidate.importantDates || [];
            const eventDate = dates.length > 0 ? dates[0].date : null;
            const fingerprint = generateNoticeFingerprint(
              candidate.title,
              eventDate,
              candidate.venue,
              candidate.source?.sender,
            );

            const suppressed = await isNoticeSuppressed(conn.google_email, msgId, fingerprint);
            if (!suppressed) {
              try {
                const isPersonalAccount = isPersonalAccountEmail(conn.google_email);
                const isStudentSender = isStudentInstitutionSender(candidate.source?.sender || '');
                const isInstitutionalBroadcast = isAuthorizedReviewer && !isPersonalAccount && !isStudentSender;
                const syncSourceType: 'institutional' | 'gmail_personal' =
                  isInstitutionalBroadcast ? 'institutional' : 'gmail_personal';

                const createdNotice = await noticesService.createFromCandidate(userId, candidate, {
                  connectionId: conn.id,
                  accountEmail: conn.google_email,
                  initialStatus: 'published',
                  sourceReceivedAt: authoritativeDate,
                  sourceType: syncSourceType,
                });
                noticesCreated++;
                if (createdNotice.status === 'pending') {
                  pendingNoticesCount++;
                }

                // Ingest supported attachments into private object storage & notice_attachments
                await processNoticeAttachments(
                  gmail,
                  userId,
                  createdNotice.id,
                  msgId,
                  result.payload,
                );
              } catch (noticeErr) {
                if (
                  !(noticeErr instanceof DuplicateNoticeError) &&
                  !(noticeErr instanceof NoticeSuppressedError) &&
                  !(noticeErr instanceof NoticeValidationError)
                ) {
                  console.error('Notice creation error:', noticeErr);
                }
              }
            }
          }
        }

        await markGmailMessageAsProcessed(userId, msgId);
        processed++;
      } catch (msgErr) {
        console.error(
          'Gmail sync message processing failed:',
          msgErr instanceof Error ? msgErr.message : String(msgErr),
        );

        if (msgErr instanceof DuplicateNoticeError || msgErr instanceof NoticeValidationError) {
          await markGmailMessageAsProcessed(userId, msgId);
          processed++;
        } else {
          failed++;
        }
      }
    }
    if (interrupted) {
      break;
    }
  }

  // If new pending notices were generated, notify reviewers
  if (pendingNoticesCount > 0) {
    try {
      await notificationsService.notifyPendingReview(pendingNoticesCount);
    } catch (notifErr) {
      console.error('Failed to dispatch pending notice reviewer notification:', notifErr);
    }
  }

  let recoveryStats: GmailRecoveryStats | undefined = undefined;
  if (options?.recoverHistorical) {
    try {
      recoveryStats = await recoverHistoricalGmailMessages(userId, {
        recoveryDays: options.recoveryDays,
        maxCount: options.maxRecoveryCount,
      });
      noticesCreated += recoveryStats.noticesCreated;
    } catch (recErr) {
      console.error('Historical recovery error during sync:', recErr);
    }
  }

    return {
      checked,
      newMessages,
      skipped,
      processed,
      failed,
      emailsPersisted,
      analysesFailed,
      noticesCreated,
      pendingNoticesCount,
      relevantAcademicMessages,
      ignoredMessages,
      deadlineCandidatesGenerated,
      tasksGenerated,
      ...(recoveryStats ? { recoveredCount: recoveryStats.recoveredCount } : {}),
      ...(interrupted ? { interrupted: true, message: interruptMessage } : {}),
    };
  } finally {
    activeSyncUsers.delete(userId);
    if (lockAcquired) {
      await releaseUserAdvisoryLock(lockClient, userId);
    }
    lockClient.release();
  }
};

export interface DisconnectGmailResult {
  success: boolean;
  message: string;
  purged: boolean;
}

export async function disconnectGmailForUser(
  userId: string,
  options?: { purgeData?: boolean },
): Promise<DisconnectGmailResult> {
  const purgeData = options?.purgeData === true;

  // Dedicated connection to acquire and hold the PostgreSQL advisory lock across the entire disconnect
  const lockClient = await pool.connect();
  let lockAcquired = false;

  try {
    // Acquire the same advisory lock held during sync (blocking wait to coordinate safely across instances)
    await acquireUserAdvisoryLock(lockClient, userId, false);
    lockAcquired = true;

    // 1. Query the connection by authenticated userId under the advisory lock
    const { rows } = await lockClient.query(
      'SELECT access_token, refresh_token FROM gmail_connections WHERE user_id = $1',
      [userId],
    );

    if (rows.length > 0) {
      const rawRefreshToken = rows[0].refresh_token;
      const rawAccessToken = rows[0].access_token;

      let decryptedRefreshToken: string | null = null;
      let decryptedAccessToken: string | null = null;

      if (rawRefreshToken) {
        try {
          const res = decryptToken(rawRefreshToken);
          decryptedRefreshToken = res.text || null;
        } catch (err) {
          console.warn('Failed to decrypt refresh token for revocation:', err);
        }
      }

      if (rawAccessToken) {
        try {
          const res = decryptToken(rawAccessToken);
          decryptedAccessToken = res.text || null;
        } catch (err) {
          console.warn('Failed to decrypt access token for revocation:', err);
        }
      }

      // Prefer refresh_token, fall back to access_token
      const tokenToRevoke = decryptedRefreshToken || decryptedAccessToken;

      if (tokenToRevoke) {
        try {
          await gmailOAuth2Client.revokeToken(tokenToRevoke);
        } catch (revokeError) {
          // Revocation failure must not prevent local cleanup
          console.warn(
            'Google OAuth token revocation warning:',
            revokeError instanceof Error ? revokeError.message : revokeError,
          );
        }
      }
    }

    // 2. Perform local database cleanup in an atomic transaction
    try {
      await lockClient.query('BEGIN');

      await lockClient.query('DELETE FROM gmail_connections WHERE user_id = $1', [userId]);

      if (purgeData) {
        await lockClient.query('DELETE FROM campus_emails WHERE user_id = $1', [userId]);
        await lockClient.query('DELETE FROM processed_gmail_messages WHERE user_id = $1', [userId]);
      }

      await lockClient.query('COMMIT');
    } catch (dbError) {
      try {
        await lockClient.query('ROLLBACK');
      } catch {
        // Ignore rollback failure if connection was severed
      }
      throw dbError;
    }

    return {
      success: true,
      message: 'Gmail disconnected successfully',
      purged: purgeData,
    };
  } finally {
    if (lockAcquired) {
      await releaseUserAdvisoryLock(lockClient, userId);
    }
    lockClient.release();
  }
}