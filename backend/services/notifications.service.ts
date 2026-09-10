import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import type { AppNotification, NotificationType, Notice } from '../types.js';

let dismissalTableEnsured = false;
async function ensureDismissalTable() {
  if (dismissalTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_dismissals (
        user_id TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, notification_id)
      );
    `);
    dismissalTableEnsured = true;
  } catch {
    // Continue even if table exists or migration script managed it
  }
}

export function getTaskDeadline(dueDate: string, dueTime?: string | null): Date | null {
  if (!dueDate) return null;
  const dateParts = dueDate.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(isNaN)) {
    return null;
  }
  const [year, month, day] = dateParts;

  let hours = 23;
  let minutes = 59;
  if (dueTime && dueTime.trim()) {
    const timeParts = dueTime.trim().split(':').map(Number);
    if (timeParts.length >= 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
      hours = timeParts[0];
      minutes = timeParts[1];
    }
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function calculateReminderTriggerTime(
  dueDate: string,
  dueTime?: string | null,
  reminderRule?: string | null,
): Date | null {
  if (!dueDate || !reminderRule || reminderRule === 'none') {
    return null;
  }

  const deadline = getTaskDeadline(dueDate, dueTime);
  if (!deadline) return null;

  const dateParts = dueDate.split('-').map(Number);
  const [year, month, day] = dateParts;

  switch (reminderRule) {
    case '2h_before':
      return new Date(deadline.getTime() - 2 * 60 * 60 * 1000);
    case 'morning_of': {
      const morningOf = new Date(year, month - 1, day, 9, 0, 0, 0);
      if (morningOf.getTime() >= deadline.getTime()) {
        return new Date(deadline.getTime() - 2 * 60 * 60 * 1000);
      }
      return morningOf;
    }
    case '1d_before':
      return new Date(deadline.getTime() - 24 * 60 * 60 * 1000);
    case '2d_before':
      return new Date(deadline.getTime() - 48 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export function isTaskOverdue(
  task: {
    dueDate: string;
    dueTime?: string | null;
    status: string;
  },
  now: Date = new Date(),
): boolean {
  if (task.status === 'COMPLETED') return false;
  const deadline = getTaskDeadline(task.dueDate, task.dueTime);
  if (!deadline) return false;
  return now.getTime() > deadline.getTime();
}

export function isTaskReminderDue(
  task: {
    dueDate: string;
    dueTime?: string | null;
    reminder?: string | null;
    status: string;
  },
  now: Date = new Date(),
): boolean {
  if (task.status === 'COMPLETED') return false;
  const trigger = calculateReminderTriggerTime(task.dueDate, task.dueTime, task.reminder);
  if (!trigger) return false;
  return now.getTime() >= trigger.getTime();
}

export const notificationsService = {
  create: async (data: {
    userId?: string | null;
    recipientRole?: 'all' | 'student' | 'reviewer';
    title: string;
    message: string;
    type: NotificationType;
    noticeId?: string | null;
    link?: string | null;
  }): Promise<AppNotification> => {
    const id = randomUUID();
    const recipientRole = data.recipientRole || 'all';

    const { rows } = await pool.query(
      `
      INSERT INTO notifications (
        id, user_id, recipient_role, title, message, type, notice_id, link, read_by, is_read, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [
        id,
        data.userId || null,
        recipientRole,
        data.title,
        data.message,
        data.type,
        data.noticeId || null,
        data.link || null,
        JSON.stringify([]),
        false,
      ],
    );

    const row = rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      recipientRole: row.recipient_role,
      title: row.title,
      message: row.message,
      type: row.type,
      noticeId: row.notice_id,
      link: row.link,
      isRead: row.is_read || false,
      createdAt: row.created_at,
    };
  },

  getAllForUser: async (userId: string, isReviewer = false): Promise<AppNotification[]> => {
    await ensureDismissalTable();

    // Fetch dismissed notification IDs for this user
    let dismissedIds = new Set<string>();
    try {
      const { rows: dismissalRows } = await pool.query(
        'SELECT notification_id FROM notification_dismissals WHERE user_id = $1',
        [userId],
      );
      dismissedIds = new Set(dismissalRows.map((r) => r.notification_id as string));
    } catch {
      // Continue even if table lookup fails
    }

    // 1. Fetch persisted notifications based on role
    const roleFilter = isReviewer ? `('all', 'reviewer')` : `('all', 'student')`;
    const { rows } = await pool.query(
      `
      SELECT * FROM notifications
      WHERE (user_id = $1 OR (user_id IS NULL AND recipient_role IN ${roleFilter}))
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [userId],
    );

    const persisted: AppNotification[] = rows
      .filter((row) => {
        // Enforce student security rule: Students must NEVER see pending_review notifications
        if (!isReviewer && row.type === 'pending_review') {
          return false;
        }
        return true;
      })
      .map((row) => {
        const readBy = Array.isArray(row.read_by) ? row.read_by : [];
        const isRead =
          dismissedIds.has(row.id) ||
          (row.user_id ? Boolean(row.is_read) : readBy.includes(userId));
        return {
          id: row.id,
          userId: row.user_id,
          recipientRole: row.recipient_role,
          title: row.title,
          message: row.message,
          type: row.type,
          noticeId: row.notice_id,
          link: row.link,
          isRead,
          createdAt: row.created_at,
        };
      });

    // 2. Compute dynamic deadline reminders for published notices with real dates
    // Must strictly apply the same source_account_email / creator visibility rules as noticesService.getAll/getById
    const dynamicReminders: AppNotification[] = [];
    try {
      const reviewerIds = (process.env.REVIEWER_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      const isNonProd = process.env.NODE_ENV !== 'production';
      const authorizedReviewers = Array.from(new Set(['admin', ...reviewerIds, ...adminIds]));

      const { rows: publishedRows } = await pool.query(
        `
        SELECT id, title, important_dates
        FROM notices
        WHERE status = 'published'
          AND important_dates IS NOT NULL
          AND (
            source_account_email IS NULL
            OR created_by_user_id = ANY($1::text[])
            OR ($2 AND created_by_user_id LIKE 'reviewer%')
            OR created_by_user_id = $3
          )
        `,
        [authorizedReviewers, isNonProd, userId],
      );

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      for (const notice of publishedRows) {
        const dates = (notice.important_dates as Array<{ label: string; date: string }>) || [];
        for (const d of dates) {
          if (!d.date) continue;
          const dateStr = d.date.split('T')[0];

          let reminderMessage = '';
          if (dateStr === todayStr) {
            reminderMessage = `Deadline Today: ${d.label} for "${notice.title}"`;
          } else if (dateStr === tomorrowStr) {
            reminderMessage = `Deadline Tomorrow: ${d.label} for "${notice.title}"`;
          }

          if (reminderMessage) {
            const reminderId = `deadline-${notice.id}-${dateStr}`;
            dynamicReminders.push({
              id: reminderId,
              userId,
              recipientRole: 'all',
              title: '⏰ Upcoming Deadline',
              message: reminderMessage,
              type: 'deadline_reminder',
              noticeId: notice.id,
              link: `/notice-board`,
              isRead: dismissedIds.has(reminderId),
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // Ignore if notices table not available
    }

    // 3. Compute dynamic task deadline reminders for active tasks with reminder rules
    try {
      const { rows: taskRows } = await pool.query(
        `
        SELECT id, title, due_date, due_time, reminder, priority, status
        FROM assignments
        WHERE user_id = $1 AND status != 'COMPLETED' AND reminder IS NOT NULL AND reminder != 'none'
        `,
        [userId],
      );

      const now = new Date();
      for (const t of taskRows) {
        const triggerTime = calculateReminderTriggerTime(t.due_date, t.due_time, t.reminder);
        if (triggerTime && now.getTime() >= triggerTime.getTime()) {
          const reminderId = `task-remind-${t.id}-${t.due_date}-${t.due_time || '23:59'}-${t.reminder}`;
          const isRead = dismissedIds.has(reminderId);
          const deadline = getTaskDeadline(t.due_date, t.due_time);
          const isOverdue = deadline ? now.getTime() > deadline.getTime() : false;
          const timeStr = t.due_time ? ` at ${t.due_time}` : '';

          const notifTitle = isOverdue ? '⚠️ Overdue Task' : '⏰ Task Deadline Reminder';
          const notifMsg = isOverdue
            ? `Overdue: "${t.title}" was due on ${t.due_date}${timeStr}.`
            : `Reminder: "${t.title}" is due on ${t.due_date}${timeStr}.`;

          dynamicReminders.push({
            id: reminderId,
            userId,
            recipientRole: 'student',
            title: notifTitle,
            message: notifMsg,
            type: 'deadline_reminder',
            link: '/assignments',
            isRead,
            createdAt: triggerTime.toISOString(),
          });
        }
      }
    } catch {
      // Continue even if assignments table lookup fails in isolated test environments
    }

    return [...dynamicReminders, ...persisted];
  },

  markAsRead: async (userId: string, notificationId: string): Promise<void> => {
    await ensureDismissalTable();

    // Persist dismissal record for this user
    try {
      await pool.query(
        `INSERT INTO notification_dismissals (user_id, notification_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, notification_id) DO NOTHING`,
        [userId, notificationId],
      );
    } catch {
      // Continue even if insertion fails
    }

    // If it is a dynamic reminder, dismissal record above is sufficient
    if (notificationId.startsWith('deadline-') || notificationId.startsWith('task-remind-')) {
      return;
    }

    const { rows } = await pool.query('SELECT user_id, read_by FROM notifications WHERE id = $1', [notificationId]);
    if (rows.length > 0) {
      const notif = rows[0];
      if (notif.user_id === userId) {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [notificationId]);
      } else if (notif.user_id == null) {
        const readBy = Array.isArray(notif.read_by) ? notif.read_by : [];
        if (!readBy.includes(userId)) {
          readBy.push(userId);
          await pool.query(
            'UPDATE notifications SET read_by = $1 WHERE id = $2',
            [JSON.stringify(readBy), notificationId],
          );
        }
      }
    }
  },

  markAllAsRead: async (userId: string): Promise<void> => {
    await ensureDismissalTable();

    // 1. Mark personal notifications as read
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);

    // 2. Mark broadcast notifications as read for this specific user via read_by
    const { rows } = await pool.query('SELECT id, read_by FROM notifications WHERE user_id IS NULL');
    for (const row of rows) {
      const readBy = Array.isArray(row.read_by) ? row.read_by : [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        await pool.query(
          'UPDATE notifications SET read_by = $1 WHERE id = $2',
          [JSON.stringify(readBy), row.id],
        );
      }
    }

    // 3. Mark current dynamic reminders as dismissed for this user
    try {
      const currentNotifications = await notificationsService.getAllForUser(userId, true);
      const dynamicIds = currentNotifications
        .filter((n) => n.id.startsWith('deadline-') || n.id.startsWith('task-remind-'))
        .map((n) => n.id);
      for (const dId of dynamicIds) {
        await pool.query(
          `INSERT INTO notification_dismissals (user_id, notification_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, notification_id) DO NOTHING`,
          [userId, dId],
        );
      }
    } catch {
      // Continue even if dynamic dismissal fails
    }
  },

  notifyPendingReview: async (pendingCount: number): Promise<void> => {
    if (pendingCount <= 0) return;
    await notificationsService.create({
      recipientRole: 'reviewer',
      type: 'pending_review',
      title: 'New notices require review',
      message:
        pendingCount === 1
          ? '1 new notice is pending review.'
          : `${pendingCount} notices are pending review.`,
      link: '/notice-board?tab=pending',
    });
  },

  notifyNoticePublished: async (notice: Notice): Promise<void> => {
    const { rows } = await pool.query(
      "SELECT id FROM notifications WHERE notice_id = $1 AND type = 'notice_published' LIMIT 1",
      [notice.id],
    );
    if (rows.length > 0) {
      return;
    }

    await notificationsService.create({
      recipientRole: 'all',
      type: 'notice_published',
      noticeId: notice.id,
      title: '📢 New Campus Notice',
      message: notice.title,
      link: '/notice-board',
    });
  },
};

