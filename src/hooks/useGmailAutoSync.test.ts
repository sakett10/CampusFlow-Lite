import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGmailAutoSync } from './useGmailAutoSync';

const mockGetToken = vi.fn();

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

globalThis.fetch = vi.fn();

describe('useGmailAutoSync Hook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetToken.mockResolvedValue('fake-token');
    window.sessionStorage.clear();
  });

  it('skips auto-sync on mount if server updatedAt is within the 10-minute cooldown', async () => {
    const recentSyncTime = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3 mins ago

    (globalThis.fetch as Mock).mockImplementation(async (url: string) => {
      if (url === '/api/gmail/status') {
        return {
          ok: true,
          json: async () => ({ connected: true, updatedAt: recentSyncTime }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { result } = renderHook(() => useGmailAutoSync(300000, true));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Should NOT have called /api/gmail/sync because of recent server updatedAt
    const syncCalls = (globalThis.fetch as Mock).mock.calls.filter(([url]) => url === '/api/gmail/sync');
    expect(syncCalls.length).toBe(0);
  });

  it('skips auto-sync on mount if client sessionStorage records a sync within 10 minutes', async () => {
    const recentTime = Date.now() - 2 * 60 * 1000; // 2 mins ago
    window.sessionStorage.setItem('campusflow:last_auto_sync', String(recentTime));

    (globalThis.fetch as Mock).mockImplementation(async (url: string) => {
      if (url === '/api/gmail/status') {
        return {
          ok: true,
          json: async () => ({ connected: true, updatedAt: null }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { result } = renderHook(() => useGmailAutoSync(300000, true));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Should NOT have called /api/gmail/sync because of sessionStorage
    const syncCalls = (globalThis.fetch as Mock).mock.calls.filter(([url]) => url === '/api/gmail/sync');
    expect(syncCalls.length).toBe(0);
  });

  it('triggers auto-sync on mount if no recent sync in server updatedAt or sessionStorage', async () => {
    const oldSyncTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 mins ago

    (globalThis.fetch as Mock).mockImplementation(async (url: string) => {
      if (url === '/api/gmail/status') {
        return {
          ok: true,
          json: async () => ({ connected: true, updatedAt: oldSyncTime }),
        };
      }
      if (url === '/api/gmail/sync') {
        return {
          ok: true,
          json: async () => ({ checked: 5, newMessages: 1, processed: 1 }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { result } = renderHook(() => useGmailAutoSync(300000, true));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
      expect(result.current.syncStats?.checked).toBe(5);
    });

    // Should have updated sessionStorage
    expect(window.sessionStorage.getItem('campusflow:last_auto_sync')).not.toBeNull();
  });

  it('allows manual triggerSync to bypass mount cooldown', async () => {
    const recentSyncTime = new Date(Date.now() - 1 * 60 * 1000).toISOString(); // 1 min ago
    window.sessionStorage.setItem('campusflow:last_auto_sync', String(Date.now() - 1 * 60 * 1000));

    (globalThis.fetch as Mock).mockImplementation(async (url: string) => {
      if (url === '/api/gmail/status') {
        return {
          ok: true,
          json: async () => ({ connected: true, updatedAt: recentSyncTime }),
        };
      }
      if (url === '/api/gmail/sync') {
        return {
          ok: true,
          json: async () => ({ checked: 10, processed: 2 }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { result } = renderHook(() => useGmailAutoSync(300000, true));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Initial mount skipped sync
    let syncCalls = (globalThis.fetch as Mock).mock.calls.filter(([url]) => url === '/api/gmail/sync');
    expect(syncCalls.length).toBe(0);

    // User explicitly clicks sync button
    await act(async () => {
      await result.current.triggerSync();
    });

    syncCalls = (globalThis.fetch as Mock).mock.calls.filter(([url]) => url === '/api/gmail/sync');
    expect(syncCalls.length).toBe(1);
    expect(result.current.syncStats?.checked).toBe(10);
  });
});
