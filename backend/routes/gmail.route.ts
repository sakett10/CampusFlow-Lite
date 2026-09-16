import { Router } from 'express';
import { getAuth } from '@clerk/express';
import { google } from 'googleapis';
import {
  gmailOAuth2Client,
  createOAuth2Client,
  getGoogleAuthUrl,
  createOAuthState,
  verifyOAuthState,
  createAuthenticatedGmailClient,
  parseGmailMessageDetails,
  toStructuredGmailMessage,
  syncGmailMessagesForUser,
  recoverHistoricalGmailMessages,
  disconnectGmailForUser,
  GmailNotConnectedError,
} from '../services/gmail.service.js';
import { noticeAnalyzerService } from '../services/noticeAnalyzer.service.js';
import { NoticeValidationError } from '../services/noticeValidator.js';
import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import { isReviewer, requireAuth } from '../middleware/requireAuth.js';
import { encryptToken } from '../services/crypto.service.js';
import {
  gmailSyncLimiter,
  gmailAnalyzeLimiter,
  gmailCallbackLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();

/**
 * Generate Google OAuth authorization URL
 * GET /api/gmail/auth-url
 */
router.get('/auth-url', requireAuth(), gmailCallbackLimiter, (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const state = createOAuthState(userId);
    const authUrl = getGoogleAuthUrl(state);

    return res.json({ url: authUrl });
  } catch (error) {
    console.error('Failed to generate Google auth URL:', error);
    return res.status(500).json({
      error: 'Google authentication is currently unavailable',
    });
  }
});

/**
 * Start Gmail OAuth (legacy browser redirect fallback)
 * GET /api/gmail/connect
 */
router.get('/connect', requireAuth(), gmailCallbackLimiter, (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const state = createOAuthState(userId);
    const authUrl = getGoogleAuthUrl(state);

    return res.redirect(authUrl);
  } catch (error) {
    console.error('Failed to initialize Google OAuth redirect:', error);
    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    return res.redirect(`${frontendBase}/settings?gmail_error=auth_init_failed`);
  }
});

/**
 * Disconnect Gmail integration and revoke tokens
 * POST /api/gmail/disconnect
 */
router.post('/disconnect', requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const purgeData = req.body?.purgeData === true;

  try {
    const result = await disconnectGmailForUser(userId, { purgeData });

    return res.json({
      success: true,
      message: 'Gmail disconnected successfully',
      purged: result.purged,
    });
  } catch (error) {
    console.error('Failed to disconnect Gmail:', error);
    return res.status(500).json({
      error: 'Failed to disconnect Gmail',
    });
  }
});

/**
 * Gmail OAuth callback
 * GET /api/gmail/callback
 */
router.get('/callback', gmailCallbackLimiter, async (req, res) => {
  const { code, state, error } = req.query;
  const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

  if (error) {
    console.warn('Google OAuth returned error param:', error);
    return res.redirect(`${frontendBase}/settings?gmail_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect(`${frontendBase}/settings?gmail_error=missing_code`);
  }

  if (!state || typeof state !== 'string') {
    return res.redirect(`${frontendBase}/settings?gmail_error=missing_state`);
  }

  let userId: string;

  try {
    ({ userId } = verifyOAuthState(state));
  } catch {
    return res.redirect(`${frontendBase}/settings?gmail_error=invalid_state`);
  }

  try {
    const { tokens } = await gmailOAuth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return res.redirect(`${frontendBase}/settings?gmail_error=missing_tokens`);
    }

    const authClient = createOAuth2Client();
    authClient.setCredentials(tokens);

    const gmail = google.gmail({
      version: 'v1',
      auth: authClient,
    });

    const profile = await gmail.users.getProfile({
      userId: 'me',
    });

    const googleEmail = profile.data.emailAddress;

    if (!googleEmail) {
      return res.redirect(`${frontendBase}/settings?gmail_error=no_email`);
    }

    await pool.query(
      `
      INSERT INTO gmail_connections (
        id,
        user_id,
        google_email,
        access_token,
        refresh_token,
        expiry_date
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id)
      DO UPDATE SET
        google_email = EXCLUDED.google_email,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expiry_date = EXCLUDED.expiry_date,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        randomUUID(),
        userId,
        googleEmail,
        encryptToken(tokens.access_token),
        encryptToken(tokens.refresh_token),
        tokens.expiry_date ?? null,
      ],
    );

    return res.redirect(
      `${frontendBase}/settings?gmail=connected`,
    );
  } catch (error) {
    console.error('Google OAuth callback failed:', error);

    return res.redirect(
      `${frontendBase}/settings?gmail_error=oauth_failed`,
    );
  }
});

