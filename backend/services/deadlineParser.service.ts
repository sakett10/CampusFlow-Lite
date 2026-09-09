import type { NoticeCandidate, NoticePriority } from '../types.js';

export interface ExtractedTaskInfo {
  hasDeadline: boolean;
  title: string;
  description: string;
  dueDate: string;
  dueTime: string | null;
  reminder: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ParsedDateResult {
  isoDate: string | null;
  isAmbiguous: boolean;
  confidenceReason?: string;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DEADLINE_LABELS = [
  'deadline',
  'submission',
  'submit',
  'due date',
  'due',
  'last date',
  'exam',
  'quiz',
  'test',
  'payment',
  'registration',
  'application',
];

export function parseNaturalDate(rawStr: string, refDate: Date = new Date()): ParsedDateResult | null {
  if (!rawStr || typeof rawStr !== 'string') return null;
  const clean = rawStr.trim();
  if (!clean) return null;

  // 1. ISO format: YYYY-MM-DD
  const isoMatch = clean.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, isAmbiguous: false };
    }
  }

  // 2. Month name format: "September 20, 2026", "20 September 2026", "20th Sep 2026", "Sep 20 2026"
  const monthRegex = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{4})?\b/i;
  const mMatch = clean.match(monthRegex);
  if (mMatch) {
    const rawDay = mMatch[1] || mMatch[3];
    const monthStr = mMatch[2].toLowerCase();
    const rawYear = mMatch[4];

    const monthNum = MONTH_NAMES[monthStr];
    if (monthNum) {
      let year = rawYear ? parseInt(rawYear, 10) : refDate.getFullYear();
      const day = rawDay ? parseInt(rawDay, 10) : 1;
      const isAmbiguousDay = !rawDay;

      if (!rawYear && rawDay) {
        const candidateDate = new Date(year, monthNum - 1, day);
        if (candidateDate < refDate && (refDate.getMonth() + 1) > monthNum) {
          year += 1;
        }
      }

      if (day >= 1 && day <= 31) {
        return {
          isoDate: `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          isAmbiguous: isAmbiguousDay,
          confidenceReason: isAmbiguousDay ? 'Day was not specified; defaulted to 1st of month' : undefined,
        };
      }
    }
  }

  // 3. Slash or dash format: DD/MM/YYYY or DD-MM-YYYY
  const numMatch = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numMatch) {
    const part1 = parseInt(numMatch[1], 10);
    const part2 = parseInt(numMatch[2], 10);
    let year = parseInt(numMatch[3], 10);
    if (year < 100) year += 2000;

    let day = part1;
    let month = part2;
    let isAmbiguous = false;

    if (part1 > 12 && part2 <= 12) {
      day = part1;
      month = part2;
    } else if (part2 > 12 && part1 <= 12) {
      month = part1;
      day = part2;
    } else if (part1 <= 12 && part2 <= 12) {
      // Indian / International convention DD/MM/YYYY default
      day = part1;
      month = part2;
      isAmbiguous = true;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        isAmbiguous,
        confidenceReason: isAmbiguous ? 'Assumed DD/MM/YYYY format' : undefined,
      };
    }
  }

  // 4. Relative words: "today", "tomorrow"
  const lower = clean.toLowerCase();
  if (lower.includes('today')) {
    const y = refDate.getFullYear();
    const m = String(refDate.getMonth() + 1).padStart(2, '0');
    const d = String(refDate.getDate()).padStart(2, '0');
    return { isoDate: `${y}-${m}-${d}`, isAmbiguous: false };
  }
  if (lower.includes('tomorrow')) {
    const tom = new Date(refDate.getTime() + 86400000);
    const y = tom.getFullYear();
    const m = String(tom.getMonth() + 1).padStart(2, '0');
    const d = String(tom.getDate()).padStart(2, '0');
    return { isoDate: `${y}-${m}-${d}`, isAmbiguous: false };
  }

  // 5. Day of week: "this Friday", "next Monday"
  const dayMatch = lower.match(/\b(?:this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (dayMatch) {
    const targetDayIndex = DAY_NAMES.indexOf(dayMatch[1]);
    if (targetDayIndex !== -1) {
      const currentDayIndex = refDate.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0) diff += 7;
      const targetDate = new Date(refDate.getTime() + diff * 86400000);
      const y = targetDate.getFullYear();
      const m = String(targetDate.getMonth() + 1).padStart(2, '0');
      const d = String(targetDate.getDate()).padStart(2, '0');
      return {
        isoDate: `${y}-${m}-${d}`,
        isAmbiguous: true,
        confidenceReason: `Inferred as upcoming ${dayMatch[1]}`,
      };
    }
  }

  return null;
}

export function extractTime(text: string): string | null {
  if (!text) return null;
  const clean = text.trim();

  // 12-hour format: '11:59 PM', '5:00 PM', '5 PM', '11:59pm'
  const m12 = clean.match(/\b(0?[1-9]|1[0-2])(?::([0-5]\d))?\s*(AM|PM)\b/i);
  if (m12) {
    let hours = parseInt(m12[1], 10);
    const minutes = m12[2] ? m12[2] : '00';
    const ampm = m12[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  // 24-hour format: '14:00', '23:59', '09:30'
  const m24 = clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m24) {
    return `${m24[1].padStart(2, '0')}:${m24[2]}`;
  }

  return null;
}

export function suggestReminder(dueDateStr: string): string {
  if (!dueDateStr) return '1d_before';
  const parts = dueDateStr.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return '1d_before';
  }
  const [y, m, d] = parts;
  const target = new Date(y, m - 1, d, 23, 59, 59);
  const now = new Date();
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return '2h_before';
  if (diffDays <= 3) return 'morning_of';
  return '1d_before';
}

export function extractDeadlineAndTask(
  candidate: NoticeCandidate,
  message: { subject?: string | null; bodyText?: string | null; snippet?: string | null },
): ExtractedTaskInfo {
  let dueDate = '';

  // 1. Search importantDates for a deadline label first
  if (candidate.importantDates && candidate.importantDates.length > 0) {
    const deadlineEntry = candidate.importantDates.find((d) => {
      const label = (d.label || '').toLowerCase();
      return DEADLINE_LABELS.some((kw) => label.includes(kw));
    }) || candidate.importantDates[0];

    if (deadlineEntry?.date) {
      const parsed = parseNaturalDate(deadlineEntry.date);
      if (parsed && parsed.isoDate) {
        dueDate = parsed.isoDate;
      }
    }
  }

  // 2. Fallback to searching actionRequired and text
  const fullText = `${candidate.actionRequired || ''} ${candidate.summary || ''} ${message.subject || ''} ${message.bodyText || message.snippet || ''}`;
  if (!dueDate) {
    const parsed = parseNaturalDate(fullText);
    if (parsed && parsed.isoDate) {
      dueDate = parsed.isoDate;
    }
  }

  // 3. Extract time
  const dueTime = extractTime(`${candidate.actionRequired || ''} ${candidate.summary || ''} ${fullText}`);

  // Clean title
  let cleanTitle = (candidate.title || message.subject || 'Campus Academic Item')
    .replace(/^(?:fwd|re|notice|urgent|important|action required):\s*/gi, '')
    .trim();

  if (!cleanTitle) {
    cleanTitle = 'Follow up on university notice';
  }

  // Map priority
  const priorityMap: Record<NoticePriority, 'low' | 'medium' | 'high' | 'urgent'> = {
    urgent: 'urgent',
    important: 'high',
    normal: 'medium',
    low: 'low',
  };
  const taskPriority = priorityMap[candidate.priority] || 'medium';

  const hasDeadline = Boolean(
    dueDate ||
    candidate.category === 'exam' ||
    candidate.category === 'assignment' ||
    candidate.category === 'fee' ||
    candidate.category === 'scholarship' ||
    candidate.actionRequired,
  );

  return {
    hasDeadline,
    title: cleanTitle,
    description: (candidate.summary || message.snippet || '').trim(),
    dueDate,
    dueTime,
    reminder: dueDate ? suggestReminder(dueDate) : '1d_before',
    priority: taskPriority,
  };
}
