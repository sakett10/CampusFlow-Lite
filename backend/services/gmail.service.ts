import { google } from 'googleapis';
import jwt from 'jsonwebtoken';

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