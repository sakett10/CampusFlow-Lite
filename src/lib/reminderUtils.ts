import type { Assignment } from './types';

export type ReminderOptionValue =
  | 'none'
  | 'at_due'
  | '5m_before'
  | '15m_before'
  | '30m_before'
  | '1h_before'
  | '2h_before'
  | '1d_before'
  | 'custom';

export const REMINDER_OPTIONS: Array<{ value: ReminderOptionValue; label: string }> = [
  { value: 'none', label: 'No reminder' },
  { value: 'at_due', label: 'At due time' },
  { value: '5m_before', label: '5 minutes before' },
  { value: '15m_before', label: '15 minutes before' },
  { value: '30m_before', label: '30 minutes before' },
  { value: '1h_before', label: '1 hour before' },
  { value: '2h_before', label: '2 hours before' },
  { value: '1d_before', label: '1 day before' },
  { value: 'custom', label: 'Custom date and time' },
];

export const DEFAULT_REMINDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None' },
  { value: '5m_before', label: '5 minutes' },
  { value: '15m_before', label: '15 minutes' },
  { value: '30m_before', label: '30 minutes' },
  { value: '1h_before', label: '1 hour' },
  { value: '2h_before', label: '2 hours' },
  { value: '1d_before', label: '1 day' },
];

export function formatTaskReminderBadge(task: Assignment): { text: string; isCustom: boolean } | null {
  const rule = task.reminder;
  if (!rule || rule === 'none') {
    return null;
  }

  if (rule === 'custom') {
    if (task.reminderRemindAt) {
      try {
        const d = new Date(task.reminderRemindAt);
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone: task.reminderTimezone || undefined,
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        }).format(d);
        return { text: formatted, isCustom: true };
      } catch {
        return { text: 'Custom', isCustom: true };
      }
    }
    return { text: 'Custom reminder', isCustom: true };
  }

  const match = REMINDER_OPTIONS.find((o) => o.value === rule);
  if (match) {
    return { text: match.label, isCustom: false };
  }

  return { text: rule, isCustom: false };
}
