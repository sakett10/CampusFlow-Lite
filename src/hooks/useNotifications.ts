import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { AppNotification } from '../lib/types';
import { sendBrowserNotification } from '../lib/browserNotifications';

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isInitialMountRef = useRef<boolean>(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/notifications', { headers });
      if (!response.ok) {
        throw new Error(`Failed to load notifications: ${response.statusText}`);
      }

      const data = await response.json();
      const items: AppNotification[] = data.notifications || [];

      // Check for newly arrived notifications for browser notification
      if (!isInitialMountRef.current) {
        for (const item of items) {
          if (!item.isRead && !knownIdsRef.current.has(item.id)) {
            sendBrowserNotification(item.title, {
              body: item.message,
              onClickUrl: item.link || '/notice-board',
            });
          }
        }
      }

      isInitialMountRef.current = false;
      knownIdsRef.current = new Set(items.map((i) => i.id));

      setNotifications(items);
      setUnreadCount(data.unreadCount ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchNotifications();
    const interval = setInterval(() => {
      void fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);





  const markAsRead = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
          method: 'POST',
          headers,
        });
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    },
    [getToken],
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers,
      });
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }, [getToken]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
