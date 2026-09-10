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
            triggerSyncRef.current();
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
