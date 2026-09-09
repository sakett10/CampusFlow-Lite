import type { Notice, CampusItem, CampusEmail } from './types';
import { isValidDateString } from './dateUtils';

export interface ProposedTask {
  title: string;
  description: string;
  dueDate: string;
  dueTime?: string | null;
  reminder?: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  source: 'notice' | 'gmail' | 'manual';
  sourceId: string;
  sourceTitle: string;
  courseId?: string | null;
  isAmbiguousDate?: boolean;
  confidenceReason?: string;
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

const ACTIONABLE_KEYWORDS = [
  'deadline',
  'submit',
  'submission',
  'register',
  'registration',
  'exam',
  'test',
  'quiz',
  'cat 1',
  'cat 2',
  'fat',
  'assignment',
  'due',
  'last date',
  'fee payment',
  'apply',
  'application',
  'attend',
  'mandatory',
  'project report',
];

const NON_ACTIONABLE_WORDS = [
  'none',
  'n/a',
  'nil',
  'no action',
  'informational',
  'info only',
];

/**
 * Checks whether a notice represents an actionable deadline or required task.
 */
export function isActionableNotice(notice: Notice): boolean {
  if (!notice) return false;

  if (notice.actionRequired && notice.actionRequired.trim().length > 0) {
    const act = notice.actionRequired.trim().toLowerCase();
    if (!NON_ACTIONABLE_WORDS.includes(act)) {
      return true;
    }
  }

  if (['exam', 'assignment', 'fee', 'scholarship', 'admission'].includes(notice.category)) {
    return true;
  }

  if (notice.importantDates && Array.isArray(notice.importantDates) && notice.importantDates.length > 0) {
    const hasDeadlineDate = notice.importantDates.some((d) => {
      const label = (d.label || '').toLowerCase();
      return ACTIONABLE_KEYWORDS.some((kw) => label.includes(kw));
    });
    if (hasDeadlineDate) return true;
  }

  const titleLower = (notice.title || '').toLowerCase();
  return ACTIONABLE_KEYWORDS.some((kw) => titleLower.includes(kw));
}

/**
 * Checks whether a CampusItem has an actionable deadline.
 */
export function isActionableCampusItem(item: CampusItem): boolean {
  if (!item) return false;
  if (item.type === 'DEADLINE') return true;
  if (item.registrationDeadline && item.registrationDeadline.trim().length > 0) return true;
  if (item.importantActions && item.importantActions.length > 0) return true;

  const titleLower = (item.title || '').toLowerCase();
  return ACTIONABLE_KEYWORDS.some((kw) => titleLower.includes(kw));
}

/**
 * Checks whether a private synced campus email contains an actionable deadline.
 */
export function isActionableCampusEmail(email: CampusEmail): boolean {
  if (!email) return false;
  if (email.deadline && email.deadline.trim().length > 0) return true;
  if (email.importantActions && email.importantActions.length > 0) return true;
  if (['exam', 'assignment', 'fee', 'scholarship'].includes(email.category || '')) return true;

  const subjectLower = (email.subject || '').toLowerCase();
  return ACTIONABLE_KEYWORDS.some((kw) => subjectLower.includes(kw));
}

/**
 * Extracts and normalizes dates from both ISO and natural-language representations.
 * Handles:
 * - YYYY-MM-DD
 * - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - 20 September 2026, 20th September 2026, 20 Sep 2026
 * - September 20, 2026, Sep 20 2026
 * - 20 September, 20th Sept (inferred year flagged as ambiguous)
 * - tomorrow, today (flagged as ambiguous)
 * - this Friday, next Monday (flagged as ambiguous)
 *
 * NEVER invents a deadline if no date is found.
 */
export function parseNaturalDate(input: string, refDate: Date = new Date()): ParsedDateResult | null {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();

  // 1. Exact ISO YYYY-MM-DD
  const isoMatch = clean.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch && isValidDateString(isoMatch[0])) {
    return {
      isoDate: isoMatch[0],
      isAmbiguous: false,
    };
  }

  // 2. Numeric DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY
  const numMatch = clean.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (numMatch) {
    const day = numMatch[1].padStart(2, '0');
    const month = numMatch[2].padStart(2, '0');
    const year = numMatch[3];
    const candidate = `${year}-${month}-${day}`;
    if (isValidDateString(candidate)) {
      return {
        isoDate: candidate,
        isAmbiguous: false,
      };
    }
  }

  // 3. Strip ordinal suffixes: 20th -> 20, 1st -> 1, 2nd -> 2, 3rd -> 3
  const stripped = clean.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');

