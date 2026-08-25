import type { CampusItem } from '../lib/types';

export const campusApi = {
  getAll: async (): Promise<CampusItem[]> => {
    const res = await fetch('/api/campus-items');
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

  delete: async (token: string, id: string): Promise<void> => {
    const res = await fetch(`/api/campus-items/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error('Failed to delete item');
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
