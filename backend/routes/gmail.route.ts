import { Router } from 'express';
import { getAuth, requireAuth } from '@clerk/express';
import { google } from 'googleapis';
import {
  gmailOAuth2Client,
  getGoogleAuthUrl,
  createOAuthState,
  verifyOAuthState,
  createAuthenticatedGmailClient,
  parseGmailMessageDetails,
  toStructuredGmailMessage,
  syncGmailMessagesForUser,
  GmailNotConnectedError,
} from '../services/gmail.service.js';
import { noticeAnalyzerService } from '../services/noticeAnalyzer.service.js';
import { NoticeValidationError } from '../services/noticeValidator.js';
import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import { isReviewer } from '../middleware/requireAuth.js';

const router = Router();

/**
 * Generate Google OAuth authorization URL
 * GET /api/gmail/auth-url
 */
router.get('/auth-url', requireAuth(), (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const state = createOAuthState(userId);
  const authUrl = getGoogleAuthUrl(state);

  return res.json({ url: authUrl });
});

/**
 * Start Gmail OAuth (legacy browser redirect fallback)
 * GET /api/gmail/connect
 */
router.get('/connect', requireAuth(), (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const state = createOAuthState(userId);
  const authUrl = getGoogleAuthUrl(state);

  return res.redirect(authUrl);
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

  try {
    const { rows } = await pool.query(
      `
      SELECT access_token, refresh_token
      FROM gmail_connections
      WHERE user_id = $1
      `,
      [userId],
    );

    if (rows.length > 0) {
      const tokenToRevoke = rows[0].access_token || rows[0].refresh_token;
      if (tokenToRevoke) {
        try {
          await gmailOAuth2Client.revokeToken(tokenToRevoke);
        } catch (revokeError) {
          // Token may already be expired or revoked externally; proceed with local deletion
          console.warn('Google OAuth token revocation warning:', revokeError instanceof Error ? revokeError.message : revokeError);
        }
      }

      await pool.query(
        `
        DELETE FROM gmail_connections
        WHERE user_id = $1
        `,
        [userId],
      );
    }

    return res.json({
      success: true,
      message: 'Gmail disconnected successfully',
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
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      error: 'Missing authorization code',
    });
  }

  if (!state || typeof state !== 'string') {
    return res.status(400).json({
      error: 'Missing OAuth state',
    });
  }

  let userId: string;

  try {
    ({ userId } = verifyOAuthState(state));
  } catch {
    return res.status(400).json({
      error: 'Invalid or expired OAuth state',
    });
  }

  try {
    const { tokens } = await gmailOAuth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return res.status(400).json({
        error: 'Google did not provide the required OAuth tokens',
      });
    }

    const authClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

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
      return res.status(400).json({
        error: 'Could not determine Google account email',
      });
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
        tokens.access_token,
        tokens.refresh_token,
        tokens.expiry_date ?? null,
      ],
    );

    return res.redirect(
      `${process.env.FRONTEND_URL}/settings?gmail=connected`,
    );
  } catch (error) {
    console.error('Google OAuth callback failed:', error);

    return res.status(500).json({
      error: 'Failed to complete Google OAuth',
    });
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

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Gmail messages.list] Retrieved ${rawMessages.length} message references:`);
      rawMessages.forEach((m, index) => {
        console.log(`  [${index}] id: ${m.id}, threadId: ${m.threadId}`);
      });
    }

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

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Gmail messages.get] requestedId: ${messageId}, returnedId: ${response.data.id}, threadId: ${response.data.threadId}, matches: ${messageId === response.data.id}`,
      );
    }

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
router.post('/sync', requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const reviewer = isReviewer(req);
    const stats = await syncGmailMessagesForUser(userId, 30, reviewer);
    return res.json(stats);

  } catch (error) {
    if (error instanceof GmailNotConnectedError) {
      return res.status(404).json({
        error: 'Gmail account is not connected',
      });
    }

    const errorDetails = error instanceof Error ? error.message : String(error);
    console.error('Failed to sync Gmail messages:', error);

    return res.status(500).json({
      error: 'Failed to sync Gmail messages',
      details: errorDetails,
    });
  }
});

/**
 * Analyze Gmail message into NoticeCandidate
 * POST /api/gmail/analyze/:messageId
 */
router.post('/analyze/:messageId', requireAuth(), async (req, res) => {
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