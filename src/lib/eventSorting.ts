import type { CampusItem } from './types';
import { isValidDateString } from './dateUtils';

export type SortOption = 'UPCOMING' | 'REGISTRATION_DEADLINE' | 'RECENT' | 'PAST';

function getEventDate(dateStr: string | null | undefined, timeStr: string | null | undefined, isEnd: boolean = false): Date | null {
  if (!dateStr || !isValidDateString(dateStr)) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  
  if (timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      return new Date(year, month - 1, day, h, m, 0, 0);
    }
  }
  
  return new Date(year, month - 1, day, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0);
}

export function sortCampusItems(items: CampusItem[], sortOption: SortOption, now: Date = new Date()): CampusItem[] {
  if (sortOption === 'RECENT') {
    return [...items];
  }

  return [...items].sort((a, b) => {
    if (sortOption === 'UPCOMING') {
      const dateA = getEventDate(a.date, a.startTime, false);
      const dateB = getEventDate(b.date, b.startTime, false);
      
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      const timeA = dateA.getTime();
      const timeB = dateB.getTime();
      const nowTime = now.getTime();

      const isAFuture = timeA >= nowTime;
      const isBFuture = timeB >= nowTime;

      if (isAFuture && !isBFuture) return -1;
      if (!isAFuture && isBFuture) return 1;

      return timeA - timeB;
    }
    
    if (sortOption === 'REGISTRATION_DEADLINE') {
      const dateA = getEventDate(a.registrationDeadline, null, true);
      const dateB = getEventDate(b.registrationDeadline, null, true);
      
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      const timeA = dateA.getTime();
      const timeB = dateB.getTime();
      const nowTime = now.getTime();

      const isAFuture = timeA >= nowTime;
      const isBFuture = timeB >= nowTime;

      if (isAFuture && !isBFuture) return -1;
      if (!isAFuture && isBFuture) return 1;

      return timeA - timeB;
    }
    
    if (sortOption === 'PAST') {
      const dateA = getEventDate(a.date, a.endTime || a.startTime, true);
      const dateB = getEventDate(b.date, b.endTime || b.startTime, true);
      
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      const timeA = dateA.getTime();
      const timeB = dateB.getTime();
      const nowTime = now.getTime();

      const isAPast = timeA < nowTime;
      const isBPast = timeB < nowTime;

      if (isAPast && !isBPast) return -1;
      if (!isAPast && isBPast) return 1;

      return timeB - timeA;
    }
    
    return 0;
  });
}
