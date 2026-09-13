/**
 * Production environment configuration and validation.
 * Ensures all required secrets are configured before accepting traffic,
 * preventing silent runtime failures or data corruption.
 */

export interface ValidateEnvOptions {
  force?: boolean;
}

export function isServerlessEnvironment(): boolean {
  return (
    process.env.VERCEL === '1' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.LAMBDA_TASK_ROOT)
  );
}

export function validateProductionEnv(options?: ValidateEnvOptions): void {
  // Only enforce in production runtime; skip during testing or local development unless forced
  if (!options?.force) {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
  }

  const missing: string[] = [];

  // Core database connection
  if (!process.env.DATABASE_URL?.trim()) {
    missing.push('DATABASE_URL');
  }

  // Clerk authentication
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    missing.push('CLERK_SECRET_KEY');
  }

  // Google OAuth credentials (supports GOOGLE_* or GMAIL_* conventions)
  const hasClientId = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GMAIL_CLIENT_ID?.trim(),
  );
  if (!hasClientId) {
    missing.push('GOOGLE_CLIENT_ID');
  }

  const hasClientSecret = Boolean(
    process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GMAIL_CLIENT_SECRET?.trim(),
  );
  if (!hasClientSecret) {
    missing.push('GOOGLE_CLIENT_SECRET');
  }

  const hasRedirectUri = Boolean(
    process.env.GOOGLE_REDIRECT_URI?.trim() || process.env.GMAIL_REDIRECT_URI?.trim(),
  );
  if (!hasRedirectUri) {
    missing.push('GOOGLE_REDIRECT_URI');
  }

  // Gmail OAuth State Secret (CSRF protection)
  if (!process.env.GMAIL_OAUTH_STATE_SECRET?.trim()) {
    missing.push('GMAIL_OAUTH_STATE_SECRET');
  }

  // Gmail Token Encryption Key (or fallback to GMAIL_OAUTH_STATE_SECRET)
  const hasEncryptionKey = Boolean(
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim() || process.env.GMAIL_OAUTH_STATE_SECRET?.trim(),
  );
  if (!hasEncryptionKey) {
    missing.push('GMAIL_TOKEN_ENCRYPTION_KEY');
  }

  // Clerk Webhook Secret (Account lifecycle / user.deleted verification)
  if (!process.env.CLERK_WEBHOOK_SECRET?.trim()) {
    missing.push('CLERK_WEBHOOK_SECRET');
  }

  // NOTE: GROQ_API_KEY and GEMINI_API_KEY are deliberately omitted here.
  // The system includes deterministic heuristic extraction fallback for academic emails,
  // so absent AI keys must not prevent the server from booting.

  if (missing.length > 0) {
    const errorMessage = `Production environment validation failed. Missing required environment variables: ${missing.join(', ')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}
