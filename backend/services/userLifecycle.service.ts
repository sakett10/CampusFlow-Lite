import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import {
  acquireUserAdvisoryLock,
  releaseUserAdvisoryLock,
  gmailOAuth2Client,
} from './gmail.service.js';
import { decryptToken } from './crypto.service.js';
import { SYSTEM_INSTITUTIONAL_USER_ID } from './notices.service.js';

export interface UserDeletionPurgeStats {
  gmailConnection: boolean;
  campusEmails: number;
  processedMessages: number;
  assignments: number;
  courses: number;
  campusItems: number;
  notifications: number;
  notificationDismissals: number;
  noticesDeleted: number;
  noticesPreserved: number;
}

export interface UserDeletionResult {
  success: boolean;
  userId: string;
  purged: UserDeletionPurgeStats;
  googleTokenRevoked: boolean;
  error?: string;
}

/**
 * Securely and idempotently purges a user's data upon Clerk user-deletion lifecycle events.
 *
 * Requirements:
 * 1. Acquires the exact same PostgreSQL advisory lock used by Gmail sync in blocking mode.
 * 2. Attempts Google OAuth token revocation (refresh token preferred, access token fallback)
 *    without letting Google API failures prevent local database purge. Never logs raw tokens.
 * 3. Executes local database deletions in a single atomic transaction.
 * 4. Preserves published institutional campus notices, re-assigning ownership to 'admin'
 *    so official campus notices remain visible to university students.
 * 5. Purges user-specific draft/unpublished notices, assignments, courses, campus items,
 *    emails, and notification dismissal markers.
 * 6. Prunes user ID from broadcast notification read_by arrays without deleting global announcements.
 * 7. Strictly idempotent: multiple sequential invocations complete safely without error.
 */
