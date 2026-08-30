import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import type { AppNotification, NotificationType, Notice } from '../types.js';

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
        const isRead = row.is_read || readBy.includes(userId);
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
    const dynamicReminders: AppNotification[] = [];
    try {
      const { rows: publishedRows } = await pool.query(
        `
        SELECT id, title, important_dates
        FROM notices
        WHERE status = 'published' AND important_dates IS NOT NULL
        `,
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
            dynamicReminders.push({
              id: `deadline-${notice.id}-${dateStr}`,
              userId,
              recipientRole: 'all',
              title: '⏰ Upcoming Deadline',
              message: reminderMessage,
              type: 'deadline_reminder',
              noticeId: notice.id,
              link: `/notice-board`,
              isRead: false,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // Ignore if notices table not available
    }

    return [...dynamicReminders, ...persisted];
  },

  markAsRead: async (userId: string, notificationId: string): Promise<void> => {
    // If it is a dynamic reminder, ignore database update
    if (notificationId.startsWith('deadline-')) {
      return;
    }

    const { rows } = await pool.query('SELECT read_by FROM notifications WHERE id = $1', [notificationId]);
    if (rows.length > 0) {
      const readBy = Array.isArray(rows[0].read_by) ? rows[0].read_by : [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        await pool.query(
          'UPDATE notifications SET read_by = $1, is_read = TRUE WHERE id = $2',
          [JSON.stringify(readBy), notificationId],
        );
      }
    }
  },

  markAllAsRead: async (userId: string): Promise<void> => {
    await pool.query(
      `
      UPDATE notifications 
      SET is_read = TRUE 
      WHERE user_id = $1 OR user_id IS NULL
      `,
      [userId],
    );
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

