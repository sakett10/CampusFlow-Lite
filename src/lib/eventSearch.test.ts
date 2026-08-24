import { describe, it, expect } from 'vitest';
import { searchCampusItems } from './eventSearch';
import type { CampusItem } from './types';

describe('searchCampusItems', () => {
  const createItem = (id: string, partial: Partial<CampusItem> = {}): CampusItem => ({
    id,
    title: null,
    type: null,
    description: null,
    date: null,
    startTime: null,
    endTime: null,
    registrationDeadline: null,
    venue: null,
    eligibility: null,
    organizer: null,
    importantActions: [],
    sourceText: '',
    ...partial
  });

  const items = [
    createItem('1', { title: 'Hackathon 2026', venue: 'Main Hall', organizer: 'Tech Club' }),
    createItem('2', { description: 'Learn AI basics', type: 'WORKSHOP', importantActions: ['Bring laptop', 'Register online'] }),
    createItem('3', { title: 'Null Test' }) // nulls for other fields
  ];

  it('empty query returns all items', () => {
    expect(searchCampusItems(items, '').length).toBe(3);
  });

  it('whitespace-only query returns all items', () => {
    expect(searchCampusItems(items, '   ').length).toBe(3);
  });

  it('case-insensitive title search', () => {
    const result = searchCampusItems(items, 'HACKATHON');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('description search', () => {
    const result = searchCampusItems(items, 'ai basics');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('2');
  });

  it('venue search', () => {
    const result = searchCampusItems(items, 'main hall');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('organizer search', () => {
    const result = searchCampusItems(items, 'Tech');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('type search', () => {
    const result = searchCampusItems(items, 'workshop');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('2');
  });

  it('importantActions search', () => {
    const result = searchCampusItems(items, 'laptop');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('2');
  });

  it('no-match query returns empty', () => {
    const result = searchCampusItems(items, 'nothing to see here');
    expect(result.length).toBe(0);
  });

  it('null/undefined fields are handled safely', () => {
    const result = searchCampusItems(items, 'null test');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('3');
  });

  it('multiple matching fields still return unique items', () => {
    const multiItems = [
      createItem('1', { title: 'AI AI AI', description: 'AI Workshop' })
    ];
    const result = searchCampusItems(multiItems, 'ai');
    expect(result.length).toBe(1);
  });

  it('original array is not mutated', () => {
    const original = [...items];
    searchCampusItems(items, 'Hackathon');
    expect(items).toEqual(original);
  });
});
