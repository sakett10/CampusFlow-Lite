export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || dateStr.trim() === '') return false;

  const parts = dateStr.split('-');

  if (parts.length !== 3) return false;

  const [yearStr, monthStr, dayStr] = parts;

  if (
    !/^\d{4}$/.test(yearStr) ||
    !/^\d{2}$/.test(monthStr) ||
    !/^\d{2}$/.test(dayStr)
  ) {
    return false;
  }

  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function isOverdue(dueDateStr: string, status: string): boolean {
  if (status === 'COMPLETED') return false;
  if (!isValidDateString(dueDateStr)) return false;

  const [year, month, day] = dueDateStr.split('-').map(Number);
  const dueDate = new Date(year, month - 1, day, 23, 59, 59, 999);

  return dueDate.getTime() < Date.now();
}

export function formatDueDate(dateStr: string | null | undefined): string {
  if (!dateStr || !isValidDateString(dateStr)) return 'No due date';

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr || !isValidDateString(dateStr)) return Infinity;

  const [year, month, day] = dateStr.split('-').map(Number);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(year, month - 1, day);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();

  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export function formatTime(timeStr: string): string {
  if (!timeStr) return '';

  const [hoursStr, minutesStr] = timeStr.split(':');

  if (!hoursStr || !minutesStr) return timeStr;

  const hours = parseInt(hoursStr, 10);

  if (Number.isNaN(hours) || hours < 0 || hours > 23) {
    return timeStr;
  }

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutesStr} ${ampm}`;
}

export function parseCalendarDate(
  dateStr: string,
): { year: number; month: number; day: number } | null {
  if (!isValidDateString(dateStr)) return null;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}

export function formatCalendarMonth(dateStr: string): string {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return '';
  const date = new Date(parsed.year, parsed.month - 1, parsed.day);
  return date.toLocaleDateString('en-US', { month: 'short' });
}

export function formatCalendarDay(dateStr: string): string {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return '';
  return String(parsed.day);
}

/**
 * Formats an authoritative email received timestamp (e.g. "10 Sep, 8:42 PM").
 */
export function formatEmailTimestamp(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();

  const datePart = d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });

  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${datePart}, ${timePart}`;
}

/**
 * Formats a notice publication/received timestamp (e.g. "10 Sep").
 */
export function formatNoticeDate(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();

  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Formats a task due date (e.g. "Due 12 Sep" or "No due date").
 */
export function formatTaskDueDate(dueDateStr: string | null | undefined): string {
  if (!dueDateStr || !isValidDateString(dueDateStr)) {
    return 'No due date';
  }

  const [year, month, day] = dueDateStr.split('-').map(Number);
  const target = new Date(year, month - 1, day);

  const formatted = target.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });

  return `Due ${formatted}`;
}