/**
 * Gmail connection status
 * GET /api/gmail/status
 */
router.get('/status', requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT google_email, created_at, updated_at
      FROM gmail_connections
      WHERE user_id = $1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.json({
        connected: false,
      });
    }

    return res.json({
      connected: true,
      email: rows[0].google_email,
      connectedAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
    });
  } catch (error) {
    console.error('Failed to get Gmail status:', error);

    return res.status(500).json({
      error: 'Failed to get Gmail status',
    });
  }
});

/**
 * Retrieve Gmail messages metadata
 * GET /api/gmail/messages
 */
router.get('/messages', requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT access_token, refresh_token, expiry_date
      FROM gmail_connections
      WHERE user_id = $1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Gmail account is not connected',
      });
    }

    const { access_token, refresh_token, expiry_date } = rows[0];

    const gmail = createAuthenticatedGmailClient({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate: expiry_date,
    });

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
    });

    const rawMessages = response.data.messages || [];

    // No routine logging of message IDs or thread IDs to prevent PII leakage

    const formattedMessages = rawMessages
      .filter((m) => m && typeof m.id === 'string' && m.id.trim())
      .map((m) => ({
        id: m.id as string,
        threadId: m.threadId ?? null,
      }));

    return res.json({
      messages: formattedMessages,
      resultSizeEstimate: response.data.resultSizeEstimate ?? formattedMessages.length,
      nextPageToken: response.data.nextPageToken ?? null,
    });
  } catch (error) {
    console.error(
      'Failed to retrieve Gmail messages:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return res.status(500).json({
      error: 'Failed to retrieve Gmail messages',
    });
  }
});

/**
 * Retrieve Gmail message details
 * GET /api/gmail/messages/:messageId
 */
router.get('/messages/:messageId', requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const { messageId } = req.params;

  if (!messageId || typeof messageId !== 'string') {
    return res.status(400).json({
      error: 'Invalid message ID',
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT access_token, refresh_token, expiry_date
      FROM gmail_connections
      WHERE user_id = $1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Gmail account is not connected',
      });
    }

    const { access_token, refresh_token, expiry_date } = rows[0];

    const gmail = createAuthenticatedGmailClient({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate: expiry_date,
    });

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    // No routine logging of message IDs or thread IDs

    const messageDetails = parseGmailMessageDetails(
      response.data,
      messageId,
    );

    return res.json(messageDetails);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      ('code' in error || 'status' in error)
    ) {
      const statusCode =
        (error as { code?: number; status?: number }).code ||
        (error as { code?: number; status?: number }).status;
      if (statusCode === 404) {
        return res.status(404).json({
          error: 'Gmail message not found',
        });
      }
    }

    console.error(
      'Failed to retrieve Gmail message:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return res.status(500).json({
      error: 'Failed to retrieve Gmail message',
    });
  }
});

/**
 * Synchronize Gmail messages
 * POST /api/gmail/sync
 */