  // 4. "20 September 2026" or "20 Sep 2026" or "Monday, 20 September 2026"
  const dmyNamed = stripped.match(/\b(0?[1-9]|[12]\d|3[01])\s+([a-zA-Z]{3,9})(?:,?\s+(20\d{2}))?\b/i);
  if (dmyNamed) {
    const day = parseInt(dmyNamed[1], 10);
    const mStr = dmyNamed[2].toLowerCase();
    const monthNum = MONTH_NAMES[mStr];
    if (monthNum && day >= 1 && day <= 31) {
      let year = dmyNamed[3] ? parseInt(dmyNamed[3], 10) : null;
      let isAmbiguous = false;
      let confidenceReason: string | undefined = undefined;

      if (!year) {
        year = refDate.getFullYear();
        const candidate = new Date(year, monthNum - 1, day);
        if (candidate.getTime() < refDate.getTime() - 60 * 86400000) {
          year += 1;
        }
        isAmbiguous = true;
        confidenceReason = `Year was inferred as ${year}. Please confirm deadline.`;
      }

      const iso = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (isValidDateString(iso)) {
        return { isoDate: iso, isAmbiguous, confidenceReason };
      }
    }
  }

  // 5. "September 20, 2026" or "Sep 20 2026" or "September 20"
  const mdyNamed = stripped.match(/\b([a-zA-Z]{3,9})\s+(0?[1-9]|[12]\d|3[01])(?:,?\s+(20\d{2}))?\b/i);
  if (mdyNamed) {
    const mStr = mdyNamed[1].toLowerCase();
    const day = parseInt(mdyNamed[2], 10);
    const monthNum = MONTH_NAMES[mStr];
    if (monthNum && day >= 1 && day <= 31) {
      let year = mdyNamed[3] ? parseInt(mdyNamed[3], 10) : null;
      let isAmbiguous = false;
      let confidenceReason: string | undefined = undefined;

      if (!year) {
        year = refDate.getFullYear();
        const candidate = new Date(year, monthNum - 1, day);
        if (candidate.getTime() < refDate.getTime() - 60 * 86400000) {
          year += 1;
        }
        isAmbiguous = true;
        confidenceReason = `Year was inferred as ${year}. Please confirm deadline.`;
      }

      const iso = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (isValidDateString(iso)) {
        return { isoDate: iso, isAmbiguous, confidenceReason };
      }
    }
  }

  // 6. Relative tokens: "today", "tomorrow"
  const lower = clean.toLowerCase();
  if (/\btoday\b/.test(lower)) {
    const y = refDate.getFullYear();
    const m = String(refDate.getMonth() + 1).padStart(2, '0');
    const d = String(refDate.getDate()).padStart(2, '0');
    return {
      isoDate: `${y}-${m}-${d}`,
      isAmbiguous: true,
      confidenceReason: "Date was inferred from 'today'. Please confirm deadline.",
    };
  }

  if (/\btomorrow\b/.test(lower)) {
    const tmr = new Date(refDate.getTime() + 86400000);
    const y = tmr.getFullYear();
    const m = String(tmr.getMonth() + 1).padStart(2, '0');
    const d = String(tmr.getDate()).padStart(2, '0');
    return {
      isoDate: `${y}-${m}-${d}`,
      isAmbiguous: true,
      confidenceReason: "Date was inferred from 'tomorrow'. Please confirm deadline.",
    };
  }

  // 7. Day of week: "this Friday", "next Monday"
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
        confidenceReason: `Date was inferred as upcoming ${dayMatch[1]}. Please confirm deadline.`,
      };
    }
  }

  return null;
}

/**
 * Returns ISO date YYYY-MM-DD from an arbitrary string if a valid date is detected.
 */
export function extractIsoDate(text: string, refDate?: Date): string | null {
  const res = parseNaturalDate(text, refDate);
  return res ? res.isoDate : null;
}

/**
 * Extracts a normalized 24-hour time string (HH:MM) from text.
 * Standardizes 12-hour ('5:00 PM', '11:59 PM', '5 PM') and 24-hour ('14:00', '23:59') formats.
 */
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

/**
 * Suggests an appropriate reminder rule based on the due date.
 */
export function suggestReminder(dueDateStr: string): string {
  if (!isValidDateString(dueDateStr)) return '1d_before';

  const [y, m, d] = dueDateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d, 23, 59, 59);
  const now = new Date();
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return '2h_before';
  if (diffDays <= 3) return 'morning_of';
  return '1d_before';
}

/**
 * Proposes a structured task from a Notice.
 * NEVER silently invents a deadline.
 */
