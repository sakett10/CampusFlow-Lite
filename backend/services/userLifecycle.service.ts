import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import {
  acquireUserAdvisoryLock,
  releaseUserAdvisoryLock,
  gmailOAuth2Client,
} from './gmail.service.js';
import { decryptToken } from './crypto.service.js';
import { SYSTEM_INSTITUTIONAL_USER_ID } from './notices.service.js';
import { getObjectStorageDriver } from './objectStorage.service.js';

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
  pushSubscriptions?: number;
  userPreferences?: number;
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
    pushSubscriptions: 0,
    userPreferences: 0,
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
    const storageKeysToDelete: string[] = [];

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

      // (CF-SEC-16) 3.10. Delete user push subscriptions and preferences
      const { rowCount: psCount } = await lockClient.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.pushSubscriptions = psCount ?? 0;

      const { rowCount: upCount } = await lockClient.query(
        'DELETE FROM user_preferences WHERE user_id = $1',
        [cleanUserId],
      );
      purgeStats.userPreferences = upCount ?? 0;

      // (CF-SEC-03 & CF-SEC-08) 3.11. Notice handling:
      // Identify storage keys for notice attachments to be deleted:
      // - personal notices (source_type = 'gmail_personal')
      // - unpublished institutional notices (status != 'published')
      // - any other attachments owned by this user not attached to preserved institutional notices
      const { rows: keyRows } = await lockClient.query<{ storage_key: string }>(
        `
        SELECT DISTINCT storage_key FROM notice_attachments
        WHERE notice_id IN (
          SELECT id FROM notices
          WHERE created_by_user_id = $1
            AND (source_type = 'gmail_personal' OR status != 'published')
        )
        OR (
          user_id = $1
          AND notice_id NOT IN (
            SELECT id FROM notices
            WHERE status = 'published' AND source_type = 'institutional'
          )
        )
        `,
        [cleanUserId],
      );
      for (const r of keyRows) {
        if (r.storage_key) {
          storageKeysToDelete.push(r.storage_key);
        }
      }

      // 3.12. Institutional preservation:
      // Published campus institutional notices are official university bulletins.
      // Re-assign them and their attachments to the stable institutional system user ('admin')
      // so they remain visible across the university without referencing the deleted user.
      // NEVER re-assign gmail_personal notices to admin!
      await lockClient.query(
        `
        UPDATE notice_attachments
        SET user_id = $2
        WHERE user_id = $1
          AND notice_id IN (
            SELECT id FROM notices
            WHERE created_by_user_id = $1 AND status = 'published' AND source_type = 'institutional'
          )
        `,
        [cleanUserId, SYSTEM_INSTITUTIONAL_USER_ID],
      );

      const { rowCount: nPreservedCount } = await lockClient.query(
        `
        UPDATE notices
        SET created_by_user_id = $2,
            source_connection_id = NULL
        WHERE created_by_user_id = $1 AND status = 'published' AND source_type = 'institutional'
        `,
        [cleanUserId, SYSTEM_INSTITUTIONAL_USER_ID],
      );
      purgeStats.noticesPreserved = nPreservedCount ?? 0;

      // 3.13. Delete notifications referencing notices being deleted
      await lockClient.query(
        `
        DELETE FROM notifications
        WHERE notice_id IN (
          SELECT id FROM notices
          WHERE created_by_user_id = $1
            AND (source_type = 'gmail_personal' OR status != 'published')
        )
        `,
        [cleanUserId],
      );

      // 3.14. Delete notices created by this user that are NOT preserved published institutional notices.
      // This includes all personal Gmail notices and unpublished drafts.
      const { rowCount: nDelCount } = await lockClient.query(
        `
        DELETE FROM notices
        WHERE created_by_user_id = $1
          AND (source_type = 'gmail_personal' OR status != 'published')
        `,
        [cleanUserId],
      );
      purgeStats.noticesDeleted = nDelCount ?? 0;

      // 3.15. Delete any un-reassigned attachments for this user
      await lockClient.query(
        'DELETE FROM notice_attachments WHERE user_id = $1',
        [cleanUserId],
      );

      await lockClient.query('COMMIT');
    } catch (dbError) {
      await lockClient.query('ROLLBACK');
      console.error('Database transaction failed during user deletion:', dbError instanceof Error ? dbError.message : 'Database error');
      throw dbError;
    }

    // 4. Post-commit storage cleanup:
    // Safely delete objects using the existing ObjectStorageDriver.
    // Verify each storage key is not referenced by any surviving attachment row.
    // If deletion fails, log clearly without rolling back database work.
    if (storageKeysToDelete.length > 0) {
      const driver = getObjectStorageDriver();
      for (const key of storageKeysToDelete) {
        try {
          const { rows: refRows } = await lockClient.query(
            'SELECT 1 FROM notice_attachments WHERE storage_key = $1 LIMIT 1',
            [key],
          );
          if (refRows.length === 0) {
            await driver.delete(key);
          }
        } catch (storageErr) {
          console.error(
            `Failed to delete object from storage after user deletion [key=${key}, userId=${cleanUserId}]:`,
            storageErr instanceof Error ? storageErr.message : storageErr,
          );
        }
      }
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
