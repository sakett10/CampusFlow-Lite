import { CampusItem } from '../types';
import crypto from 'crypto';

// In-memory store for prototype
// Note: Server restart will clear this data.
let campusItems: CampusItem[] = [];

export const storageService = {
  getAll: () => campusItems,
  
  add: (item: Omit<CampusItem, 'id'>): CampusItem => {
    const newItem: CampusItem = { ...item, id: crypto.randomUUID() };
    campusItems = [newItem, ...campusItems];
    return newItem;
  },
  
  delete: (id: string): boolean => {
    const initialLength = campusItems.length;
    campusItems = campusItems.filter(item => item.id !== id);
    return campusItems.length < initialLength;
  }
};
