import { randomUUID } from 'node:crypto';
import { CampusItem } from '../types.js';

let campusItems: CampusItem[] = [];

export const storageService = {
  getAll: () => campusItems,

  add: (item: Omit<CampusItem, 'id'>): CampusItem => {
    const newItem: CampusItem = {
      ...item,
      id: randomUUID(),
    };

    campusItems = [newItem, ...campusItems];
    return newItem;
  },

  delete: (id: string): boolean => {
    const initialLength = campusItems.length;
    campusItems = campusItems.filter((item) => item.id !== id);
    return campusItems.length < initialLength;
  },
};