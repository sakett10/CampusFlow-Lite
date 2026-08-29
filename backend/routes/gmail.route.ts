import { Router } from 'express';
import { getAuth, requireAuth } from '@clerk/express';
import { google } from 'googleapis';
import {
  gmailOAuth2Client,
  getGoogleAuthUrl,
  createOAuthState,
  verifyOAuthState,
  createAuthenticatedGmailClient,
} from '../services/gmail.service.js';
import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';

const router = Router();

/**
 * Start Gmail OAuth
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

    return res.json({
      messages: response.data.messages || [],
      resultSizeEstimate: response.data.resultSizeEstimate ?? 0,
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

export default router;