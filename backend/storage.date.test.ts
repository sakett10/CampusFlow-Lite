import { describe, it, expect, vi } from 'vitest';

// Mock test database BEFORE importing services
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

import { parseDateString, isItemActive } from './services/storage.service.js';

describe('Date Parsing and Expiration Logic', () => {
  describe('parseDateString', () => {
    it('parses standard ISO YYYY-MM-DD', () => {
      expect(parseDateString('2026-09-25')).toEqual({ year: 2026, month: 9, day: 25 });
    });

    it('parses natural language format (DD Month YYYY)', () => {
      expect(parseDateString('25 September 2026')).toEqual({ year: 2026, month: 9, day: 25 });
    });

    it('parses natural language format (Month DD, YYYY)', () => {
      expect(parseDateString('September 25, 2026')).toEqual({ year: 2026, month: 9, day: 25 });
    });

    it('parses Indian DD/MM/YYYY and DD-MM-YYYY format', () => {
      expect(parseDateString('25/09/2026')).toEqual({ year: 2026, month: 9, day: 25 });
      expect(parseDateString('25-09-2026')).toEqual({ year: 2026, month: 9, day: 25 });
      expect(parseDateString('25.09.2026')).toEqual({ year: 2026, month: 9, day: 25 });
    });

    it('returns null for empty or invalid date strings', () => {
      expect(parseDateString('')).toBeNull();
      expect(parseDateString('   ')).toBeNull();
      expect(parseDateString('invalid-not-a-date')).toBeNull();
    });
  });

  describe('isItemActive', () => {
    const referenceNow = new Date(2026, 8, 25, 12, 0, 0).getTime(); // 2026-09-25 12:00:00

    it('keeps items with null or missing dates active', () => {
      expect(isItemActive({}, referenceNow)).toBe(true);
      expect(isItemActive({ date: null, registrationDeadline: null }, referenceNow)).toBe(true);
    });

    it('keeps items with unparseable dates active rather than prematurely expiring them', () => {
      expect(isItemActive({ date: 'TBD Date Announcement' }, referenceNow)).toBe(true);
    });

    it('evaluates future ISO dates as active', () => {
      expect(isItemActive({ date: '2026-09-26' }, referenceNow)).toBe(true);
      expect(isItemActive({ date: '2026-10-15' }, referenceNow)).toBe(true);
    });

    it('evaluates future natural language dates as active', () => {
      expect(isItemActive({ date: '26 September 2026' }, referenceNow)).toBe(true);
      expect(isItemActive({ date: 'October 15, 2026' }, referenceNow)).toBe(true);
    });

    it('evaluates past dates as inactive/expired', () => {
      expect(isItemActive({ date: '2026-09-24' }, referenceNow)).toBe(false);
      expect(isItemActive({ date: '24 September 2026' }, referenceNow)).toBe(false);
      expect(isItemActive({ date: '2025-12-31' }, referenceNow)).toBe(false);
    });

    it('evaluates same-day event without endTime as active until end of day', () => {
      expect(isItemActive({ date: '2026-09-25' }, referenceNow)).toBe(true);
      expect(isItemActive({ date: '25 September 2026' }, referenceNow)).toBe(true);
    });

    it('handles explicit 24-hour endTime', () => {
      // Event ended at 10:00 (with 1h buffer = 11:00) -> at 12:00 it is expired
      expect(isItemActive({ date: '2026-09-25', endTime: '10:00' }, referenceNow)).toBe(false);

      // Event ends at 14:00 (with 1h buffer = 15:00) -> at 12:00 it is active
      expect(isItemActive({ date: '2026-09-25', endTime: '14:00' }, referenceNow)).toBe(true);
    });

    it('handles explicit 12-hour AM/PM endTime', () => {
      // Event ended at 10:00 AM -> at 12:00 PM it is expired
      expect(isItemActive({ date: '25 September 2026', endTime: '10:00 AM' }, referenceNow)).toBe(false);

      // Event ends at 2:00 PM -> at 12:00 PM it is active
      expect(isItemActive({ date: '25 September 2026', endTime: '2:00 PM' }, referenceNow)).toBe(true);
    });

    it('falls back to registrationDeadline when date is null', () => {
      expect(isItemActive({ date: null, registrationDeadline: '2026-09-30' }, referenceNow)).toBe(true);
      expect(isItemActive({ date: null, registrationDeadline: '2026-09-20' }, referenceNow)).toBe(false);
    });
  });
});
