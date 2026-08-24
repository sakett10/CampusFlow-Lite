import type { CampusItem } from './types';

export function searchCampusItems(items: CampusItem[], query: string): CampusItem[] {
  if (!query) return [...items];

  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) return [...items];

  return items.filter(item => {
    const searchableFields = [
      item.title,
      item.description,
      item.venue,
      item.organizer,
      item.type,
      ...(item.importantActions || [])
    ];

    return searchableFields.some(field => {
      if (!field) return false;
      return field.toLowerCase().includes(trimmedQuery);
    });
  });
}
