import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { GmailSyncStats, StructuredGmailMessage, NoticeCandidate, NoticeCategory, NoticePriority } from '../types.js';

import { noticeAnalyzerService, extractHeuristicCandidate } from './noticeAnalyzer.service.js';
import {
  noticesService,
  DuplicateNoticeError,
  NoticeSuppressedError,
  isPersonalOrNonNotice,
  isNoticeSuppressed,
  generateNoticeFingerprint,
} from './notices.service.js';
import { NoticeValidationError, validateNoticeCandidate } from './noticeValidator.js';
import { notificationsService } from './notifications.service.js';
import { campusEmailsService } from './campusEmails.service.js';
import { isReviewerUserId } from '../middleware/requireAuth.js';
import { encryptToken, decryptToken } from './crypto.service.js';
import { classifyEmail } from './emailClassifier.service.js';
import { extractDeadlineAndTask } from './deadlineParser.service.js';

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
  internalDate?: string | null;
  snippet: string;
  body: string;
  bodyText: string;
}

export function getHeaderValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  if (!headers || !Array.isArray(headers)) {
    return '';
  }
  const target = name.toLowerCase();
  const header = headers.find(
    (h) => h.name?.toLowerCase() === target,
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

interface MessagePartLike {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
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

    if (!classification.isAcademic) {
      if (email.analysisStatus !== 'ignored_personal') {
        await campusEmailsService.markIgnoredPersonal(
          email.sourceAccountEmail,
          email.sourceMessageId,
          classification.reason,
        );
        ignoredCount++;
      }
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
        const rawCandidate = extractHeuristicCandidate(structuredMsg);
        try {
          const validated = validateNoticeCandidate(rawCandidate, {
            provider: 'gmail',
            messageId: email.sourceMessageId,
            sender: email.senderEmail || '',
            subject: email.subject || '',
          });
          candidateObj = validated;
          await campusEmailsService.updateAnalysisSuccess(
            email.sourceAccountEmail,
            email.sourceMessageId,
            validated,
          );
        } catch (valErr) {
          console.warn('Validation error on reclassifying candidate:', valErr);
        }
      }

      // Check for deadline / actionable task
      const candidateToUse: NoticeCandidate = candidateObj || {
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

      try {
        await noticesService.createFromCandidate(userId, candidateToUse, {
          accountEmail: email.sourceAccountEmail,
          initialStatus: 'published',
        });
      } catch {
        // Notice may already exist or suppressed
      }
      await markGmailMessageAsProcessed(userId, email.sourceMessageId);
    }
  }

  return { reclassifiedCount, tasksGenerated, ignoredCount };
}

export interface GmailSyncOptions {
  query?: string;
  syncHistorical?: boolean;
}

