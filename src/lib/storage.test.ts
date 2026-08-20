import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStorageData, setStorageData, getStorageArray, isCourse, isAssignment } from './storage';

describe('Storage Utils', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('sets and gets generic data correctly', () => {
    setStorageData('test_key', { a: 1 });
    const data = getStorageData('test_key', { a: 0 });
    expect(data).toEqual({ a: 1 });
  });

  it('returns default value when key missing', () => {
    const data = getStorageData('missing_key', { b: 2 });
    expect(data).toEqual({ b: 2 });
  });

  it('returns default value on parse error', () => {
    localStorage.setItem('bad_json', '{bad json');
    const data = getStorageData('bad_json', 'default');
    expect(data).toBe('default');
  });

  it('rejects structurally invalid data with validator', () => {
    localStorage.setItem('obj', JSON.stringify({ a: 1 }));
    const validator = (d: unknown): d is {b: number} => typeof d === 'object' && d !== null && typeof (d as Record<string, unknown>).b === 'number';
    const data = getStorageData('obj', { b: 0 }, validator);
    expect(data).toEqual({ b: 0 });
  });

  it('filters out invalid array items', () => {
    const mixed = [
      { id: '1', code: 'CS101', title: 'Intro', instructor: 'Bob', credits: 3, attendedClasses: 5, totalClasses: 10, attendanceThreshold: 75 },
      { id: '2', invalid: true },
      'not an object'
    ];
    localStorage.setItem('courses', JSON.stringify(mixed));
    const courses = getStorageArray('courses', isCourse);
    expect(courses.length).toBe(1);
    expect(courses[0].id).toBe('1');
  });

  it('returns empty array if data is not an array', () => {
    localStorage.setItem('courses', JSON.stringify({ not: 'array' }));
    const courses = getStorageArray('courses', isCourse);
    expect(courses).toEqual([]);
  });

  it('validates assignment correctly', () => {
    const assignments = [
      { id: '1', courseId: '1', title: 'A1', description: 'desc', dueDate: '2023', status: 'PENDING' },
      { id: '2', status: 'INVALID_STATUS' }
    ];
    localStorage.setItem('tasks', JSON.stringify(assignments));
    const valid = getStorageArray('tasks', isAssignment);
    expect(valid.length).toBe(1);
    expect(valid[0].id).toBe('1');
  });
});
