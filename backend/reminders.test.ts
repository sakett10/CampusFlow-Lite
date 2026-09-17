import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock Clerk auth
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer user_alice') {
        req.auth = { userId: 'user_alice' };
      } else if (authHeader === 'Bearer user_bob') {
        req.auth = { userId: 'user_bob' };
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    requireAuth: () => (
      req: Request & { auth?: { userId: string | null } },
      res: Response,
      next: NextFunction,
    ) => {
      if (!req.auth || !req.auth.userId) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
      next();
    },
    getAuth: (req: Request & { auth?: { userId: string | null } }) => ({
      userId: req.auth?.userId || null,
    }),
  };
});

// Mock web-push so no real network requests occur
vi.mock('web-push', () => {
  return {
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn().mockImplementation(async (sub: { endpoint: string }) => {
        if (sub.endpoint.includes('expired')) {
          const err = new Error('Subscription expired');
          (err as { statusCode?: number }).statusCode = 410;
          throw err;
        }
        if (sub.endpoint.includes('fail')) {
          const err = new Error('Network error');
          (err as { statusCode?: number }).statusCode = 500;
          throw err;
        }
        return { statusCode: 201 };
      }),
    },
  };
});

import app from './index.js';
import { pool } from './db.js';
import {
  parseZonedDateTimeToUtc,
  calculateRemindAtUtc,
  remindersService,
  migrateExistingAssignmentsToReminders,
} from './services/reminders.service.js';
import { pushService } from './services/push.service.js';

