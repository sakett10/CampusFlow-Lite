import { useState, useEffect, useCallback } from 'react';
import type { CampusItem } from '../lib/types';
import { campusApi } from '../api/campusApi';
import { useAuth } from '@clerk/clerk-react';

export function useCampusFeed() {
  const [items, setItems] = useState<CampusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      // GET is public, doesn't strictly need token, but we still call the api
      const data = await campusApi.getAll();
      setItems(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
  }, [loadItems]);

  const addItem = async (item: Omit<CampusItem, 'id'>) => {
    const token = await getToken();
    if (!token) throw new Error('Authentication required');

    const newItem = await campusApi.create(token, item);
    setItems(prev => [newItem, ...prev]);
    return newItem;
  };

  const deleteItem = async (id: string) => {
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');

      await campusApi.delete(token, id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err: unknown) {
      console.error('Failed to delete item:', err);
      throw err;
    }
  };

  return { items, isLoading, error, addItem, deleteItem, refresh: loadItems };
}
