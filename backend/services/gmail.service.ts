import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { GmailSyncStats, StructuredGmailMessage } from '../types.js';

import { noticeAnalyzerService } from './noticeAnalyzer.service.js';
import {
  noticesService,
  DuplicateNoticeError,
  NoticeSuppressedError,
  isPersonalOrNonNotice,
  isNoticeSuppressed,
  generateNoticeFingerprint,
} from './notices.service.js';
import { NoticeValidationError } from './noticeValidator.js';
import { notificationsService } from './notifications.service.js';
import { campusEmailsService } from './campusEmails.service.js';
import { isReviewerUserId } from '../middleware/requireAuth.js';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;
const stateSecret = process.env.GMAIL_OAUTH_STATE_SECRET;

if (!clientId || !clientSecret || !redirectUri) {
  throw new Error(
    'Google OAuth environment variables are not configured.',
  );
}

if (!stateSecret) {
  throw new Error(
    'GMAIL_OAUTH_STATE_SECRET is not configured.',
  );
}

export const gmailOAuth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri,
);

export const createOAuthState = (userId: string): string => {
  return jwt.sign(
    { userId },
    stateSecret,
    {
      expiresIn: '10m',
    },
  );
};

export const verifyOAuthState = (state: string): { userId: string } => {
  const payload = jwt.verify(state, stateSecret);

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

export const createAuthenticatedGmailClient = (tokens: StoredOAuthTokens) => {
  const accessToken = tokens.accessToken || tokens.access_token;
  const refreshToken = tokens.refreshToken || tokens.refresh_token;
  const rawExpiry = tokens.expiryDate ?? tokens.expiry_date;
  const expiryDate = rawExpiry != null ? Number(rawExpiry) : undefined;

  if (!accessToken || !refreshToken) {
    throw new Error(
      'Access token and refresh token are required to create an authenticated Gmail client',
    );
  }

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

export function extractMessageBodyText(
  payload: MessagePartLike | undefined | null,
): string {
  if (!payload) return '';

  // 1. If top-level payload is text/plain with body data
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // 2. Recursive search helper for parts
  const findPartText = (
    part: MessagePartLike,
    targetMime: string,
  ): string | null => {
    if (part.mimeType === targetMime && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts && part.parts.length > 0) {
      for (const subPart of part.parts) {
        const text = findPartText(subPart, targetMime);
        if (text !== null && text.trim().length > 0) {
          return text;
        }
      }
    }
    return null;
  };

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
  const date = getHeaderValue(headers, 'date');
  const snippet = message.snippet || '';

  const extractedBody = extractMessageBodyText(message.payload);
  const bodyText = extractedBody.trim().length > 0 ? extractedBody : snippet;

  return {
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

export const syncGmailMessagesForUser = async (
  userId: string,
  batchSize = 30,
  isReviewer?: boolean,
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
  const isAuthorizedReviewer = typeof isReviewer === 'boolean' ? isReviewer : isReviewerUserId(userId);

  const gmail = createAuthenticatedGmailClient({
    accessToken: conn.access_token,
    refreshToken: conn.refresh_token,
    expiryDate: conn.expiry_date,
  });

  // Fetch messages with pagination support up to batchSize
  const rawMessages: Array<{ id?: string | null; threadId?: string | null }> = [];
  let pageToken: string | undefined = undefined;

  do {
    const pageSize = Math.min(batchSize - rawMessages.length, 50);
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: pageSize,
      pageToken,
    });

    const pageMessages = listResponse.data.messages || [];
    rawMessages.push(...pageMessages);
    pageToken = listResponse.data.nextPageToken || undefined;
  } while (pageToken && rawMessages.length < batchSize);

  let checked = 0;
  let newMessages = 0;
  let skipped = 0;
  let processed = 0;
  let failed = 0;
  let emailsPersisted = 0;
  let analysesFailed = 0;
  let noticesCreated = 0;
  let pendingNoticesCount = 0;

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

    // Check if email already exists in campus_emails with completed analysis
    const existingEmail = await campusEmailsService.getBySourceMessageId(conn.google_email, rawMsg.id);
    if (existingEmail && existingEmail.analysisStatus === 'completed') {
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

      // 1. Persist the raw parsed email into campus_emails FIRST
      await campusEmailsService.persistEmail({
        userId,
        sourceAccountEmail: conn.google_email,
        sourceMessageId: rawMsg.id,
        sourceThreadId: parsedDetails.threadId,
        senderEmail: parsedDetails.from,
        senderName: parsedDetails.from,
        subject: parsedDetails.subject,
        receivedAt: parsedDetails.date,
        bodyText: parsedDetails.body || parsedDetails.bodyText || parsedDetails.snippet,
        snippet: parsedDetails.snippet,
      });
      emailsPersisted++;

      // 2. Non-blocking AI analysis
      try {
        const structuredMessage = toStructuredGmailMessage(parsedDetails);
        const candidate = await noticeAnalyzerService.analyze(structuredMessage);
        await campusEmailsService.updateAnalysisSuccess(conn.google_email, rawMsg.id, candidate);

        // 3. Only create institutional campus notices if the syncing user is an authorized reviewer/admin
        if (isAuthorizedReviewer && !isPersonalOrNonNotice(candidate)) {
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
          // Valid non-notice email: keep email in campus_emails and record non-notice analysis status
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
        // Transient API network error: do not mark processed so it retries
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
  };
};