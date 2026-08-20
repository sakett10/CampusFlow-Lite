import type { Course, Assignment } from './types';

export function getStorageData<T>(key: string, defaultValue: T, validator?: (data: unknown) => data is T): T {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      if (validator && !validator(parsed)) {
        console.error('Data validation failed for key:', key);
        return defaultValue;
      }
      return parsed as T;
    }
    return defaultValue;
  } catch (error) {
    console.error('Error reading from localStorage', error);
    return defaultValue;
  }
}

export function setStorageData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage', error);
  }
}

export function isCourse(data: unknown): data is Course {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.code === 'string' &&
    typeof d.title === 'string' &&
    typeof d.instructor === 'string' &&
    typeof d.credits === 'number' &&
    typeof d.attendedClasses === 'number' &&
    typeof d.totalClasses === 'number' &&
    typeof d.attendanceThreshold === 'number'
  );
}

export function isAssignment(data: unknown): data is Assignment {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.courseId === 'string' &&
    typeof d.title === 'string' &&
    typeof d.description === 'string' &&
    typeof d.dueDate === 'string' &&
    (d.status === 'PENDING' || d.status === 'IN_PROGRESS' || d.status === 'COMPLETED')
  );
}

export function getStorageArray<T>(key: string, itemValidator: (item: unknown) => item is T): T[] {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed)) {
        const validItems = parsed.filter(itemValidator);
        if (validItems.length !== parsed.length) {
          console.warn("Filtered out invalid items from ");
        }
        return validItems;
      }
      return [];
    }
    return [];
  } catch (error) {
    console.error('Error reading array from localStorage', error);
    return [];
  }
}
