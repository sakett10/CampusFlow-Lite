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
