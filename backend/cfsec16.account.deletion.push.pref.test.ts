import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

const mockRevokeToken = vi.fn().mockResolvedValue({});
vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
    generateAuthUrl = vi.fn().mockReturnValue('https://mock-auth-url');
    revokeToken = mockRevokeToken;
    getToken = vi.fn().mockResolvedValue({
      tokens: {
        access_token: 'mock_access',
        refresh_token: 'mock_refresh',
        expiry_date: 1234567890,
      },
    });
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
    },
  };
});

import { pool } from './db.js';
import { userLifecycleService } from './services/userLifecycle.service.js';

describe('CF-SEC-16: User Deletion Push Subscriptions & Preferences Cleanup', () => {
  const userA = 'user_push_pref_A';
  const userB = 'user_push_pref_B';

  beforeEach(async () => {
    await pool.query('DELETE FROM push_subscriptions');
    await pool.query('DELETE FROM user_preferences');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM notification_dismissals');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM courses');
    await pool.query('DELETE FROM campus_items');
    await pool.query('DELETE FROM gmail_connections');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM campus_emails');

    vi.clearAllMocks();
  });

  it('1. purges push subscriptions and user preferences for deleted user while preserving other users', async () => {
    // 1. Seed push subscriptions for User A (2 devices) and User B (1 device)
    await pool.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, 'https://push.example.com/a1', 'p256dh_a1', 'auth_a1', 'Chrome Mobile'),
              ($3, $2, 'https://push.example.com/a2', 'p256dh_a2', 'auth_a2', 'Firefox Desktop'),
              ($4, $5, 'https://push.example.com/b1', 'p256dh_b1', 'auth_b1', 'Safari Mobile')`,
      [randomUUID(), userA, randomUUID(), randomUUID(), userB],
    );

    // 2. Seed user preferences for User A and User B
    await pool.query(
      `INSERT INTO user_preferences (user_id, default_reminder_offset, timezone)
       VALUES ($1, 60, 'Asia/Kolkata'),
              ($2, 30, 'America/New_York')`,
      [userA, userB],
    );

    // Verify initial rows
    const { rows: initialPushA } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userA]);
    expect(initialPushA).toHaveLength(2);
    const { rows: initialPrefA } = await pool.query('SELECT * FROM user_preferences WHERE user_id = $1', [userA]);
    expect(initialPrefA).toHaveLength(1);

    // Execute deletion of User A
    const result = await userLifecycleService.deleteUserData(userA);

    expect(result.success).toBe(true);
    expect(result.purged.pushSubscriptions).toBe(2);
    expect(result.purged.userPreferences).toBe(1);

    // Verify User A data is purged
    const { rows: postPushA } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userA]);
    expect(postPushA).toHaveLength(0);
    const { rows: postPrefA } = await pool.query('SELECT * FROM user_preferences WHERE user_id = $1', [userA]);
    expect(postPrefA).toHaveLength(0);

    // Verify User B data is completely intact
    const { rows: postPushB } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userB]);
    expect(postPushB).toHaveLength(1);
    expect(postPushB[0].endpoint).toBe('https://push.example.com/b1');

    const { rows: postPrefB } = await pool.query('SELECT * FROM user_preferences WHERE user_id = $1', [userB]);
    expect(postPrefB).toHaveLength(1);
    expect(postPrefB[0].timezone).toBe('America/New_York');
  });

  it('2. deletion is idempotent and succeeds when user has no push subscriptions or preferences', async () => {
    const result = await userLifecycleService.deleteUserData(userA);
    expect(result.success).toBe(true);
    expect(result.purged.pushSubscriptions).toBe(0);
    expect(result.purged.userPreferences).toBe(0);
  });
});
