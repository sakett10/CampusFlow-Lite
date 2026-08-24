export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || dateStr.trim() === '') return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(year, month - 1, day);
  return !isNaN(date.getTime());
}

export function isOverdue(dueDateStr: string, status: string): boolean {
  if (status === 'COMPLETED') return false;
  if (!isValidDateString(dueDateStr)) return false;
  
  const [year, month, day] = dueDateStr.split('-').map(Number);
  const dueDate = new Date(year, month - 1, day, 23, 59, 59, 999);
  const now = new Date();
  
  return dueDate.getTime() < now.getTime();
}

export function formatDueDate(dateStr: string): string {
  if (!isValidDateString(dateStr)) return 'Invalid Date';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