export function proposeTaskFromNotice(notice: Notice): ProposedTask {
  let title = (notice.title || '').trim();
  if (notice.actionRequired && notice.actionRequired.length > 5 && notice.actionRequired.length < 80) {
    title = notice.actionRequired.trim();
  }

  title = title.replace(/^(urgent|important|notice|action required):\s*/i, '');

  let dueDate = '';
  let isAmbiguous = false;
  let confidenceReason: string | undefined = undefined;
  let dueTime: string | null = null;

  // 1. Search importantDates for a deadline
  if (notice.importantDates && notice.importantDates.length > 0) {
    const deadlineDateObj = notice.importantDates.find((d) => {
      const lbl = (d.label || '').toLowerCase();
      return ACTIONABLE_KEYWORDS.some((kw) => lbl.includes(kw));
    });

    if (deadlineDateObj && deadlineDateObj.date) {
      const parsed = parseNaturalDate(deadlineDateObj.date);
      if (parsed && parsed.isoDate) {
        dueDate = parsed.isoDate;
        isAmbiguous = parsed.isAmbiguous;
        confidenceReason = parsed.confidenceReason;
      }
    }
  }

  // 2. Fallback to searching text
  if (!dueDate) {
    const textToSearch = `${notice.actionRequired || ''} ${notice.summary || ''} ${notice.title || ''}`;
    const found = parseNaturalDate(textToSearch);
    if (found && found.isoDate) {
      dueDate = found.isoDate;
      isAmbiguous = found.isAmbiguous;
      confidenceReason = found.confidenceReason;
    }
  }

  // 3. Search for time
  const timeFound = extractTime(`${notice.actionRequired || ''} ${notice.summary || ''}`);
  if (timeFound) {
    dueTime = timeFound;
  }

  // 4. If still no date, DO NOT invent a date! Flag as ambiguous with explicit confirmation requirement.
  if (!dueDate) {
    dueDate = '';
    isAmbiguous = true;
    confidenceReason = 'No deadline date was detected in this notice. Please select a due date.';
  }

  const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
    urgent: 'urgent',
    important: 'high',
    normal: 'medium',
    low: 'low',
  };

  return {
    title: title || 'Notice Action Item',
    description: (notice.summary || '').trim(),
    dueDate,
    dueTime,
    reminder: dueDate ? suggestReminder(dueDate) : '1d_before',
    priority: priorityMap[notice.priority] || 'medium',
    source: 'notice',
    sourceId: notice.id,
    sourceTitle: notice.title || 'Campus Notice',
    isAmbiguousDate: isAmbiguous,
    confidenceReason,
  };
}

/**
 * Proposes a structured task from a CampusItem.
 * NEVER silently invents a deadline.
 */
export function proposeTaskFromCampusItem(item: CampusItem): ProposedTask {
  const actionTitle = item.importantActions?.[0] || item.title || 'Campus Deadline Item';
  const rawDate = item.registrationDeadline || item.date || '';
  const parsed = parseNaturalDate(rawDate);

  const dueDate = parsed?.isoDate || '';
  const isAmbiguous = !parsed || parsed.isAmbiguous;
  const confidenceReason = parsed?.confidenceReason || (
    !parsed ? 'No deadline date was detected. Please select a due date.' : undefined
  );

  return {
    title: actionTitle.trim(),
    description: (item.description || '').trim(),
    dueDate,
    dueTime: extractTime(item.endTime || item.startTime || '') || (item.endTime || item.startTime || null),
    reminder: dueDate ? suggestReminder(dueDate) : '1d_before',
    priority: item.type === 'DEADLINE' ? 'high' : 'medium',
    source: 'notice',
    sourceId: item.id,
    sourceTitle: item.title || 'Campus Item',
    isAmbiguousDate: isAmbiguous,
    confidenceReason,
  };
}

/**
 * Proposes a structured task from a private CampusEmail.
 * NEVER silently invents a deadline.
 */
export function proposeTaskFromCampusEmail(email: CampusEmail): ProposedTask {
  const title = (email.importantActions?.[0] || email.subject || 'Follow up on college email').trim();
  const rawDate = email.deadline || email.eventDate || '';
  const parsed = parseNaturalDate(rawDate);

  const dueDate = parsed?.isoDate || '';
  const isAmbiguous = !parsed || parsed.isAmbiguous;
  const confidenceReason = parsed?.confidenceReason || (
    !parsed ? 'No deadline date was detected in this email. Please select a due date.' : undefined
  );

  const priority = email.importance === 'urgent' ? 'urgent' : email.importance === 'high' ? 'high' : 'medium';

  return {
    title,
    description: (email.summary || email.snippet || '').trim(),
    dueDate,
    dueTime: '17:00',
    reminder: dueDate ? suggestReminder(dueDate) : '1d_before',
    priority,
    source: 'gmail',
    sourceId: email.id,
    sourceTitle: email.subject || 'Campus Email',
    isAmbiguousDate: isAmbiguous,
    confidenceReason,
  };
}
