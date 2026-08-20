import { describe, it, expect } from 'vitest';
import { isOverdue } from './dateUtils';

describe('dateUtils', () => {
  it('Yesterday + PENDING => overdue', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    expect(isOverdue(dateStr, 'PENDING')).toBe(true);
  });

  it('Today => not incorrectly marked overdue', () => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    expect(isOverdue(dateStr, 'PENDING')).toBe(false);
  });

  it('Future date + PENDING => not overdue', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    expect(isOverdue(dateStr, 'PENDING')).toBe(false);
  });

  it('Yesterday + COMPLETED => not overdue', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    expect(isOverdue(dateStr, 'COMPLETED')).toBe(false);
  });
});
