import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock auth before importing app
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (req: Request & { auth?: { userId: string | null } }, _res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer user_A') {
        req.auth = { userId: 'user_A' };
      } else if (authHeader === 'Bearer user_B') {
        req.auth = { userId: 'user_B' };
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    requireAuth: () => (req: Request & { auth?: { userId: string | null } }, res: Response, next: NextFunction) => {
      if (!req.auth || !req.auth.userId) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
      next();
    },
    getAuth: (req: Request & { auth?: { userId: string | null } }) => ({ userId: req.auth?.userId || null })
  };
});

import app from './index.js';
import { pool } from './db.js';
import {
  calculateReminderTriggerTime,
  isTaskOverdue,
  isTaskReminderDue,
} from './services/notifications.service.js';

describe('Task System & Lifecycle', () => {
  let createdTaskId: string;

  const mockNoticeId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    // Isolate each test: the DB-level unique (user_id, source, source_id) guard for notice-sourced
    // tasks would otherwise see this suite's repeated fixture as a duplicate conversion.
    await pool.query('DELETE FROM task_reminders');
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');

    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [mockNoticeId, 'user_A', 'Scholarship Renewal Notice', 'Renewal documents required', 'scholarship', 'urgent', 'published'],
    );

    // Create a standalone task without any course attached
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', 'Bearer user_A')
      .send({
        title: 'Submit scholarship renewal documents',
        description: 'Take signed form to Academic Section room 102',
        dueDate: '2099-09-30',
        dueTime: '16:00',
        priority: 'urgent',
        reminder: '1d_before',
        source: 'notice',
        sourceId: mockNoticeId,
      });

    expect(res.status).toBe(201);
    createdTaskId = res.body.id;
  });

  it('creates standalone task with full metadata and null courseId', async () => {
    const res = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer user_A');

    expect(res.status).toBe(200);
    const task = res.body.find((t: { id: string }) => t.id === createdTaskId);
    expect(task).toBeDefined();
    expect(task.title).toBe('Submit scholarship renewal documents');
    expect(task.description).toBe('Take signed form to Academic Section room 102');
    expect(task.dueDate).toBe('2099-09-30');
    expect(task.dueTime).toBe('16:00');
    expect(task.priority).toBe('urgent');
    expect(task.reminder).toBe('1d_before');
    expect(task.source).toBe('notice');
    expect(task.sourceId).toBe(mockNoticeId);
    expect(task.courseId).toBeNull();
    expect(task.status).toBe('PENDING');
    expect(task.completedAt).toBeNull();
  });

  it('sets completedAt when toggled to COMPLETED', async () => {
    const statusRes = await request(app)
      .patch(`/api/assignments/${createdTaskId}/status`)
      .set('Authorization', 'Bearer user_A')
      .send({ status: 'COMPLETED' });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('COMPLETED');
    expect(statusRes.body.completedAt).toBeTruthy();
  });

  it('clears completedAt when toggled back to PENDING', async () => {
    // First complete it
    await request(app)
      .patch(`/api/assignments/${createdTaskId}/status`)
      .set('Authorization', 'Bearer user_A')
      .send({ status: 'COMPLETED' });

    // Then revert to PENDING
    const revertRes = await request(app)
      .patch(`/api/assignments/${createdTaskId}/status`)
      .set('Authorization', 'Bearer user_A')
      .send({ status: 'PENDING' });

    expect(revertRes.status).toBe(200);
    expect(revertRes.body.status).toBe('PENDING');
    expect(revertRes.body.completedAt).toBeNull();
  });

  it('prevents user_B from accessing or modifying user_A tasks', async () => {
    const getRes = await request(app)
      .get('/api/assignments')
      .set('Authorization', 'Bearer user_B');

    expect(getRes.status).toBe(200);
    expect(getRes.body.find((t: { id: string }) => t.id === createdTaskId)).toBeUndefined();

    const patchRes = await request(app)
      .patch(`/api/assignments/${createdTaskId}/status`)
      .set('Authorization', 'Bearer user_B')
      .send({ status: 'COMPLETED' });

    expect(patchRes.status).toBe(404);
  });
});

