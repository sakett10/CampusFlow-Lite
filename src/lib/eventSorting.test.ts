import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sortCampusItems } from './eventSorting';
import type { CampusItem } from './types';

describe('sortCampusItems', () => {
  const fakeNow = new Date(2026, 8, 20, 12, 0, 0); // Sep 20, 2026 12:00

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createItem = (id: string, date: string | null, startTime: string | null = null, endTime: string | null = null, reg: string | null = null): CampusItem => ({
    id,
    title: null,
    type: null,
    description: null,
    date,
    startTime,
    endTime,
    registrationDeadline: reg,
    venue: null,
    eligibility: null,
    organizer: null,
    importantActions: [],
    sourceText: ''
  });

  it('UPCOMING: nearest upcoming event first, later upcoming second, past events last, missing dates at end', () => {
    const items = [
      createItem('1', null), // no date
      createItem('2', '2026-09-18'), // past
      createItem('3', '2026-09-25'), // later future
      createItem('4', '2026-09-21'), // nearest future
    ];
    
    const sorted = sortCampusItems(items, 'UPCOMING', fakeNow);
    expect(sorted.map(i => i.id)).toEqual(['4', '3', '2', '1']);
  });

  it('REGISTRATION_DEADLINE: nearest deadline first, missing deadlines last', () => {
    const items = [
      createItem('1', '2026-09-20', null, null, null), // no reg
      createItem('2', '2026-09-20', null, null, '2026-09-25'), // later reg
      createItem('3', '2026-09-20', null, null, '2026-09-21'), // nearest reg
      createItem('4', '2026-09-20', null, null, '2026-09-19'), // past reg
    ];
    
    const sorted = sortCampusItems(items, 'REGISTRATION_DEADLINE', fakeNow);
    expect(sorted.map(i => i.id)).toEqual(['3', '2', '4', '1']);
  });

  it('PAST: most recently ended first, future events last', () => {
    const items = [
      createItem('1', '2026-09-25'), // future
      createItem('2', '2026-09-15'), // older past
      createItem('3', '2026-09-19'), // recent past
    ];
    
    const sorted = sortCampusItems(items, 'PAST', fakeNow);
    expect(sorted.map(i => i.id)).toEqual(['3', '2', '1']);
  });

  it('RECENT: preserves existing ordering', () => {
    const items = [
      createItem('1', '2026-09-25'),
      createItem('2', '2026-09-15'),
      createItem('3', '2026-09-19'),
    ];
    
    const sorted = sortCampusItems(items, 'RECENT', fakeNow);
    expect(sorted.map(i => i.id)).toEqual(['1', '2', '3']);
  });
  
  it('UPCOMING: events with startTime are ordered correctly', () => {
    const items = [
      createItem('1', '2026-09-21', '14:00'), // later time
      createItem('2', '2026-09-21', '09:00'), // earlier time
    ];
    const sorted = sortCampusItems(items, 'UPCOMING', fakeNow);
    expect(sorted.map(i => i.id)).toEqual(['2', '1']);
  });
});
