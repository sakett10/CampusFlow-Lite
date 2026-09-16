import type { NoticeCategory } from '../types.js';
import {
  isCampusAffineSender,
  isTrustedInstitutionSender,
  isStudentInstitutionSender,
  isAcademicAuthoritySender,
} from '../config/institutions.js';

export { isCampusAffineSender };

/**
 * Campus-relevance taxonomy for the first-stage (pre-persistence) classification gate.
 *
 * The gate prioritizes HIGH RECALL for campus-relevant mail while protecting user privacy:
 *  - 'campus'      -> confident campus/academic email: persist + send to second-stage analyzer.
 *  - 'uncertain'   -> ambiguous (has some campus signal but unconfirmed): persist + let the
 *                     second-stage AI analyzer decide. Must never be silently discarded.
 *  - 'personal'    -> high-confidence private/interpersonal email: discard (zero persistence).
 *  - 'promotional' -> high-confidence marketing/newsletter/OTP email: discard (zero persistence).
 */
export type ClassificationOutcome = 'campus' | 'personal' | 'promotional' | 'uncertain';

export interface EmailClassificationResult {
  outcome: ClassificationOutcome;
  /** Confident campus/academic email (outcome === 'campus'). Retained for backward compatibility. */
  isAcademic: boolean;
  /**
   * True when the email is potentially campus-relevant and must reach the second-stage
   * notice analyzer instead of being silently discarded ('campus' or 'uncertain').
   */
  isCampusRelevant: boolean;
  isPersonal: boolean;
  isPromotionalOrNewsletter: boolean;
  reason: string;
  category: NoticeCategory;
  confidence: 'high' | 'medium' | 'low';
}

// 1. Known non-academic domains and senders (marketing, shopping, food, rides, social, external job portals)
const NON_ACADEMIC_DOMAIN_PATTERNS = [
  'quora.com',
  'substack.com',
  'medium.com',
  'indeed.com',
  'jobalert.indeed.com',
  'naukri.com',
  'internshala.com',
  'glassdoor.com',
  'amazon.',
  'flipkart.',
  'asics.',
  'myntra.',
  'ajio.',
  'zara.',
  'nike.',
  'swiggy.',
  'zomato.',
  'uber.',
  'ola.',
  'netflix.',
  'spotify.',
  'youtube.',
  'github.com',
  'gitlab.com',
  'linkedin.com',
  'facebookmail.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'redditmail.com',
  'cracku.in',
  'byjus.com',
  'unacademy.com',
];

// 2. Non-academic / promotional keywords in subject or sender
const PROMOTIONAL_SUBJECT_KEYWORDS = [
  'digest',
  'daily newsletter',
  'weekly newsletter',
  'monthly newsletter',
  'unsubscribe',
  'limited time:',
  'deal of the day',
  '% off',
  'coupon',
  'discount code',
  'order confirmed',
  'order delivered',
  'your receipt',
  'shipping update',
  'track your order',
  'job recommendations',
  'is hiring for',
  'jobs for you',
  'flash sale',
  'posted new notes',
  'a third-party oauth application has been added',
  'security alert',
  'verify your email',
  'password reset',
  'one-time password',
  'your otp is',
];

// 3. Individual candidate document verification / credential verifications (not deadlines/tasks)
const PERSONAL_VERIFICATION_PATTERNS = [
  'fresher - certificate verification',
  'certificate verification',
  'candidate [',
  'physical fitness certificate',
  'missing 12th mark list',
  'pending document upload',
  'provisional admission letter required',
  'upload missing',
  'document verification process',
];

// 4. Casual student personal conversation patterns (even from school domain)
const PERSONAL_CONVERSATION_PATTERNS = [
  'selling my',
  'anyone want to buy',
  'cycle for sale',
  'cooler for sale',
  'mattress for sale',
  'lost my',
  'lost water bottle',
  'found keys',
  'found umbrella',
  'lunch today',
  'dinner tonight',
  'free for lunch',
  'free for dinner',
  'party tonight',
  'where are you',
  'call me when free',
  'happy birthday',
  'congratulations on your',
  'congrats bro',
  'movie tonight',
  'plans for the weekend',
  'long time no see',
  "what's up",
];