export const syncGmailMessagesForUser = async (
  userId: string,
  batchSize = 30,
  isReviewer?: boolean,
  options?: GmailSyncOptions,
): Promise<GmailSyncStats> => {
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

  // Fetch messages with pagination support up to batchSize / historical query
  const rawMessages: Array<{ id?: string | null; threadId?: string | null }> = [];
  let pageToken: string | undefined = undefined;
  const q = options?.query || (options?.syncHistorical ? 'after:2026/07/31' : undefined);
  const maxFetchLimit = options?.syncHistorical ? 100 : Math.max(batchSize * 2, 50);

  do {
    const pageSize = Math.min(batchSize - rawMessages.length > 0 ? batchSize - rawMessages.length : batchSize, 50);
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
      rawMessages.push(...pageMessages);
      pageToken = listResponse.data.nextPageToken || undefined;
    } catch (apiErr: unknown) {
      const err = apiErr as { message?: string; code?: number; status?: number };
      if (err?.message?.includes('invalid_grant') || err?.code === 400 || err?.code === 401 || err?.status === 401) {
        throw new GmailNotConnectedError('Gmail credentials expired or access revoked by user. Please reconnect your account.');
      }
      throw apiErr;
    }
  } while (pageToken && rawMessages.length < maxFetchLimit);

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

  for (const rawMsg of rawMessages) {
    if (!rawMsg || !rawMsg.id || typeof rawMsg.id !== 'string') {
      continue;
    }
    checked++;

    const alreadyProcessed = await isGmailMessageProcessed(userId, rawMsg.id);
    if (alreadyProcessed) {
      skipped++;
      continue;
    }

    // Check if email already exists in campus_emails
    const existingEmail = await campusEmailsService.getBySourceMessageId(conn.google_email, rawMsg.id);
    if (existingEmail && (existingEmail.analysisStatus === 'completed' || existingEmail.analysisStatus === 'ignored_personal')) {
      await markGmailMessageAsProcessed(userId, rawMsg.id);
      skipped++;
      continue;
    }

    newMessages++;

    try {
      const messageResponse = await gmail.users.messages.get({
        userId: 'me',
        id: rawMsg.id,
        format: 'full',
      });

      const parsedDetails = parseGmailMessageDetails(messageResponse.data, rawMsg.id);
      const classification = classifyEmail(parsedDetails);

      // Filter out non-academic / personal / promotional emails
      const shouldIgnore = !isAuthorizedReviewer
        ? !classification.isAcademic
        : classification.isPromotionalOrNewsletter;

      const authoritativeDate = parsedDetails.internalDate
        ? new Date(Number(parsedDetails.internalDate)).toISOString()
        : parsedDetails.date && !Number.isNaN(new Date(parsedDetails.date).getTime())
        ? new Date(parsedDetails.date).toISOString()
        : new Date().toISOString();

      if (shouldIgnore) {
        await campusEmailsService.persistEmail({
          userId,
          sourceAccountEmail: conn.google_email,
          sourceMessageId: rawMsg.id,
          sourceThreadId: parsedDetails.threadId,
          senderEmail: parsedDetails.from,
          senderName: parsedDetails.from,
          subject: parsedDetails.subject,
          receivedAt: authoritativeDate,
          bodyText: parsedDetails.body || parsedDetails.bodyText || parsedDetails.snippet,
          snippet: parsedDetails.snippet,
        });
        await campusEmailsService.markIgnoredPersonal(
          conn.google_email,
          rawMsg.id,
          classification.reason,
        );
        await markGmailMessageAsProcessed(userId, rawMsg.id);
        ignoredMessages++;
        processed++;
        continue;
      }

      // Verified academic email!
      relevantAcademicMessages++;
      await campusEmailsService.persistEmail({
        userId,
        sourceAccountEmail: conn.google_email,
        sourceMessageId: rawMsg.id,
        sourceThreadId: parsedDetails.threadId,
        senderEmail: parsedDetails.from,
        senderName: parsedDetails.from,
        subject: parsedDetails.subject,
        receivedAt: authoritativeDate,
        bodyText: parsedDetails.body || parsedDetails.bodyText || parsedDetails.snippet,
        snippet: parsedDetails.snippet,
      });
      emailsPersisted++;

      // Non-blocking analysis
      try {
        const structuredMessage = toStructuredGmailMessage(parsedDetails);
        const candidate = await noticeAnalyzerService.analyze(structuredMessage);
        await campusEmailsService.updateAnalysisSuccess(conn.google_email, rawMsg.id, candidate);

        // Track student deadline candidate (tasks are NOT auto-created on sync)
        const taskInfo = extractDeadlineAndTask(candidate, parsedDetails);
        if (taskInfo.hasDeadline || candidate.actionRequired || taskInfo.dueDate) {
          deadlineCandidatesGenerated++;
        }

        // Institutional notices: Only if authorized reviewer/admin
        if (isAuthorizedReviewer && candidate.isCampusWide !== false && !isPersonalOrNonNotice(candidate)) {
          const dates = candidate.importantDates || [];
          const eventDate = dates.length > 0 ? dates[0].date : null;
          const fingerprint = generateNoticeFingerprint(
            candidate.title,
            eventDate,
            candidate.venue,
            candidate.source?.sender,
          );

          const suppressed = await isNoticeSuppressed(conn.google_email, rawMsg.id, fingerprint);
          if (!suppressed) {
            try {
              const createdNotice = await noticesService.createFromCandidate(userId, candidate, {
                connectionId: conn.id,
                accountEmail: conn.google_email,
                initialStatus: 'published',
                sourceReceivedAt: authoritativeDate,
              });
              noticesCreated++;
              if (createdNotice.status === 'pending') {
                pendingNoticesCount++;
              }
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
      } catch (analysisErr) {
        if (analysisErr instanceof NoticeValidationError) {
          await campusEmailsService.updateAnalysisFailure(
            conn.google_email,
            rawMsg.id,
            'Non-notice email',
          );
        } else {
          console.error(
            `AI analysis failed for message ${rawMsg.id}, but email remains stored:`,
            analysisErr instanceof Error ? analysisErr.message : String(analysisErr),
          );
          await campusEmailsService.updateAnalysisFailure(
            conn.google_email,
            rawMsg.id,
            analysisErr instanceof Error ? analysisErr.message : 'AI analysis failed',
          );
          analysesFailed++;
          failed++;
          continue;
        }
      }

      await markGmailMessageAsProcessed(userId, rawMsg.id);
      processed++;
    } catch (msgErr) {
      console.error(
        `Gmail fetch/persistence failed for message ${rawMsg.id}:`,
        msgErr instanceof Error ? msgErr.message : String(msgErr),
      );

      if (msgErr instanceof DuplicateNoticeError || msgErr instanceof NoticeValidationError) {
        await markGmailMessageAsProcessed(userId, rawMsg.id);
        processed++;
      } else {
        failed++;
      }
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
  };
};