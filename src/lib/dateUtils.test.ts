import { describe, it, expect } from 'vitest';
import {
  isOverdue,
  parseCalendarDate,
  formatCalendarDay,
  formatCalendarMonth,
} from './dateUtils';

function getLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('dateUtils', () => {
  it('Yesterday + PENDING => overdue', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = getLocalDateString(yesterday);
    expect(isOverdue(dateStr, 'PENDING')).toBe(true);
  });

  it('Today => not incorrectly marked overdue', () => {
    const today = new Date();
    const dateStr = getLocalDateString(today);
    expect(isOverdue(dateStr, 'PENDING')).toBe(false);
  });

  it('Future date + PENDING => not overdue', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = getLocalDateString(tomorrow);
    expect(isOverdue(dateStr, 'PENDING')).toBe(false);
  });

  it('Yesterday + COMPLETED => not overdue', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = getLocalDateString(yesterday);
    expect(isOverdue(dateStr, 'COMPLETED')).toBe(false);
  });

  it('safely parses calendar dates without timezone rollback', () => {
    const dateStr = '2026-10-15';
    const parsed = parseCalendarDate(dateStr);
    expect(parsed).toEqual({ year: 2026, month: 10, day: 15 });
    expect(formatCalendarDay(dateStr)).toBe('15');
    expect(formatCalendarMonth(dateStr)).toBe('Oct');
  });

  it('handles invalid or empty calendar date strings gracefully', () => {
    expect(parseCalendarDate('')).toBeNull();
    expect(parseCalendarDate('invalid-date')).toBeNull();
    expect(formatCalendarDay('')).toBe('');
    expect(formatCalendarMonth('')).toBe('');
  });
});