/**
 * 6. Broad campus-relevant topic vocabulary (subject/body).
 *
 * Deliberately broader than the old "academic-only" list: first-stage classification is a
 * campus-relevance recall gate, not a final category decision. Genuine campus mail routinely
 * arrives from senders outside the known authority list (e.g. course notifications, fest
 * portals, payment systems) using generic vocabulary such as class/lecture/hostel/payment.
 * Generic promotional material is already discarded by (1) and (2) BEFORE these signals are
 * evaluated, so promo emails containing academic words remain filtered.
 */
const CAMPUS_TOPIC_SIGNALS = [
  // Academic / curriculum
  'circular',
  'notice',
  'notification',
  'exam',
  'fat',
  'cat 1',
  'cat 2',
  'midterm',
  'end term',
  're-exam',
  'model exam',
  'hall ticket',
  'seating arrangement',
  'timetable',
  'class test',
  'mock test',
  'quiz',
  'assignment',
  'project proposal',
  'project review',
  'capstone project',
  'lab report',
  'submission deadline',
  'submission',
  'deadline',
  'due date',
  'class',
  'lecture',
  'course',
  'semester',
  'lab',
  'viva',
  'syllabus',
  'curriculum',
  'attendance',
  'grade release',
  'grades',
  'cgpa',
  'bonafide',
  'transcript',
  'id card',
  // Administration / registration
  'course registration',
  'registration',
  'branch transfer',
  'counselling',
  'admissions',
  'add/drop',
  'academic calendar',
  'winter semester',
  'fall semester',
  'instructional days',
  'attendance threshold',
  // Fees / payments
  'fee',
  'fees',
  'fee payment deadline',
  'fee payment',
  'payment due',
  'payment reminder',
  'installment',
  'tuition fee',
  // Student life / campus
  'campus',
  'hostel',
  'mess',
  'warden',
  'library',
  'club',
  'chapter',
  'fest',
  'cultural fest',
  'sports',
  'tournament',
  'tryouts',
  'audition',
  'recruitment',
  'induction',
  'orientation programme',
  'freshers orientation',
  'value-added program',
  // Events / talks
  'hackathon',
  'ideathon',
  'workshop',
  'seminar',
  'webinar',
  'conclave',
  'symposium',
  'conference',
  'distinguished lecture',
  'guest lecture',
  // Scholarships / awards
  'scholarship',
  'kalam award',
  'merit award',
  // Careers
  'internship to cdc',
  'pat internship',
  'challenge - international student competition',
];

const TOPIC_SIGNAL_REGEXES = CAMPUS_TOPIC_SIGNALS.map((signal) => {
  const normalized = signal.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return new RegExp(`\\b${normalized}\\b`);
});

function hasCampusTopicSignal(text: string): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return TOPIC_SIGNAL_REGEXES.some((regex) => regex.test(normalized));
}

function hasWord(text: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const escaped = p.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  });
}