export async function deleteUserData(userId: string): Promise<UserDeletionResult> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Invalid user ID for deletion');
  }

  const cleanUserId = userId.trim();
  const lockClient: PoolClient = await pool.connect();
  let lockAcquired = false;
  let googleTokenRevoked = false;

  const purgeStats: UserDeletionPurgeStats = {
    gmailConnection: false,
    campusEmails: 0,
    processedMessages: 0,
    assignments: 0,
    courses: 0,
    campusItems: 0,
    notifications: 0,
    notificationDismissals: 0,
    noticesDeleted: 0,
    noticesPreserved: 0,
  };

  try {
    // 1. Acquire the user-scoped PostgreSQL advisory lock (blocking mode)
    // Guarantees any running Gmail sync finishes before deletion begins,
    // and prevents new syncs from starting.
    await acquireUserAdvisoryLock(lockClient, cleanUserId, false);
    lockAcquired = true;

    // 2. Query Gmail connection to obtain stored encrypted tokens for revocation
    const { rows: connRows } = await lockClient.query(
      'SELECT access_token, refresh_token FROM gmail_connections WHERE user_id = $1',
      [cleanUserId],
    );

    if (connRows.length > 0) {
      const rawRefreshToken = connRows[0].refresh_token;
      const rawAccessToken = connRows[0].access_token;

      let decryptedRefreshToken: string | null = null;
      let decryptedAccessToken: string | null = null;

      if (rawRefreshToken) {
        try {
          const res = decryptToken(rawRefreshToken);
          decryptedRefreshToken = res.text || null;
        } catch (err) {
          console.warn('Failed to decrypt refresh token for user deletion revocation:', err instanceof Error ? err.message : 'Decryption error');
        }
      }

      if (rawAccessToken) {
        try {
          const res = decryptToken(rawAccessToken);
          decryptedAccessToken = res.text || null;
        } catch (err) {
          console.warn('Failed to decrypt access token for user deletion revocation:', err instanceof Error ? err.message : 'Decryption error');
        }
      }

      // Prefer refresh_token, fall back to access_token
      const tokenToRevoke = decryptedRefreshToken || decryptedAccessToken;

      if (tokenToRevoke) {
        try {
          await gmailOAuth2Client.revokeToken(tokenToRevoke);
          googleTokenRevoked = true;
        } catch (revokeError) {
          // Non-blocking: Google API/network failure MUST NOT prevent local database purge.
          // Never log raw tokens, refresh tokens, authorization codes, or email content.
          console.warn(
            'Google OAuth token revocation failed during user deletion (continuing with local database purge):',
            revokeError instanceof Error ? revokeError.message : 'Unknown revocation error',
          );
        }
      }
    }

    // 3. Perform database deletion in a single atomic transaction
    try {
      await lockClient.query('BEGIN');

      // 3.1. Delete user assignments (tasks) explicitly before courses
      const { rowCount: aCount } = await lockClient.query(
        'DELETE FROM assignments WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.assignments = aCount ?? 0;

      // 3.2. Delete user courses (cascading any orphaned child records if any remained)
      const { rowCount: cCount } = await lockClient.query(
        'DELETE FROM courses WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.courses = cCount ?? 0;

      // 3.3. Delete user personal campus items
      const { rowCount: ciCount } = await lockClient.query(
        'DELETE FROM campus_items WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.campusItems = ciCount ?? 0;

      // 3.4. Delete user Gmail connection record
      const { rowCount: gcCount } = await lockClient.query(
        'DELETE FROM gmail_connections WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.gmailConnection = (gcCount ?? 0) > 0;

      // 3.5. Delete user synced campus emails and raw body text
      const { rowCount: ceCount } = await lockClient.query(
        'DELETE FROM campus_emails WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.campusEmails = ceCount ?? 0;

      // 3.6. Delete processed Gmail message tracking IDs
      const { rowCount: pmCount } = await lockClient.query(
        'DELETE FROM processed_gmail_messages WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.processedMessages = pmCount ?? 0;

      // 3.7. Delete user-targeted notifications
      const { rowCount: notifCount } = await lockClient.query(
        'DELETE FROM notifications WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.notifications = notifCount ?? 0;

      // 3.8. Delete user notification dismissal records
      const { rowCount: ndCount } = await lockClient.query(
        'DELETE FROM notification_dismissals WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.notificationDismissals = ndCount ?? 0;

      // 3.9. Prune deleted user from global broadcast notification read_by JSONB arrays
      await lockClient.query(
        'UPDATE notifications SET read_by = read_by - $1 WHERE user_id IS NULL AND read_by IS NOT NULL',
        [cleanUserId],
      );

      // 3.10. Delete notifications referencing unpublished notices of this user
      await lockClient.query(
        `
        DELETE FROM notifications
        WHERE notice_id IN (
          SELECT id FROM notices WHERE created_by_user_id = $1 AND status != 'published'
        )
        `,
        [cleanUserId],
      );

      // 3.11. Delete unpublished / draft / pending / rejected / archived notices created by this user
      const { rowCount: nDelCount } = await lockClient.query(
        `
        DELETE FROM notices
        WHERE created_by_user_id = $1 AND status != 'published'
        `,
        [cleanUserId],
      );
      purgeStats.noticesDeleted = nDelCount ?? 0;

      // 3.12. Institutional preservation:
      // Published campus notices are university-wide official bulletins.
      // Re-assign them to the stable institutional system user so they remain visible
      // in campus noticeboards, feeds, and notifications without referencing the deleted Clerk user.
      const { rowCount: nPreservedCount } = await lockClient.query(
        `
        UPDATE notices
        SET created_by_user_id = $2,
            source_connection_id = NULL
        WHERE created_by_user_id = $1 AND status = 'published'
        `,
        [cleanUserId, SYSTEM_INSTITUTIONAL_USER_ID],
      );
      purgeStats.noticesPreserved = nPreservedCount ?? 0;

      await lockClient.query('COMMIT');
    } catch (dbError) {
      await lockClient.query('ROLLBACK');
      console.error('Database transaction failed during user deletion:', dbError instanceof Error ? dbError.message : 'Database error');
      throw dbError;
    }

    return {
      success: true,
      userId: cleanUserId,
      purged: purgeStats,
      googleTokenRevoked,
    };
  } finally {
    if (lockAcquired) {
      await releaseUserAdvisoryLock(lockClient, cleanUserId);
    }
    lockClient.release();
  }
}

export const userLifecycleService = {
  deleteUserData,
};
