/**
 * Helper to convert a Base64 VAPID public key to a Uint8Array required by PushManager.subscribe.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushNotificationState =
  | 'unsupported'
  | 'permission_denied'
  | 'permission_default'
  | 'push_active'
  | 'push_inactive'
  | 'error';

export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushNotificationSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error('Service worker registration failed:', err);
    return null;
  }
}

export async function getPushSubscriptionState(): Promise<{
  state: PushNotificationState;
  permission: NotificationPermission | 'unsupported';
  subscription: PushSubscription | null;
}> {
  if (!isPushNotificationSupported()) {
    return { state: 'unsupported', permission: 'unsupported', subscription: null };
  }

  const permission = Notification.permission;
  if (permission === 'denied') {
    return { state: 'permission_denied', permission, subscription: null };
  }
  if (permission === 'default') {
    return { state: 'permission_default', permission, subscription: null };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      return { state: 'push_active', permission, subscription: sub };
    }
    return { state: 'push_inactive', permission, subscription: null };
  } catch (err) {
    console.error('Error inspecting push subscription state:', err);
    return { state: 'error', permission, subscription: null };
  }
}

export async function subscribeToPush(
  getToken: () => Promise<string | null>,
): Promise<{ success: boolean; error?: string }> {
  if (!isPushNotificationSupported()) {
    return { success: false, error: 'Web Push notifications are not supported by this browser.' };
  }

  try {
    // 1. Explicit user-triggered permission request
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: permission === 'denied'
          ? 'Notification permission was denied. Please allow notifications in your browser address bar.'
          : 'Notification permission was not granted.',
      };
    }

    // 2. Ensure Service Worker is registered
    let reg = await registerServiceWorker();
    if (!reg) {
      reg = await navigator.serviceWorker.ready;
    }

    // 3. Fetch VAPID public key
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const vapidRes = await fetch('/api/notifications/push/vapid-key', { headers });
    if (!vapidRes.ok) {
      throw new Error('Failed to retrieve Web Push credentials from server.');
    }
    const { publicKey } = await vapidRes.json();
    if (!publicKey) {
      throw new Error('Push notification service is not configured with VAPID credentials.');
    }

    // 4. Subscribe via PushManager
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });
    }

    // 5. Send subscription to backend
    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      throw new Error('Invalid push subscription returned by browser.');
    }

    const saveRes = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        userAgent: navigator.userAgent,
      }),
    });

    if (!saveRes.ok) {
      const errData = await saveRes.json().catch(() => ({}));
      throw new Error(errData.error || 'Server failed to save push subscription.');
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to subscribe to Web Push:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function unsubscribeFromPush(
  getToken: () => Promise<string | null>,
): Promise<{ success: boolean; error?: string }> {
  if (!isPushNotificationSupported()) return { success: true };

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/notifications/push/unsubscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpoint }),
      }).catch((e) => console.warn('Failed to notify server of push unsubscription:', e));
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to unsubscribe from Web Push:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTestWebPush(
  getToken: () => Promise<string | null>,
): Promise<{ success: boolean; message: string }> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/notifications/push/test', {
      method: 'POST',
      headers,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.message || data.error || 'Failed to trigger test notification.',
      };
    }

    return {
      success: true,
      message: data.message || 'Test notification dispatched to your desktop.',
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Network error sending test notification',
    };
  }
}

/**
 * Detects the client's current IANA timezone.
 */
export function getClientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