function deriveCampusCategory(subject: string): NoticeCategory {
  const s = subject.toLowerCase();
  if (
    hasWord(s, [
      'exam',
      'exams',
      'fat',
      'cat 1',
      'cat 2',
      'cat',
      'quiz',
      'midterm',
      'end term',
      're-exam',
      'model exam',
      'timetable',
      'seating arrangement',
      'hall ticket',
    ])
  ) {
    return 'exam';
  } else if (
    hasWord(s, [
      'assignment',
      'assignments',
      'project',
      'projects',
      'submission',
      'submissions',
      'homework',
      'lab report',
      'capstone',
    ])
  ) {
    return 'assignment';
  } else if (hasWord(s, ['scholarship', 'scholarships', 'award', 'awards', 'financial aid', 'merit'])) {
    return 'scholarship';
  } else if (hasWord(s, ['fee', 'fees', 'payment', 'installment', 'dues', 'fine', 'tuition'])) {
    return 'fee';
  } else if (
    hasWord(s, [
      'hackathon',
      'workshop',
      'conclave',
      'lecture',
      'seminar',
      'webinar',
      'symposium',
      'fest',
      'club',
      'sports',
      'tournament',
      'tryouts',
      'audition',
      'induction',
      'orientation',
    ])
  ) {
    return 'event';
  } else if (
    hasWord(s, [
      'internship',
      'cdc',
      'placement',
      'pat office',
      'recruitment',
      'campus drive',
    ])
  ) {
    return 'placement';
  } else if (
    hasWord(s, [
      'admission',
      'counselling',
      'branch transfer',
      'course registration',
      'registration',
      'add/drop',
    ])
  ) {
    return 'admission';
  } else if (hasWord(s, ['hostel', 'mess', 'warden', 'room allocation', 'curfew'])) {
    return 'hostel';
  } else if (
    hasWord(s, [
      'emergency',
      'campus alert',
      'safety alert',
      'cyclone',
      'weather alert',
      'campus closure',
    ])
  ) {
    return 'alert';
  } else if (
    hasWord(s, [
      'circular',
      'administrative',
      'bonafide',
      'transcript',
      'id card',
      'academic calendar',
    ])
  ) {
    return 'administrative';
  }
  return 'academic';
}

function campusResult(
  reason: string,
  category: NoticeCategory,
  confidence: 'high' | 'medium' | 'low',
): EmailClassificationResult {
  return {
    outcome: 'campus',
    isAcademic: true,
    isCampusRelevant: true,
    isPersonal: false,
    isPromotionalOrNewsletter: false,
    reason,
    category,
    confidence,
  };
}

function uncertainResult(reason: string, category: NoticeCategory): EmailClassificationResult {
  return {
    outcome: 'uncertain',
    isAcademic: false,
    isCampusRelevant: true,
    isPersonal: false,
    isPromotionalOrNewsletter: false,
    reason,
    category,
    confidence: 'low',
  };
}

function personalResult(reason: string): EmailClassificationResult {
  return {
    outcome: 'personal',
    isAcademic: false,
    isCampusRelevant: false,
    isPersonal: true,
    isPromotionalOrNewsletter: false,
    reason,
    category: 'general',
    confidence: 'high',
  };
}

function promotionalResult(reason: string): EmailClassificationResult {
  return {
    outcome: 'promotional',
    isAcademic: false,
    isCampusRelevant: false,
    isPersonal: false,
    isPromotionalOrNewsletter: true,
    reason,
    category: 'general',
    confidence: 'high',
  };
}

