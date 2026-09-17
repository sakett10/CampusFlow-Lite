import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  urlBase64ToUint8Array,
  isPushNotificationSupported,
  getClientTimezone,
  getPushSubscriptionState,
  sendTestWebPush,
} from './pushNotifications';

describe('pushNotifications lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts base64 url-safe string to Uint8Array', () => {
    const testBase64 = 'BA1234_-';
    const uint8 = urlBase64ToUint8Array(testBase64);
    expect(uint8).toBeInstanceOf(Uint8Array);
    expect(uint8.length).toBeGreaterThan(0);
  });

  it('detects client timezone or defaults to UTC', () => {
    const tz = getClientTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  it('checks if push notifications are supported', () => {
    const supported = isPushNotificationSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('inspects subscription state when unsupported', async () => {
    const originalNavigator = globalThis.navigator;
    // @ts-expect-error Mocking partial navigator
    globalThis.navigator = {};

    const state = await getPushSubscriptionState();
    expect(state.state).toBe('unsupported');

    globalThis.navigator = originalNavigator;
  });

  it('handles sendTestWebPush failure gracefully', async () => {
    const mockGetToken = vi.fn().mockResolvedValue('test-token');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'VAPID keys not configured' }),
    });

    const res = await sendTestWebPush(mockGetToken);
    expect(res.success).toBe(false);
    expect(res.message).toContain('VAPID keys not configured');
  });

  it('handles sendTestWebPush success', async () => {
    const mockGetToken = vi.fn().mockResolvedValue('test-token');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Dispatched to 1 device' }),
    });

    const res = await sendTestWebPush(mockGetToken);
    expect(res.success).toBe(true);
    expect(res.message).toBe('Dispatched to 1 device');
  });
});
