export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isBrowserNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isBrowserNotificationSupported()) {
    return 'unsupported';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Failed to request browser notification permission:', err);
    return Notification.permission;
  }
}

export function sendBrowserNotification(
  title: string,
  options?: NotificationOptions & { onClickUrl?: string },
): Notification | null {
  if (!isBrowserNotificationSupported() || Notification.permission !== 'granted') {
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });

    if (options?.onClickUrl) {
      notification.onclick = () => {
        window.focus();
        window.location.href = options.onClickUrl!;
        notification.close();
      };
    }

    return notification;
  } catch (err) {
    console.error('Error dispatching browser notification:', err);
    return null;
  }
}
