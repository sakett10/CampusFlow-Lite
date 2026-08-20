import { useState, useEffect } from 'react';
import type { CampusItem } from '../lib/types';
import { campusApi } from '../api/campusApi';

export function useCampusFeed() {
  const [items, setItems] = useState<CampusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const data = await campusApi.getAll();
      setItems(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
  }, []);

  const addItem = async (item: Omit<CampusItem, 'id'>) => {
    const newItem = await campusApi.create(item);
    setItems(prev => [newItem, ...prev]);
    return newItem;
  };

  const deleteItem = async (id: string) => {
    await campusApi.delete(id);
    setItems(prev => prev.filter(item => item.id !== id));
  };

  return { items, isLoading, error, addItem, deleteItem, refresh: loadItems };
}
