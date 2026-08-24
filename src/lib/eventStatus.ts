import { isValidDateString } from './dateUtils';

export type EventStatus =
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSING_SOON'
  | 'UPCOMING'
  | 'EVENT_ENDED'
  | 'UNKNOWN';

export function getEventStatus(
  date: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  registrationDeadline: string | null | undefined,
  now: Date = new Date()
): EventStatus {
  if (!date || !isValidDateString(date)) {
    return 'UNKNOWN';
  }

  let eventEnd: Date;
  const [year, month, day] = date.split('-').map(Number);

  if (endTime) {
    const [h, m] = endTime.split(':').map(Number);
    eventEnd = new Date(year, month - 1, day, h, m, 0, 0);
  } else if (startTime) {
    const [h, m] = startTime.split(':').map(Number);
    eventEnd = new Date(year, month - 1, day, h, m, 0, 0);
  } else {
    eventEnd = new Date(year, month - 1, day, 23, 59, 59, 999);
  }

  if (eventEnd.getTime() < now.getTime()) {
    return 'EVENT_ENDED';
  }

  if (registrationDeadline && isValidDateString(registrationDeadline)) {
    const [rYear, rMonth, rDay] = registrationDeadline.split('-').map(Number);
    const regEnd = new Date(rYear, rMonth - 1, rDay, 23, 59, 59, 999);

    if (regEnd.getTime() >= now.getTime()) {
      const msLeft = regEnd.getTime() - now.getTime();
      const daysLeft = msLeft / (1000 * 60 * 60 * 24);
      if (daysLeft <= 3) {
        return 'REGISTRATION_CLOSING_SOON';
      }
      return 'REGISTRATION_OPEN';
    }
  }

  return 'UPCOMING';
}