describe('Task Reminders & Web Push System', () => {
  let aliceTaskId: string;
  let bobTaskId: string;

  beforeEach(async () => {
    process.env.VAPID_PUBLIC_KEY = 'test_public_vapid_key';
    process.env.VAPID_PRIVATE_KEY = 'test_private_vapid_key';
    process.env.VAPID_SUBJECT = 'mailto:test@campusflow.app';
    process.env.CRON_SECRET = 'test_cron_secret';

    await pool.query('DELETE FROM task_reminders');
    await pool.query('DELETE FROM push_subscriptions');
    await pool.query('DELETE FROM user_preferences');
    await pool.query('DELETE FROM assignments');

    // Create a task for Alice
    const taskAliceRes = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer user_alice')
      .send({
        title: 'Alice ML Assignment',
        dueDate: '2026-09-22',
        dueTime: '19:30',
        priority: 'high',
        status: 'PENDING',
      });
    aliceTaskId = taskAliceRes.body.id;

    // Create a task for Bob
    const taskBobRes = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer user_bob')
      .send({
        title: 'Bob Physics Lab',
        dueDate: '2026-09-25',
        dueTime: '14:00',
        priority: 'medium',
        status: 'PENDING',
      });
    bobTaskId = taskBobRes.body.id;
  });

  describe('Timezone & Calculation Engine', () => {
    it('accurately parses zoned date-time to UTC for Asia/Kolkata (+05:30)', () => {
      // 2026-09-22 19:30 in Asia/Kolkata is 14:00 UTC
      const utcDate = parseZonedDateTimeToUtc('2026-09-22', '19:30', 'Asia/Kolkata');
      expect(utcDate.toISOString()).toBe('2026-09-22T14:00:00.000Z');
    });

    it('accurately parses zoned date-time to UTC for America/New_York (EDT, -04:00)', () => {
      // In September (EDT = UTC-4), 2026-09-22 10:00 EDT is 14:00 UTC
      const utcDate = parseZonedDateTimeToUtc('2026-09-22', '10:00', 'America/New_York');
      expect(utcDate.toISOString()).toBe('2026-09-22T14:00:00.000Z');
    });

    it('calculates relative reminder: 30 minutes before due date/time', () => {
      // Deadline: 2026-09-22 19:30 IST (14:00 UTC)
      // 30 min before = 13:30 UTC
      const remindAt = calculateRemindAtUtc({
        dueDate: '2026-09-22',
        dueTime: '19:30',
        reminderType: '30m_before',
        timezone: 'Asia/Kolkata',
      });
      expect(remindAt?.toISOString()).toBe('2026-09-22T13:30:00.000Z');
    });

    it('calculates relative reminder: 1 day before due date/time', () => {
      // Deadline: 2026-09-22 19:30 IST (14:00 UTC)
      // 1 day before = 2026-09-21 14:00 UTC
      const remindAt = calculateRemindAtUtc({
        dueDate: '2026-09-22',
        dueTime: '19:30',
        reminderType: '1d_before',
        timezone: 'Asia/Kolkata',
      });
      expect(remindAt?.toISOString()).toBe('2026-09-21T14:00:00.000Z');
    });

    it('calculates relative reminder: at due time', () => {
      const remindAt = calculateRemindAtUtc({
        dueDate: '2026-09-22',
        dueTime: '19:30',
        reminderType: 'at_due',
        timezone: 'Asia/Kolkata',
      });
      expect(remindAt?.toISOString()).toBe('2026-09-22T14:00:00.000Z');
    });

    it('calculates custom reminder timestamp with authoritative user date and time', () => {
      const remindAt = calculateRemindAtUtc({
        reminderType: 'custom',
        customDate: '2026-09-22',
        customTime: '19:30',
        timezone: 'Asia/Kolkata',
      });
      expect(remindAt?.toISOString()).toBe('2026-09-22T14:00:00.000Z');
    });

    it('allows custom reminder when task has no due date', () => {
      const remindAt = calculateRemindAtUtc({
        dueDate: null,
        reminderType: 'custom',
        customDate: '2026-09-22',
        customTime: '19:30',
        timezone: 'Asia/Kolkata',
      });
      expect(remindAt?.toISOString()).toBe('2026-09-22T14:00:00.000Z');
    });

    it('disallows relative reminder when task has no due date', () => {
      const remindAt = calculateRemindAtUtc({
        dueDate: null,
        reminderType: '30m_before',
        timezone: 'Asia/Kolkata',
      });
      expect(remindAt).toBeNull();
    });
  });

  describe('Reminder CRUD & Task Integration', () => {
    it('creates reminder via task creation endpoint', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', 'Bearer user_alice')
        .send({
          title: 'Algorithm Homework',
          dueDate: '2026-09-22',
          dueTime: '19:30',
          reminder: '30m_before',
          timezone: 'Asia/Kolkata',
        });

      expect(res.status).toBe(201);
      expect(res.body.reminder).toBe('30m_before');
      expect(res.body.reminderRemindAt).toBe('2026-09-22T13:30:00.000Z');
      expect(res.body.reminderStatus).toBe('pending');
    });

    it('updates reminder via dedicated PUT /api/reminders/task/:taskId', async () => {
      const res = await request(app)
        .put(`/api/reminders/task/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({
          reminderType: '1h_before',
          timezone: 'Asia/Kolkata',
        });

      expect(res.status).toBe(200);
      expect(res.body.reminder.reminderType).toBe('1h_before');
      // 1 hour before 14:00 UTC = 13:00 UTC
      expect(res.body.reminder.remindAt).toBe('2026-09-22T13:00:00.000Z');
      expect(res.body.reminder.status).toBe('pending');
    });

    it('recalculates relative reminder when task due date changes', async () => {
      // Set reminder: 30m_before
      await request(app)
        .put(`/api/reminders/task/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({
          reminderType: '30m_before',
          timezone: 'Asia/Kolkata',
        });

      // Update task dueDate: 2026-09-23 19:30
      const updateRes = await request(app)
        .put(`/api/assignments/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({
          dueDate: '2026-09-23',
          dueTime: '19:30',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.reminderRemindAt).toBe('2026-09-23T13:30:00.000Z');
    });

    it('preserves custom reminder when task due date changes', async () => {
      // Set custom reminder on 2026-09-22 10:00
      await request(app)
        .put(`/api/reminders/task/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({
          reminderType: 'custom',
          customDate: '2026-09-22',
          customTime: '10:00',
          timezone: 'UTC',
        });

      // Update task dueDate
      const updateRes = await request(app)
        .put(`/api/assignments/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({
          dueDate: '2026-10-01',
        });

      expect(updateRes.status).toBe(200);
      // Custom timestamp should remain unchanged
      expect(updateRes.body.reminderRemindAt).toBe('2026-09-22T10:00:00.000Z');
    });

    it('cancels reminder when task is marked COMPLETED', async () => {
      await request(app)
        .put(`/api/reminders/task/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({
          reminderType: '30m_before',
          timezone: 'Asia/Kolkata',
        });

      // Complete task
      const updateRes = await request(app)
        .patch(`/api/assignments/${aliceTaskId}/status`)
        .set('Authorization', 'Bearer user_alice')
        .send({ status: 'COMPLETED' });

      expect(updateRes.status).toBe(200);

      const rem = await remindersService.getByTaskId('user_alice', aliceTaskId);
      expect(rem?.status).toBe('cancelled');
    });

    it('deletes reminder via DELETE /api/reminders/task/:taskId', async () => {
      await request(app)
        .put(`/api/reminders/task/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({
          reminderType: '15m_before',
          timezone: 'Asia/Kolkata',
        });

      const delRes = await request(app)
        .delete(`/api/reminders/task/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice');

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const rem = await remindersService.getByTaskId('user_alice', aliceTaskId);
      expect(rem).toBeNull();
    });

    it('deletes reminder automatically when task is deleted', async () => {
      await request(app)
        .put(`/api/reminders/task/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({
          reminderType: '30m_before',
          timezone: 'Asia/Kolkata',
        });

      await request(app)
        .delete(`/api/assignments/${aliceTaskId}`)
        .set('Authorization', 'Bearer user_alice');

      const rem = await remindersService.getByTaskId('user_alice', aliceTaskId);
      expect(rem).toBeNull();
    });
  });

  describe('Ownership & Security Isolation', () => {
    it('prevents Alice from accessing Bob reminder', async () => {
      // Bob creates a reminder
      await request(app)
        .put(`/api/reminders/task/${bobTaskId}`)
        .set('Authorization', 'Bearer user_bob')
        .send({
          reminderType: '30m_before',
          timezone: 'UTC',
        });

      // Alice attempts to get Bob's reminder
      const getRes = await request(app)
        .get(`/api/reminders/task/${bobTaskId}`)
        .set('Authorization', 'Bearer user_alice');
      expect(getRes.status).toBe(404);

      // Alice attempts to modify Bob's reminder
      const putRes = await request(app)
        .put(`/api/reminders/task/${bobTaskId}`)
        .set('Authorization', 'Bearer user_alice')
        .send({ reminderType: '1h_before' });
      expect(putRes.status).toBe(404);

      // Alice attempts to delete Bob's reminder
      const delRes = await request(app)
        .delete(`/api/reminders/task/${bobTaskId}`)
        .set('Authorization', 'Bearer user_alice');
      expect(delRes.body.success).toBe(false);
    });

    it('prevents Alice from accessing Bob push subscriptions', async () => {
      // Bob subscribes
      await request(app)
        .post('/api/notifications/push/subscribe')
        .set('Authorization', 'Bearer user_bob')
        .send({
          endpoint: 'https://push.example.com/sub/bob_phone',
          keys: { p256dh: 'bob_p256', auth: 'bob_auth' },
        });

      // Alice subscribes
      await request(app)
        .post('/api/notifications/push/subscribe')
        .set('Authorization', 'Bearer user_alice')
        .send({
          endpoint: 'https://push.example.com/sub/alice_laptop',
          keys: { p256dh: 'alice_p256', auth: 'alice_auth' },
        });

      const aliceSubs = await pushService.getSubscriptionsForUser('user_alice');
      expect(aliceSubs.length).toBe(1);
      expect(aliceSubs[0].endpoint).toBe('https://push.example.com/sub/alice_laptop');

      const bobSubs = await pushService.getSubscriptionsForUser('user_bob');
      expect(bobSubs.length).toBe(1);
      expect(bobSubs[0].endpoint).toBe('https://push.example.com/sub/bob_phone');
    });
  });

  describe('User Preferences', () => {
    it('returns default 30m_before initially', async () => {
      const res = await request(app)
        .get('/api/reminders/preferences')
        .set('Authorization', 'Bearer user_alice');

      expect(res.status).toBe(200);
      expect(res.body.defaultReminderOffset).toBe('30m_before');
    });

    it('persists updated default reminder preference', async () => {
      const putRes = await request(app)
        .put('/api/reminders/preferences')
        .set('Authorization', 'Bearer user_alice')
        .send({
          defaultReminderOffset: '1h_before',
          timezone: 'Asia/Kolkata',
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.defaultReminderOffset).toBe('1h_before');
      expect(putRes.body.timezone).toBe('Asia/Kolkata');

      const getRes = await request(app)
        .get('/api/reminders/preferences')
        .set('Authorization', 'Bearer user_alice');
      expect(getRes.body.defaultReminderOffset).toBe('1h_before');
    });
  });

  describe('Push Notifications & Cron Processing', () => {
    it('handles subscribe, unsubscribe, and test notification', async () => {
      // 1. Subscribe
      const subRes = await request(app)
        .post('/api/notifications/push/subscribe')
        .set('Authorization', 'Bearer user_alice')
        .send({
          endpoint: 'https://push.example.com/sub/alice_1',
          keys: { p256dh: 'test_p256dh', auth: 'test_auth' },
        });
      expect(subRes.status).toBe(201);
      expect(subRes.body.success).toBe(true);

      // 2. Test notification
      const testRes = await request(app)
        .post('/api/notifications/push/test')
        .set('Authorization', 'Bearer user_alice');
      expect(testRes.status).toBe(200);
      expect(testRes.body.success).toBe(true);

      // 3. Unsubscribe
      const unsubRes = await request(app)
        .post('/api/notifications/push/unsubscribe')
        .set('Authorization', 'Bearer user_alice')
        .send({ endpoint: 'https://push.example.com/sub/alice_1' });
      expect(unsubRes.status).toBe(200);
      expect(unsubRes.body.success).toBe(true);

      const subs = await pushService.getSubscriptionsForUser('user_alice');
      expect(subs.length).toBe(0);
    });

    it('automatically prunes expired subscriptions (410 Gone)', async () => {
      await pushService.saveSubscription('user_alice', {
        endpoint: 'https://push.example.com/sub/expired_client',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      const before = await pushService.getSubscriptionsForUser('user_alice');
      expect(before.length).toBe(1);

      // Sending to expired endpoint
      const result = await pushService.sendToUser('user_alice', {
        title: 'Test',
        body: 'Message',
      });
      expect(result.failed).toBe(1);

      // Should be automatically removed
      const after = await pushService.getSubscriptionsForUser('user_alice');
      expect(after.length).toBe(0);
    });

    it('rejects unauthorized access to cron process-reminders without secret', async () => {
      const res = await request(app).get('/api/cron/process-reminders');
      expect(res.status).toBe(401);
    });

    it('executes cron process-reminders with valid Bearer CRON_SECRET', async () => {
      // 1. Create a due reminder for Alice (remind_at in past)
      const pastTime = new Date(Date.now() - 60000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `,
        [randomUUID(), aliceTaskId, 'user_alice', pastTime, 'UTC', '30m_before'],
      );

      // Alice has an active push subscription
      await pushService.saveSubscription('user_alice', {
        endpoint: 'https://push.example.com/sub/alice_live',
        keys: { p256dh: 'live_p256', auth: 'live_auth' },
      });

      // 2. Trigger cron
      const cronRes = await request(app)
        .get('/api/cron/process-reminders')
        .set('Authorization', 'Bearer test_cron_secret');

      expect(cronRes.status).toBe(200);
      expect(cronRes.body.processed).toBe(1);
      expect(cronRes.body.sent).toBe(1);

      // 3. Verify reminder marked sent
      const rem = await remindersService.getByTaskId('user_alice', aliceTaskId);
      expect(rem?.status).toBe('sent');
      expect(rem?.sentAt).not.toBeNull();
    });

    it('prevents duplicate sending when cron runs concurrently', async () => {
      const pastTime = new Date(Date.now() - 60000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `,
        [randomUUID(), aliceTaskId, 'user_alice', pastTime, 'UTC', '15m_before'],
      );

      // Run 2 cron invocations concurrently
      const [res1, res2] = await Promise.all([
        request(app).get('/api/cron/process-reminders').set('Authorization', 'Bearer test_cron_secret'),
        request(app).get('/api/cron/process-reminders').set('Authorization', 'Bearer test_cron_secret'),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      // Total processed across both must equal 1, never 2
      expect(res1.body.processed + res2.body.processed).toBe(1);
    });

    it('does not re-send past reminders on subsequent cron executions', async () => {
      const pastTime = new Date(Date.now() - 60000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `,
        [randomUUID(), aliceTaskId, 'user_alice', pastTime, 'UTC', '1h_before'],
      );

      // First run: processes 1
      const res1 = await request(app)
        .get('/api/cron/process-reminders')
        .set('Authorization', 'Bearer test_cron_secret');
      expect(res1.status).toBe(200);
      expect(res1.body.processed).toBe(1);

      // Second run: 0 pending left, no re-send
      const res2 = await request(app)
        .get('/api/cron/process-reminders')
        .set('Authorization', 'Bearer test_cron_secret');
      expect(res2.status).toBe(200);
      expect(res2.body.processed).toBe(0);
      expect(res2.body.sent).toBe(0);
    });

    it('handles successful push vs failed push correctly', async () => {
      // 1. Success endpoint
      await pushService.saveSubscription('user_alice', {
        endpoint: 'https://push.example.com/sub/ok_device',
        keys: { p256dh: 'p256', auth: 'auth' },
      });
      const okResult = await pushService.sendToUser('user_alice', {
        title: 'Title',
        body: 'Body',
      });
      expect(okResult.sent).toBe(1);
      expect(okResult.failed).toBe(0);

      // 2. Failure endpoint (500 network error)
      await pushService.saveSubscription('user_bob', {
        endpoint: 'https://push.example.com/sub/fail_device',
        keys: { p256dh: 'p256', auth: 'auth' },
      });
      const failResult = await pushService.sendToUser('user_bob', {
        title: 'Title',
        body: 'Body',
      });
      expect(failResult.failed).toBe(1);
      expect(failResult.sent).toBe(0);
    });

    it('formats Web Push payload matching the Service Worker contract', async () => {
      const sendSpy = vi.spyOn(pushService, 'sendToUser');
      const pastTime = new Date(Date.now() - 30000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `,
        [randomUUID(), aliceTaskId, 'user_alice', pastTime, 'UTC', '30m_before'],
      );

      await request(app)
        .get('/api/cron/process-reminders')
        .set('Authorization', 'Bearer test_cron_secret');

      expect(sendSpy).toHaveBeenCalledWith(
        'user_alice',
        expect.objectContaining({
          title: 'CampusFlow',
          body: expect.stringContaining('Alice ML Assignment'),
          tag: `task-reminder-${aliceTaskId}`,
          data: expect.objectContaining({
            taskId: aliceTaskId,
            url: '/assignments',
          }),
        }),
      );
      sendSpy.mockRestore();
    });
  });

  describe('Reliability State Machine & Recovery (Regression Tests)', () => {
    it('Test 1: push succeeds -> pending -> processing -> sent (sent_at set, claim_expires_at cleared)', async () => {
      await pushService.saveSubscription('user_alice', {
        endpoint: 'https://push.example.com/sub/alice_live',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      const reminderId = randomUUID();
      const pastTime = new Date(Date.now() - 30000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `,
        [reminderId, aliceTaskId, 'user_alice', pastTime, 'UTC', '15m_before'],
      );

      const result = await remindersService.processDueReminders();
      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);

      const rem = await remindersService.getByTaskId('user_alice', aliceTaskId);
      expect(rem?.status).toBe('sent');
      expect(rem?.sentAt).not.toBeNull();
      expect(rem?.claimExpiresAt).toBeNull();
      expect(rem?.lastError).toBeNull();
      expect(rem?.retryCount).toBe(0);
    });

    it('Test 2: push fails with 500 -> transitions to pending with incremented retry_count, future remind_at, and transitions to failed on max retries', async () => {
      await pushService.saveSubscription('user_bob', {
        endpoint: 'https://push.example.com/sub/fail_bob_device',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      const reminderId = randomUUID();
      const pastTime = new Date(Date.now() - 30000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status, retry_count)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0)
        `,
        [reminderId, bobTaskId, 'user_bob', pastTime, 'UTC', '15m_before'],
      );

      // First run: fails with 500 -> retry 1
      const res1 = await remindersService.processDueReminders();
      expect(res1.processed).toBe(1);
      expect(res1.failed).toBe(1);

      const remAfter1 = await remindersService.getByTaskId('user_bob', bobTaskId);
      expect(remAfter1?.status).toBe('pending');
      expect(remAfter1?.retryCount).toBe(1);
      expect(remAfter1?.claimExpiresAt).toBeNull();
      expect(remAfter1?.lastError).toContain('Transient Web Push delivery failure');
      expect(new Date(remAfter1!.remindAt).getTime()).toBeGreaterThan(Date.now());

      // Advance remind_at to simulate time passing to next attempt with retryCount = 2
      await pool.query(
        `UPDATE task_reminders SET remind_at = $1, retry_count = 2 WHERE id = $2`,
        [new Date(Date.now() - 10000), reminderId],
      );

      // Final run: exceeds MAX_REMINDER_RETRIES -> status = failed
      const res2 = await remindersService.processDueReminders();
      expect(res2.processed).toBe(1);
      expect(res2.failed).toBe(1);

      const remAfterFinal = await remindersService.getByTaskId('user_bob', bobTaskId);
      expect(remAfterFinal?.status).toBe('failed');
      expect(remAfterFinal?.retryCount).toBe(3);
      expect(remAfterFinal?.claimExpiresAt).toBeNull();
      expect(remAfterFinal?.lastError).toContain('Max Web Push delivery retries exceeded');
    });

    it('Test 3: abandoned processing reminder with expired lease is reclaimed by next cron run and delivered', async () => {
      await pushService.saveSubscription('user_alice', {
        endpoint: 'https://push.example.com/sub/alice_live',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      const reminderId = randomUUID();
      // Simulating a crashed worker: reminder left in 'processing' with lease expired 1 minute ago
      const expiredLease = new Date(Date.now() - 60000);
      const originalRemindAt = new Date(Date.now() - 120000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status, claim_expires_at, retry_count)
        VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7, 0)
        `,
        [reminderId, aliceTaskId, 'user_alice', originalRemindAt, 'UTC', '15m_before', expiredLease],
      );

      // Next cron executes
      const result = await remindersService.processDueReminders();
      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);

      const rem = await remindersService.getByTaskId('user_alice', aliceTaskId);
      expect(rem?.status).toBe('sent');
      expect(rem?.sentAt).not.toBeNull();
      expect(rem?.claimExpiresAt).toBeNull();
    });

    it('Test 4: concurrent cron workers cannot claim the same reminder (mutual exclusion)', async () => {
      await pushService.saveSubscription('user_alice', {
        endpoint: 'https://push.example.com/sub/alice_live',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      const reminderId = randomUUID();
      const pastTime = new Date(Date.now() - 60000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `,
        [reminderId, aliceTaskId, 'user_alice', pastTime, 'UTC', '15m_before'],
      );

      const [res1, res2] = await Promise.all([
        remindersService.processDueReminders(),
        remindersService.processDueReminders(),
      ]);

      expect(res1.processed + res2.processed).toBe(1);
      expect(res1.sent + res2.sent).toBe(1);
    });

    it('Test 5: HTTP 410 invalid subscription is pruned, reminder marked sent without infinite retry loop', async () => {
      // Bob has only an expired subscription (triggers 410 in web-push mock)
      await pushService.saveSubscription('user_bob', {
        endpoint: 'https://push.example.com/sub/expired_bob_device',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      const reminderId = randomUUID();
      const pastTime = new Date(Date.now() - 30000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `,
        [reminderId, bobTaskId, 'user_bob', pastTime, 'UTC', '15m_before'],
      );

      const result = await remindersService.processDueReminders();
      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);

      // Subscription must be pruned
      const subs = await pushService.getSubscriptionsForUser('user_bob');
      expect(subs.length).toBe(0);

      // Reminder must be marked 'sent' (no retry loop on dead subscription)
      const rem = await remindersService.getByTaskId('user_bob', bobTaskId);
      expect(rem?.status).toBe('sent');
      expect(rem?.retryCount).toBe(0);
    });

    it('Test 6: multiple devices (1 failed 500, 1 succeeded 201) -> considered delivered (sent)', async () => {
      // Alice has 2 devices: one failing with 500, one succeeding with 201
      await pushService.saveSubscription('user_alice', {
        endpoint: 'https://push.example.com/sub/fail_alice_device',
        keys: { p256dh: 'p256', auth: 'auth' },
      });
      await pushService.saveSubscription('user_alice', {
        endpoint: 'https://push.example.com/sub/ok_alice_device',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      const reminderId = randomUUID();
      const pastTime = new Date(Date.now() - 30000);
      await pool.query(
        `
        INSERT INTO task_reminders (id, task_id, user_id, remind_at, timezone, reminder_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `,
        [reminderId, aliceTaskId, 'user_alice', pastTime, 'UTC', '15m_before'],
      );

      const result = await remindersService.processDueReminders();
      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);

      const rem = await remindersService.getByTaskId('user_alice', aliceTaskId);
      expect(rem?.status).toBe('sent');
      expect(rem?.sentAt).not.toBeNull();
      expect(rem?.claimExpiresAt).toBeNull();
    });
  });

  describe('Legacy Reminder Migration & Calculation', () => {
    it('calculates morning_of reminder (09:00 AM local time)', () => {
      // Due 2026-09-22 17:00 IST (11:30 UTC)
      // Morning of = 2026-09-22 09:00 IST (03:30 UTC)
      const remindAt = calculateRemindAtUtc({
        dueDate: '2026-09-22',
        dueTime: '17:00',
        reminderType: 'morning_of',
        timezone: 'Asia/Kolkata',
      });
      expect(remindAt?.toISOString()).toBe('2026-09-22T03:30:00.000Z');
    });

    it('falls back to 2h before deadline if morning_of (9:00 AM) is after or at deadline', () => {
      // Due 2026-09-22 08:00 IST (02:30 UTC)
      // 09:00 AM IST is after 08:00 AM -> fallback to 2h before (06:00 IST / 00:30 UTC)
      const remindAt = calculateRemindAtUtc({
        dueDate: '2026-09-22',
        dueTime: '08:00',
        reminderType: 'morning_of',
        timezone: 'Asia/Kolkata',
      });
      expect(remindAt?.toISOString()).toBe('2026-09-22T00:30:00.000Z');
    });

    it('calculates 2d_before reminder (48 hours before deadline)', () => {
      const remindAt = calculateRemindAtUtc({
        dueDate: '2026-09-24',
        dueTime: '19:30',
        reminderType: '2d_before',
        timezone: 'Asia/Kolkata',
      });
      // 2026-09-24 19:30 IST - 48h = 2026-09-22 19:30 IST (14:00 UTC)
      expect(remindAt?.toISOString()).toBe('2026-09-22T14:00:00.000Z');
    });

    it('migrates legacy assignments without losing original records or inventing timestamps for invalid dates', async () => {
      // Insert legacy assignments directly into assignments table
      const task1Id = randomUUID();
      const task2Id = randomUUID();
      const task3Id = randomUUID();
      const taskInvalidId = randomUUID();
      const taskCompletedId = randomUUID();

      // Task 1: 2h_before with valid future due date
      await pool.query(
        `
        INSERT INTO assignments (id, user_id, title, due_date, due_time, reminder, status)
        VALUES ($1, 'user_alice', 'Legacy Task 1', '2026-10-10', '14:00', '2h_before', 'PENDING')
        `,
        [task1Id],
      );

      // Task 2: morning_of with valid due date
      await pool.query(
        `
        INSERT INTO assignments (id, user_id, title, due_date, due_time, reminder, status)
        VALUES ($1, 'user_alice', 'Legacy Task 2', '2026-10-11', '18:00', 'morning_of', 'PENDING')
        `,
        [task2Id],
      );

      // Task 3: 1d_before with past due date (should migrate with status 'sent')
      await pool.query(
        `
        INSERT INTO assignments (id, user_id, title, due_date, due_time, reminder, status)
        VALUES ($1, 'user_alice', 'Legacy Task 3', '2020-01-02', '12:00', '1d_before', 'PENDING')
        `,
        [task3Id],
      );

      // Task 4: Missing dueDate (should be skipped, preserved, and counted)
      await pool.query(
        `
        INSERT INTO assignments (id, user_id, title, due_date, due_time, reminder, status)
        VALUES ($1, 'user_alice', 'No Date Task', NULL, NULL, '1d_before', 'PENDING')
        `,
        [taskInvalidId],
      );

      // Task 5: Completed task (should migrate with status 'cancelled')
      await pool.query(
        `
        INSERT INTO assignments (id, user_id, title, due_date, due_time, reminder, status)
        VALUES ($1, 'user_alice', 'Completed Legacy', '2026-10-15', '12:00', '2h_before', 'COMPLETED')
        `,
        [taskCompletedId],
      );

      // Run migration
      const result = await migrateExistingAssignmentsToReminders(pool);

      expect(result.totalFound).toBe(5);
      expect(result.migratedCount).toBe(4);
      expect(result.skippedCount).toBe(1);

      // Verify task 1 migrated as pending
      const rem1 = await remindersService.getByTaskId('user_alice', task1Id);
      expect(rem1).not.toBeNull();
      expect(rem1?.reminderType).toBe('2h_before');
      expect(rem1?.status).toBe('pending');
      // 2h before 2026-10-10 14:00 UTC = 12:00 UTC
      expect(rem1?.remindAt).toBe('2026-10-10T12:00:00.000Z');

      // Verify task 2 morning_of migrated
      const rem2 = await remindersService.getByTaskId('user_alice', task2Id);
      expect(rem2).not.toBeNull();
      expect(rem2?.reminderType).toBe('morning_of');
      expect(rem2?.status).toBe('pending');

      // Verify task 3 (past deadline) migrated as sent
      const rem3 = await remindersService.getByTaskId('user_alice', task3Id);
      expect(rem3).not.toBeNull();
      expect(rem3?.status).toBe('sent');

      // Verify task 4 (no date) has NO task_reminder record, but assignment record is preserved
      const remInvalid = await remindersService.getByTaskId('user_alice', taskInvalidId);
      expect(remInvalid).toBeNull();
      const { rows: preservedRows } = await pool.query('SELECT * FROM assignments WHERE id = $1', [taskInvalidId]);
      expect(preservedRows.length).toBe(1);
      expect(preservedRows[0].reminder).toBe('1d_before');

      // Verify task 5 (completed) migrated as cancelled
      const remCompleted = await remindersService.getByTaskId('user_alice', taskCompletedId);
      expect(remCompleted).not.toBeNull();
      expect(remCompleted?.status).toBe('cancelled');

      // Second migration pass is idempotent
      const pass2 = await migrateExistingAssignmentsToReminders(pool);
      expect(pass2.migratedCount).toBe(0);
      expect(pass2.skippedCount).toBe(1); // the invalid date task is still safely skipped
    });
  });
});
