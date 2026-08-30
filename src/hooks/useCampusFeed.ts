import { useState, useEffect, useCallback } from 'react';
import type { CampusItem } from '../lib/types';
import { campusApi } from '../api/campusApi';
import { useAuth, useUser } from '@clerk/clerk-react';

export function useCampusFeed() {
  const [items, setItems] = useState<CampusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();
  const { user } = useUser();

  const isReviewer = Boolean(
    user?.publicMetadata?.role === 'reviewer' ||
    user?.publicMetadata?.role === 'admin'
  );

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setItems([]);
        setError('Authentication required');
        return;
      }
      const data = await campusApi.getAll(token);
      setItems(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
  }, [loadItems]);

  const addItem = async (item: Omit<CampusItem, 'id'>) => {
    const token = await getToken();
    if (!token) throw new Error('Authentication required');

    const newItem = await campusApi.create(token, item);
    setItems((prev) => [newItem, ...prev]);
    return newItem;
  };

  const deleteItem = async (id: string) => {
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');

      const targetItem = items.find((i) => i.id === id);
      const sourceType = targetItem?.sourceType || 'personal';
      const role = (user?.publicMetadata?.role as string) || (isReviewer ? 'reviewer' : undefined);

      await campusApi.delete(token, id, sourceType, role);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: unknown) {
      console.error('Failed to delete item:', err);
      throw err;
    }
  };

  return { items, isLoading, error, addItem, deleteItem, refresh: loadItems };
}