router.post('/sync', requireAuth(), gmailSyncLimiter, async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const reviewer = isReviewer(req);
    const rawBatchSize = Number(req.body?.batchSize);
    const batchSize = Number.isInteger(rawBatchSize)
      ? Math.min(Math.max(rawBatchSize, 1), 100)
      : 15;
    const query = typeof req.body?.query === 'string' ? req.body.query : (typeof req.query?.q === 'string' ? (req.query.q as string) : undefined);
    const syncHistorical = Boolean(req.body?.syncHistorical || req.query?.syncHistorical);
    const recoverHistorical = Boolean(req.body?.recoverHistorical || req.query?.recoverHistorical);
    const rawRecoveryDays = Number(req.body?.recoveryDays || req.query?.recoveryDays);
    const recoveryDays = Number.isInteger(rawRecoveryDays) ? rawRecoveryDays : undefined;
    const rawMaxRecoveryCount = Number(req.body?.maxRecoveryCount || req.query?.maxRecoveryCount);
    const maxRecoveryCount = Number.isInteger(rawMaxRecoveryCount) ? rawMaxRecoveryCount : undefined;

    const stats = await syncGmailMessagesForUser(userId, batchSize, reviewer, {
      query,
      syncHistorical,
      recoverHistorical,
      recoveryDays,
      maxRecoveryCount,
    });
    return res.json(stats);

  } catch (error) {
    if (error instanceof GmailNotConnectedError) {
      return res.status(404).json({
        error: 'Gmail account is not connected',
      });
    }

    console.error('Failed to sync Gmail messages:', error);

    return res.status(500).json({
      error: 'Failed to sync Gmail messages',
    });
  }
});

/**
 * Recover historical Gmail messages previously marked processed or missing notices
 * POST /api/gmail/recover
 */
router.post('/recover', requireAuth(), gmailSyncLimiter, async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const rawDays = Number(req.body?.recoveryDays || req.query?.recoveryDays);
    const recoveryDays = Number.isInteger(rawDays) ? rawDays : 14;
    const rawCount = Number(req.body?.maxCount || req.query?.maxCount);
    const maxCount = Number.isInteger(rawCount) ? rawCount : 50;

    const stats = await recoverHistoricalGmailMessages(userId, { recoveryDays, maxCount });
    return res.json(stats);
  } catch (error) {
    if (error instanceof GmailNotConnectedError) {
      return res.status(404).json({
        error: 'Gmail account is not connected',
      });
    }

    console.error('Failed to recover historical Gmail messages:', error);

    return res.status(500).json({
      error: 'Failed to recover historical Gmail messages',
    });
  }
});

/**
 * Analyze Gmail message into NoticeCandidate
 * POST /api/gmail/analyze/:messageId
 */
router.post('/analyze/:messageId', requireAuth(), gmailAnalyzeLimiter, async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const { messageId } = req.params;
  if (!messageId || typeof messageId !== 'string') {
    return res.status(400).json({
      error: 'Invalid message ID',
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT access_token, refresh_token, expiry_date
      FROM gmail_connections
      WHERE user_id = $1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Gmail account is not connected',
      });
    }

    const { access_token, refresh_token, expiry_date } = rows[0];

    const gmail = createAuthenticatedGmailClient({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate: expiry_date,
    });

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const messageDetails = parseGmailMessageDetails(
      response.data,
      messageId,
    );

    const structuredMessage = toStructuredGmailMessage(messageDetails);
    const candidate = await noticeAnalyzerService.analyze(structuredMessage);

    return res.json(candidate);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      ('code' in error || 'status' in error)
    ) {
      const statusCode =
        (error as { code?: number; status?: number }).code ||
        (error as { code?: number; status?: number }).status;
      if (statusCode === 404) {
        return res.status(404).json({
          error: 'Gmail message not found',
        });
      }
    }

    if (error instanceof NoticeValidationError) {
      return res.status(422).json({
        error: error.message,
        fieldErrors: error.fieldErrors,
      });
    }

    console.error(
      'Failed to analyze Gmail message:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return res.status(500).json({
      error: 'Failed to analyze Gmail message',
    });
  }
});

export default router;