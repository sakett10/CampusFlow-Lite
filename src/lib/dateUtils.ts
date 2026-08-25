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

export function formatDueDate(dateStr: string): string {
  if (!isValidDateString(dateStr)) return 'Invalid Date';

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function daysUntil(dateStr: string): number {
  if (!isValidDateString(dateStr)) return Infinity;

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