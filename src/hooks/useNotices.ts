import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import type { Notice, NoticeCandidate, NoticeCategory, NoticePriority, NoticeStatus } from '../lib/types';

export interface NoticeFiltersState {
  status?: NoticeStatus | 'all';
  category?: NoticeCategory | 'all';
  priority?: NoticePriority | 'all';
  search?: string;
  month?: string;
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
        if (
          typeof window !== 'undefined' &&
          (new URLSearchParams(window.location.search).get('demo') === '1' ||
            window.sessionStorage?.getItem('cf_demo') === '1')
        ) {
          setNotices(getDemoNotices());
          setError(null);
          return;
        }
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
      if (active.month && active.month !== 'all') {
        params.set('month', active.month);
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

  // Reset notices when the authenticated user identity changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotices([]);
    setError(null);
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotices();
  }, [loadNotices]);

  useEffect(() => {
    const handleRefresh = () => {
      loadNotices();
    };
    window.addEventListener('campusflow:refresh-notices', handleRefresh);
    return () => {
      window.removeEventListener('campusflow:refresh-notices', handleRefresh);
    };
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

  const convertToTask = async (
    id: string,
    customData?: {
      title?: string;
      dueDate?: string;
      dueTime?: string | null;
      reminder?: string | null;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      courseId?: string | null;
    },
  ) => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) throw new Error('Authentication required');

    const response = await fetch(`/api/notices/${id}/convert-to-task`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(customData || {}),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to convert notice to task');
    }

    const data: { task: unknown; notice: Notice; alreadyConverted: boolean } = await response.json();
    setNotices((prev) => prev.map((n) => (n.id === id ? data.notice : n)));
    return data;
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
    convertToTask,
  };
}

function getDemoNotices(): Notice[] {
  const today = new Date().toISOString().split('T')[0];
  const in3Days = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
  const in6Days = new Date(Date.now() + 86400000 * 6).toISOString().split('T')[0];

  return [
    {
      id: 'demo-notice-1',
      createdByUserId: 'demo_user',
      title: 'Mid-Semester Project Proposal Submission & Presentation Schedule',
      summary:
        'All enrolled undergraduate students must submit their capstone project proposals via the departmental academic portal before the deadline.',
      category: 'academic',
      priority: 'urgent',
      actionRequired:
        'Submit 4-page PDF proposal documentation and confirm faculty mentor assignment.',
      importantDates: [
        { label: 'Proposal Submission Deadline', date: `${today} 23:59` },
        { label: 'Evaluation Panel Presentations', date: `${in6Days} 10:00` },
      ],
      venue: 'Department Seminar Hall & Virtual Portal',
      sourceProvider: 'gmail',
      sourceSender: 'Office of Dean Academics <academics@campus.edu>',
      sourceSubject: 'Urgent: Mid-Semester Capstone Project Submissions',
      status: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'demo-notice-2',
      createdByUserId: 'demo_user',
      title: 'Annual Inter-College Autonomous Robotics & AI Challenge 2026',
      summary:
        'Registrations are open for the annual multi-university robotics competition. Tracks include vision navigation, LLM agent swarms, and drone routing.',
      category: 'event',
      priority: 'important',
      actionRequired:
        'Register teams of 3-4 members and submit project abstracts.',
      importantDates: [
        { label: 'Early Registration Closes', date: `${in3Days} 18:00` },
      ],
      venue: 'Main Campus Gymnasium & Makerspace',
      sourceProvider: 'official_feed',
      sourceSender: 'Robotics & AI Society <robotics@campus.edu>',
      sourceSubject: 'Robotics Challenge 2026 Announcement',
      status: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'demo-notice-3',
      createdByUserId: 'demo_user',
      title: 'Campus Central Library Extended Study Hours & Quiet Zones',
      summary:
        'Beginning this week, the central university library will remain open 24/7 with dedicated silent floors for mid-semester study.',
      category: 'general',
      priority: 'normal',
      actionRequired: null,
      importantDates: [],
      venue: 'Central University Library Floors 2-4',
      sourceProvider: 'official_feed',
      sourceSender: 'University Librarian <library@campus.edu>',
      sourceSubject: 'Extended Study Hours for Examinations',
      status: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    },
  ];
}