describe('Task Reminder Scheduling & Trigger Intelligence', () => {
  describe('Unit calculations: calculateReminderTriggerTime & helpers', () => {
    it('calculates 1d_before reminder trigger (24h before deadline)', () => {
      const trigger = calculateReminderTriggerTime('2026-09-20', '23:59', '1d_before');
      expect(trigger).not.toBeNull();
      // Expect 2026-09-19 at 23:59
      expect(trigger?.getFullYear()).toBe(2026);
      expect(trigger?.getMonth()).toBe(8); // September is month 8
      expect(trigger?.getDate()).toBe(19);
      expect(trigger?.getHours()).toBe(23);
      expect(trigger?.getMinutes()).toBe(59);
    });

    it('calculates 2h_before reminder trigger (2h before deadline)', () => {
      const trigger = calculateReminderTriggerTime('2026-09-20', '16:00', '2h_before');
      expect(trigger).not.toBeNull();
      expect(trigger?.getDate()).toBe(20);
      expect(trigger?.getHours()).toBe(14);
      expect(trigger?.getMinutes()).toBe(0);
    });

    it('calculates morning_of reminder trigger (09:00 AM on due date)', () => {
      const trigger = calculateReminderTriggerTime('2026-09-20', '17:00', 'morning_of');
      expect(trigger).not.toBeNull();
      expect(trigger?.getDate()).toBe(20);
      expect(trigger?.getHours()).toBe(9);
      expect(trigger?.getMinutes()).toBe(0);
    });

    it('calculates 2d_before reminder trigger (48h before deadline)', () => {
      const trigger = calculateReminderTriggerTime('2026-09-20', '23:59', '2d_before');
      expect(trigger).not.toBeNull();
      expect(trigger?.getDate()).toBe(18);
      expect(trigger?.getHours()).toBe(23);
      expect(trigger?.getMinutes()).toBe(59);
    });

    it('returns null when reminder is none or missing', () => {
      expect(calculateReminderTriggerTime('2026-09-20', '16:00', 'none')).toBeNull();
      expect(calculateReminderTriggerTime('2026-09-20', '16:00', null)).toBeNull();
      expect(calculateReminderTriggerTime('', '16:00', '1d_before')).toBeNull();
    });

    it('determines task overdue state accurately', () => {
      const afterDeadline = new Date(2026, 8, 20, 13, 0, 0);
      const beforeDeadline = new Date(2026, 8, 20, 11, 0, 0);

      const task = { dueDate: '2026-09-20', dueTime: '12:00', status: 'PENDING' };
      expect(isTaskOverdue(task, beforeDeadline)).toBe(false);
      expect(isTaskOverdue(task, afterDeadline)).toBe(true);

      // Completed task is NEVER overdue
      expect(isTaskOverdue({ ...task, status: 'COMPLETED' }, afterDeadline)).toBe(false);
    });

    it('checks if task reminder is due with isTaskReminderDue', () => {
      const task = {
        dueDate: '2026-09-20',
        dueTime: '12:00',
        reminder: '2h_before',
        status: 'PENDING',
      };
      // Trigger time is 10:00 AM on Sep 20, 2026
      const beforeTrigger = new Date(2026, 8, 20, 9, 30, 0);
      const afterTrigger = new Date(2026, 8, 20, 10, 30, 0);

      expect(isTaskReminderDue(task, beforeTrigger)).toBe(false);
      expect(isTaskReminderDue(task, afterTrigger)).toBe(true);

      // Completed task suppresses reminder
      expect(isTaskReminderDue({ ...task, status: 'COMPLETED' }, afterTrigger)).toBe(false);
    });
  });

  describe('End-to-End API: Reminder Delivery, Scheduling & Mutability', () => {
    it('does NOT trigger reminder at creation time for future deadlines (future reminder timing)', async () => {
      // Create a task due in 2099
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Future Capstone Project Submission',
          dueDate: '2099-12-31',
          dueTime: '23:59',
          reminder: '1d_before',
        });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.id;

      // Check notifications: Future reminder should NOT exist
      const notifRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');

      expect(notifRes.status).toBe(200);
      const reminder = notifRes.body.notifications.find((n: { id: string }) =>
        n.id.includes(`task-remind-${taskId}`)
      );
      expect(reminder).toBeUndefined();
    });

    it('does NOT trigger reminder when reminder is set to none (no reminder)', async () => {
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Optional Reading Session',
          dueDate: '2020-01-01', // Past date, but no reminder
          reminder: 'none',
        });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.id;

      const notifRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');

      const reminder = notifRes.body.notifications.find((n: { id: string }) =>
        n.id.includes(`task-remind-${taskId}`)
      );
      expect(reminder).toBeUndefined();
    });

    it('triggers in-app reminder when reminder trigger time has arrived (due reminder timing)', async () => {
      // Task with past due date and reminder set: trigger time has arrived
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Immediate Action Assignment',
          dueDate: '2020-01-01',
          dueTime: '12:00',
          reminder: '1d_before',
        });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.id;

      const notifRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');

      const reminder = notifRes.body.notifications.find((n: { id: string }) =>
        n.id.includes(`task-remind-${taskId}`)
      );
      expect(reminder).toBeDefined();
      expect(reminder.type).toBe('deadline_reminder');
      expect(reminder.isRead).toBe(false);
    });

    it('removes reminder when task due date is postponed into the future (changed due date)', async () => {
      // 1. Create task that is currently due
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Postponed Task Test',
          dueDate: '2020-01-01',
          dueTime: '12:00',
          reminder: '1d_before',
        });
      const taskId = createRes.body.id;

      // Verify reminder exists
      const beforeRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');
      expect(beforeRes.body.notifications.some((n: { id: string }) => n.id.includes(taskId))).toBe(true);

      // 2. Postpone due date to 2099
      const updateRes = await request(app)
        .put(`/api/assignments/${taskId}`)
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Postponed Task Test',
          dueDate: '2099-01-01',
          dueTime: '12:00',
          reminder: '1d_before',
        });
      expect(updateRes.status).toBe(200);

      // 3. Verify reminder is now removed from active notifications
      const afterRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');
      expect(afterRes.body.notifications.some((n: { id: string }) => n.id.includes(taskId))).toBe(false);
    });

    it('removes reminder when reminder rule is changed to none (changed reminder rule)', async () => {
      // 1. Create task currently due
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Rule Change Test',
          dueDate: '2020-01-01',
          dueTime: '12:00',
          reminder: '1d_before',
        });
      const taskId = createRes.body.id;

      // 2. Change reminder to none
      await request(app)
        .put(`/api/assignments/${taskId}`)
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Rule Change Test',
          dueDate: '2020-01-01',
          dueTime: '12:00',
          reminder: 'none',
        });

      // 3. Verify reminder is no longer generated
      const notifRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');
      expect(notifRes.body.notifications.some((n: { id: string }) => n.id.includes(taskId))).toBe(false);
    });

    it('suppresses reminder immediately when task is completed before/after reminder (completed task)', async () => {
      // 1. Create task currently due
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Task To Complete',
          dueDate: '2020-01-01',
          dueTime: '12:00',
          reminder: '1d_before',
        });
      const taskId = createRes.body.id;

      // 2. Mark as completed
      const statusRes = await request(app)
        .patch(`/api/assignments/${taskId}/status`)
        .set('Authorization', 'Bearer user_A')
        .send({ status: 'COMPLETED' });
      expect(statusRes.status).toBe(200);

      // 3. Verify reminder is suppressed
      const notifRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');
      expect(notifRes.body.notifications.some((n: { id: string }) => n.id.includes(taskId))).toBe(false);
    });

    it('prevents duplicate reminders and persists read/dismissal status (duplicate prevention)', async () => {
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', 'Bearer user_A')
        .send({
          title: 'Duplicate Prevention Test',
          dueDate: '2020-01-01',
          dueTime: '12:00',
          reminder: '1d_before',
        });
      const taskId = createRes.body.id;

      // 1. First fetch: exactly 1 reminder exists
      const firstRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');
      const matching = firstRes.body.notifications.filter((n: { id: string }) => n.id.includes(taskId));
      expect(matching.length).toBe(1);
      const reminderId = matching[0].id;
      expect(matching[0].isRead).toBe(false);

      // 2. Mark as read
      const markRes = await request(app)
        .patch(`/api/notifications/${reminderId}/read`)
        .set('Authorization', 'Bearer user_A');
      expect(markRes.status).toBe(200);

      // 3. Second fetch: exactly 1 reminder still exists, now marked isRead = true
      const secondRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer user_A');
      const matchingSecond = secondRes.body.notifications.filter((n: { id: string }) => n.id.includes(taskId));
      expect(matchingSecond.length).toBe(1);
      expect(matchingSecond[0].isRead).toBe(true);
    });
  });
});
