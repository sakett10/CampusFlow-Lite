import type { CampusItem } from '../lib/types';

export const campusApi = {
  getAll: async (): Promise<CampusItem[]> => {
    const res = await fetch('/api/campus-items');
    if (!res.ok) throw new Error('Failed to fetch items');
    return res.json();
  },
  
  create: async (item: Omit<CampusItem, 'id'>): Promise<CampusItem> => {
    const res = await fetch('/api/campus-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    if (!res.ok) throw new Error('Failed to create item');
    return res.json();
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`/api/campus-items/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete item');
  },

  analyzeNotice: async (text: string): Promise<Partial<CampusItem>> => {
    const res = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'AI Analysis failed' }));
      throw new Error(error.error || 'AI Analysis failed');
    }
    return res.json();
  }
};
