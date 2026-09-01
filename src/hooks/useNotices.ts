import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import type { Notice, NoticeCandidate, NoticeCategory, NoticePriority, NoticeStatus } from '../lib/types';

export interface NoticeFiltersState {
  status?: NoticeStatus | 'all';
  category?: NoticeCategory | 'all';
  priority?: NoticePriority | 'all';
  search?: string;
}

export function useNotices(initialFilters?: NoticeFiltersState) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<NoticeFiltersState>(initialFilters || { status: 'all', category: 'all', priority: 'all', search: '' });

  const { getToken } = useAuth();
  const { user } = useUser();

  const isReviewer = Boolean(
    user?.publicMetadata?.role === 'reviewer' ||
    user?.publicMetadata?.role === 'admin'
  );

  const getAuthHeaders = useCallback(async () => {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [getToken]);

  const loadNotices = useCallback(async (customFilters?: NoticeFiltersState) => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setNotices([]);
        setError('Authentication required');
        return;
      }

      const active = customFilters || filters;
      const params = new URLSearchParams();

      if (active.status && active.status !== 'all') {
        params.set('status', active.status);
      }
      if (active.category && active.category !== 'all') {
        params.set('category', active.category);
      }
      if (active.priority && active.priority !== 'all') {
        params.set('priority', active.priority);
      }
      if (active.search && active.search.trim()) {
        params.set('search', active.search.trim());
      }

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/notices${queryStr}`, {
        headers,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status} Error`);
      }

      const data = await response.json();
      setNotices(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load notices');
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders, filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotices();
  }, [loadNotices]);

  const approveNotice = async (id: string) => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) throw new Error('Authentication required');

    const response = await fetch(`/api/notices/${id}/approve`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to approve notice');
    }

    const updated: Notice = await response.json();
    setNotices((prev) => prev.map((n) => (n.id === id ? updated : n)));
    return updated;
  };

  const publishNotice = async (id: string) => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) throw new Error('Authentication required');

    const response = await fetch(`/api/notices/${id}/publish`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to publish notice');
    }

    const updated: Notice = await response.json();
    setNotices((prev) => prev.map((n) => (n.id === id ? updated : n)));
    return updated;
  };

  const rejectNotice = async (id: string) => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) throw new Error('Authentication required');

    const response = await fetch(`/api/notices/${id}/reject`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to reject notice');
    }

    const updated: Notice = await response.json();
    setNotices((prev) => prev.map((n) => (n.id === id ? updated : n)));
    return updated;
  };

  const archiveNotice = async (id: string) => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) throw new Error('Authentication required');

    const response = await fetch(`/api/notices/${id}/archive`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to archive notice');
    }

    const updated: Notice = await response.json();
    setNotices((prev) => prev.map((n) => (n.id === id ? updated : n)));
    return updated;
  };

  const updateNotice = async (id: string, updates: Partial<NoticeCandidate>) => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) throw new Error('Authentication required');

    const response = await fetch(`/api/notices/${id}`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update notice');
    }

    const updated: Notice = await response.json();
    setNotices((prev) => prev.map((n) => (n.id === id ? updated : n)));
    return updated;
  };

  const deleteNotice = async (id: string) => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) throw new Error('Authentication required');

    const response = await fetch(`/api/notices/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete notice');
    }

    setNotices((prev) => prev.filter((n) => n.id !== id));
  };

  const ingestFromGmail = async (messageId: string) => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) throw new Error('Authentication required');

    const response = await fetch(`/api/notices/from-gmail/${encodeURIComponent(messageId)}`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to ingest notice from Gmail');
    }


    const created: Notice = await response.json();
    setNotices((prev) => [created, ...prev]);
    return created;
  };

  return {
    notices,
    isLoading,
    error,
    isReviewer,
    filters,
    setFilters,
    refresh: loadNotices,
    approveNotice,
    publishNotice,
    rejectNotice,
    archiveNotice,
    updateNotice,
    deleteNotice,
    ingestFromGmail,
  };
}
