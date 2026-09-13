import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { GmailSyncStats } from '../lib/types';

export function useGmailAutoSync(intervalMs = 300000, enabled = true) { // 5 minutes default
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStats, setSyncStats] = useState<GmailSyncStats | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { getToken } = useAuth();
  const isSyncingRef = useRef(false);
  const isConnectedRef = useRef(isConnected);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  const triggerSync = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/gmail/sync', {
        method: 'POST',
        headers,
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 404) {
          setIsConnected(false);
          return;
        }
        throw new Error(data.error || 'Failed to sync Gmail');
      }

      setSyncStats({
        checked: data.checked ?? 0,
        newMessages: data.newMessages ?? 0,
        skipped: data.skipped ?? 0,
        processed: data.processed ?? 0,
        failed: data.failed ?? 0,
        emailsPersisted: data.emailsPersisted ?? 0,
        analysesFailed: data.analysesFailed ?? 0,
        noticesCreated: data.noticesCreated ?? 0,
      });
      setLastSyncTime(new Date());

      if (typeof window !== 'undefined' && ((data.noticesCreated ?? 0) > 0 || (data.emailsPersisted ?? 0) > 0)) {
        window.dispatchEvent(new CustomEvent('campusflow:refresh-notices'));
        window.dispatchEvent(new CustomEvent('campusflow:refresh-tasks'));
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [getToken]);

  const triggerSyncRef = useRef(triggerSync);

  useEffect(() => {
    triggerSyncRef.current = triggerSync;
  }, [triggerSync]);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const checkStatusAndInitialSync = async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch('/api/gmail/status', { headers });
        if (!res.ok) return;

        const data = await res.json();
        if (isMounted) {
          const connected = Boolean(data.connected);
          setIsConnected(connected);
          if (connected) {
            // Conservative auto-sync cooldown: 10 minutes (600,000ms)
            // Checks server updatedAt or client sessionStorage to prevent thundering herd on mount/refresh
            const AUTO_SYNC_COOLDOWN_MS = 10 * 60 * 1000;
            const now = Date.now();
            let shouldAutoSync = true;

            // 1. Check server-provided last sync timestamp (updatedAt from gmail_connections)
            if (data.updatedAt) {
              const serverLastSync = new Date(data.updatedAt).getTime();
              if (!Number.isNaN(serverLastSync) && now - serverLastSync < AUTO_SYNC_COOLDOWN_MS) {
                shouldAutoSync = false;
              }
            }

            // 2. Check client-side fallback storage (protects against rapid page refreshes, tab duplications)
            if (shouldAutoSync && typeof window !== 'undefined' && window.sessionStorage) {
              try {
                const clientLastSyncStr = window.sessionStorage.getItem('campusflow:last_auto_sync');
                if (clientLastSyncStr) {
                  const clientLastSync = Number(clientLastSyncStr);
                  if (!Number.isNaN(clientLastSync) && now - clientLastSync < AUTO_SYNC_COOLDOWN_MS) {
                    shouldAutoSync = false;
                  }
                }
              } catch {
                // Ignore storage access errors
              }
            }

            if (shouldAutoSync) {
              if (typeof window !== 'undefined' && window.sessionStorage) {
                try {
                  window.sessionStorage.setItem('campusflow:last_auto_sync', String(now));
                } catch {
                  // Ignore storage access errors
                }
              }
              triggerSyncRef.current();
            }
          }
        }
      } catch {
        // Ignore status check errors
      }
    };

    checkStatusAndInitialSync();

    const interval = setInterval(() => {
      if (isConnectedRef.current) {
        triggerSyncRef.current();
      }
    }, intervalMs);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [getToken, intervalMs, enabled]);

  return {
    isConnected,
    isSyncing,
    lastSyncTime,
    syncStats,
    syncError,
    triggerSync,
  };
}
