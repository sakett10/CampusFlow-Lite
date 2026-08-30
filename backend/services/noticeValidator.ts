import type { NoticeCandidate, NoticeCategory, NoticePriority } from '../types.js';

export const VALID_NOTICE_CATEGORIES: ReadonlySet<NoticeCategory> = new Set([
  'academic',
  'exam',
  'assignment',
  'administrative',
  'event',
  'placement',
  'admission',
  'hostel',
  'fee',
  'scholarship',
  'alert',
  'general',
]);

export const VALID_NOTICE_PRIORITIES: ReadonlySet<NoticePriority> = new Set([
  'low',
  'normal',
  'important',
  'urgent',
]);

export class NoticeValidationError extends Error {
  public readonly fieldErrors: string[];

  constructor(message: string, fieldErrors: string[] = []) {
    super(message);
    this.name = 'NoticeValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export function isValidUrl(urlStr: unknown): boolean {
  if (typeof urlStr !== 'string' || !urlStr.trim()) {
    return false;
  }
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateNoticeCandidate(
  input: unknown,
  trustedSource?: NoticeCandidate['source'],
): NoticeCandidate {
  if (!input || typeof input !== 'object') {
    throw new NoticeValidationError('Candidate must be a non-null object', ['input']);
  }

  const errors: string[] = [];
  const raw = input as Record<string, unknown>;

  // 1. Title validation
  const rawTitle = raw.title;
  if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
    errors.push('title is required and must be a non-empty string');
  }
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';

  // 2. Summary validation
  const rawSummary = raw.summary;
  if (typeof rawSummary !== 'string' || !rawSummary.trim()) {
    errors.push('summary is required and must be a non-empty string');
  }
  const summary = typeof rawSummary === 'string' ? rawSummary.trim() : '';

  // 3. Category validation
  const rawCategory = typeof raw.category === 'string' ? raw.category.trim().toLowerCase() : '';
  if (!VALID_NOTICE_CATEGORIES.has(rawCategory as NoticeCategory)) {
    errors.push(`category must be one of: ${Array.from(VALID_NOTICE_CATEGORIES).join(', ')}`);
  }
  const category = rawCategory as NoticeCategory;

  // 4. Priority validation
  const rawPriority = typeof raw.priority === 'string' ? raw.priority.trim().toLowerCase() : '';
  if (!VALID_NOTICE_PRIORITIES.has(rawPriority as NoticePriority)) {
    errors.push(`priority must be one of: ${Array.from(VALID_NOTICE_PRIORITIES).join(', ')}`);
  }
  const priority = rawPriority as NoticePriority;

  // 5. Source validation
  let source: NoticeCandidate['source'];
  if (trustedSource) {
    source = {
      provider: 'gmail',
      messageId: trustedSource.messageId,
      sender: trustedSource.sender,
      subject: trustedSource.subject,
    };
  } else {
    const rawSource = raw.source as Record<string, unknown> | undefined;
    if (!rawSource || typeof rawSource !== 'object') {
      errors.push('source is required and must be an object');
    } else {
      const messageId = typeof rawSource.messageId === 'string' ? rawSource.messageId.trim() : '';
      if (!messageId) {
        errors.push('source.messageId is required and cannot be empty');
      }
      source = {
        provider: 'gmail',
        messageId,
        sender: typeof rawSource.sender === 'string' ? rawSource.sender.trim() : '',
        subject: typeof rawSource.subject === 'string' ? rawSource.subject.trim() : '',
      };
    }
  }

  if (errors.length > 0) {
    throw new NoticeValidationError(`NoticeCandidate validation failed: ${errors.join('; ')}`, errors);
  }

  // Construct validated candidate with safe normalization of optional fields
  const candidate: NoticeCandidate = {
    title,
    summary,
    category,
    priority,
    source: source!,
  };

  // 6. Optional string fields
  if (typeof raw.audience === 'string' && raw.audience.trim()) {
    candidate.audience = raw.audience.trim();
  }

  if (typeof raw.isCampusWide === 'boolean') {
    candidate.isCampusWide = raw.isCampusWide;
  }

  if (typeof raw.isPersonal === 'boolean') {
    candidate.isPersonal = raw.isPersonal;
  }

  if (typeof raw.actionRequired === 'string' && raw.actionRequired.trim()) {
    candidate.actionRequired = raw.actionRequired.trim();
  }


  if (typeof raw.venue === 'string' && raw.venue.trim()) {
    candidate.venue = raw.venue.trim();
  }

  // 7. Optional importantDates
  if (Array.isArray(raw.importantDates)) {
    const validDates = raw.importantDates
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const label = typeof item.label === 'string' ? item.label.trim() : '';
        const date = typeof item.date === 'string' ? item.date.trim() : '';
        if (label && date) {
          return { label, date };
        }
        return null;
      })
      .filter((item): item is { label: string; date: string } => item !== null);

    if (validDates.length > 0) {
      candidate.importantDates = validDates;
    }
  }

  // 8. Optional links
  if (Array.isArray(raw.links)) {
    const validLinks = raw.links
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Link';
        if (isValidUrl(url)) {
          return { label, url };
        }
        return null;
      })
      .filter((item): item is { label: string; url: string } => item !== null);

    if (validLinks.length > 0) {
      candidate.links = validLinks;
    }
  }

  // 9. Optional documents
  if (Array.isArray(raw.documents)) {
    const validDocs = raw.documents
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Document';
        if (isValidUrl(url)) {
          return { label, url };
        }
        return null;
      })
      .filter((item): item is { label: string; url: string } => item !== null);

    if (validDocs.length > 0) {
      candidate.documents = validDocs;
    }
  }

  return candidate;
}
