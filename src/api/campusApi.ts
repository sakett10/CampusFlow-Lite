import type { CampusItem } from '../lib/types';

export const campusApi = {
  getAll: async (token: string): Promise<CampusItem[]> => {
    const res = await fetch('/api/campus-items', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error('Failed to fetch items');
    return res.json();
  },

  create: async (token: string, item: Omit<CampusItem, 'id'>): Promise<CampusItem> => {
    const res = await fetch('/api/campus-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(item)
    });
    if (!res.ok) throw new Error('Failed to create item');
    return res.json();
  },

  delete: async (token: string, id: string, sourceType?: 'notice' | 'personal'): Promise<void> => {
    const endpoint = sourceType === 'notice' ? `/api/notices/${id}` : `/api/campus-items/${id}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to delete item (HTTP ${res.status})`);
    }
  },


  analyzeNotice: async (token: string, text: string): Promise<Partial<CampusItem>> => {
    const res = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'AI Analysis failed' }));
      throw new Error(error.error || 'AI Analysis failed');
    }
    return res.json();
  }
};