export function classifyEmail(message: {
  from?: string | null;
  sender?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  body?: string | null;
  snippet?: string | null;
}): EmailClassificationResult {
  const sender = (message.sender || message.from || '').toLowerCase();
  const subject = (message.subject || '').toLowerCase();
  const rawBody = (message.bodyText || message.body || '').trim();
  const hasBody = rawBody.length > 0;
  const text = `${subject} ${(rawBody || message.snippet || '').toLowerCase()}`;

  // Step 1: Check known promotional / marketing / newsletter domains
  for (const domain of NON_ACADEMIC_DOMAIN_PATTERNS) {
    if (sender.includes(domain)) {
      return promotionalResult(
        `Sender domain '${domain}' is a non-academic newsletter, service, or promotional source`,
      );
    }
  }

  // Step 2: Check promotional / newsletter subject keywords (incl. OTP / verification)
  for (const kw of PROMOTIONAL_SUBJECT_KEYWORDS) {
    if (subject.includes(kw)) {
      return promotionalResult(`Subject matches promotional or newsletter pattern: '${kw}'`);
    }
  }

  // Step 3: Check individual candidate document verifications / credentials
  for (const pat of PERSONAL_VERIFICATION_PATTERNS) {
    if (subject.includes(pat) || text.includes(pat)) {
      return personalResult(`Matches personal identity or credential verification pattern: '${pat}'`);
    }
  }

  // Step 4: Check student personal casual conversations (even if sent from university domain)
  for (const pat of PERSONAL_CONVERSATION_PATTERNS) {
    if (subject.includes(pat) || text.includes(pat)) {
      return personalResult(`Matches personal conversation or informal exchange: '${pat}'`);
    }
  }

  // Finding 1: Handle missing sender header (e.g. test mock messages)
  if (!sender) {
    return uncertainResult('No sender header provided', 'general');
  }

  const hasCampusTopic = hasCampusTopicSignal(text);
  const isAffine = isCampusAffineSender(sender);
  const isTrusted = isTrustedInstitutionSender(sender);
  const isStudent = isStudentInstitutionSender(sender);
  const hasAuthority = isAcademicAuthoritySender(sender);

  // Step 5: Privacy guard - student-to-student mail without any campus topic signal
  // (e.g. casual conversation from a student domain) stays personal even though the
  // student domain is technically an institution domain.
  if (isStudent && !hasCampusTopic) {
    return personalResult('Student-domain sender without any campus-relevant topic signal');
  }

  // Step 6: Confident campus email:
  // - Verified official authority AND campus topic (non-student)
  // - OR official non-student trusted institution domain sender AND campus topic
  if (!isStudent && (isTrusted || hasAuthority) && hasCampusTopic) {
    return campusResult(
      'Verified official university authority and campus-relevant subject content',
      deriveCampusCategory(subject),
      'high',
    );
  }

  // Also handle student domain sender who holds a recognized campus role/club + campus topic
  if (isStudent && hasAuthority && hasCampusTopic) {
    return campusResult(
      'Recognized student campus role/club announcement with campus-relevant content',
      deriveCampusCategory(subject),
      'medium',
    );
  }

  // Step 7: Recognized campus authority or trusted institution domain without an explicit topic match.
  // Without body text, defer to the second stage so body content can be evaluated
  // (keeps the two-stage metadata -> body refinement intact).
  if (hasAuthority || (isTrusted && !isStudent)) {
    if (!hasBody) {
      return uncertainResult(
        'Official academic sender but specific campus topic not detected in metadata/snippet; requires second-stage body evaluation',
        'administrative',
      );
    }
    if (hasAuthority) {
      return campusResult('Official university department sender', deriveCampusCategory(subject), 'medium');
    }
    return uncertainResult(
      'Sender belongs to university domain family but no campus topic was detected in body; requires second-stage evaluation',
      'administrative',
    );
  }

  // Step 8: Campus topic from an unrecognized external sender (e.g. course notification portals,
  // fest/payment systems, classroom services). High-recall path: marked 'uncertain' so it reaches
  // second-stage analysis, but NOT marked 'campus', ensuring unknown senders are never automatically persisted.
  if (hasCampusTopic) {
    return uncertainResult(
      'Campus-relevant topic detected but sender is not a verified academic authority; requires second-stage evaluation',
      deriveCampusCategory(subject),
    );
  }

  // Step 9: Campus-affine sender domain (university family incl. service/portal subdomains)
  // without any topic signal: ambiguous -> let the second-stage analyzer decide instead of
  // silently discarding potential campus mail.
  if (isAffine) {
    return uncertainResult(
      'Sender belongs to the university domain family but no campus topic was detected; requires second-stage evaluation',
      'administrative',
    );
  }

  // Step 10: Default: no campus signal at all from an unknown sender -> personal / non-campus
  // to protect privacy (spam, newsletters from unknown domains, private correspondence).
  return personalResult('Does not match any campus authority, campus topic, or university domain signal');
}
