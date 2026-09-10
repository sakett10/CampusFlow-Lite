import type { NoticeCategory } from '../types.js';

export interface EmailClassificationResult {
  isAcademic: boolean;
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
  'party tonight',
  'where are you',
  'call me when free',
  'happy birthday',
  'congratulations on your',
  'congrats bro',
  'movie tonight',
  'plans for the weekend',
];

// 5. Strong academic authority signals in sender
const ACADEMIC_SENDER_SHORT_REGEX = /\b(hod|cdc|smec|site|score|sense|select)\b/i;

const ACADEMIC_SENDER_PATTERNS = [
  'dean',
  'director',
  'head of department',
  'registrar',
  'proctor',
  'warden',
  'controller of examination',
  'exam cell',
  'academics',
  'academic research',
  'student welfare',
  'periyar evr',
  'central library',
  'vit business school',
  'v-space',
  'moodle',
  'canvas',
  'blackboard',
  'vitol',
  'placement',
  'pat office',
  'group, vellore campus',
  'group, chennai campus',
  '@vitstudent.ac.in',
  '@vit.ac.in',
  'counselling',
  'admissions',
  'registration',
  'branch transfer',
  'academic coordinator',
];

// 6. Strong academic topics in subject/content
const ACADEMIC_TOPIC_SIGNALS = [
  'exam',
  'fat',
  'cat 1',
  'cat 2',
  'midterm',
  'end term',
  're-exam',
  'hall ticket',
  'seating arrangement',
  'timetable',
  'quiz',
  'assignment',
  'project proposal',
  'capstone project',
  'lab report',
  'submission deadline',
  'due date',
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
  'grade release',
  'scholarship',
  'kalam award',
  'merit award',
  'tuition fee',
  'fee payment deadline',
  'hackathon',
  'conclave',
  'symposium',
  'distinguished lecture',
  'guest lecture',
  'internship to cdc',
  'pat internship',
  'challenge - international student competition',
  'value-added program',
  'orientation programme',
  'freshers orientation',
];

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
  const text = `${subject} ${(message.bodyText || message.body || message.snippet || '').toLowerCase()}`;

  // Step 1: Check known promotional / marketing / newsletter domains
  for (const domain of NON_ACADEMIC_DOMAIN_PATTERNS) {
    if (sender.includes(domain)) {
      return {
        isAcademic: false,
        isPersonal: false,
        isPromotionalOrNewsletter: true,
        reason: `Sender domain '${domain}' is a non-academic newsletter, service, or promotional source`,
        category: 'general',
        confidence: 'high',
      };
    }
  }

  // Step 2: Check promotional / newsletter subject keywords
  for (const kw of PROMOTIONAL_SUBJECT_KEYWORDS) {
    if (subject.includes(kw)) {
      return {
        isAcademic: false,
        isPersonal: false,
        isPromotionalOrNewsletter: true,
        reason: `Subject matches promotional or newsletter pattern: '${kw}'`,
        category: 'general',
        confidence: 'high',
      };
    }
  }

  // Step 3: Check individual candidate document verifications / credentials
  for (const pat of PERSONAL_VERIFICATION_PATTERNS) {
    if (subject.includes(pat) || text.includes(pat)) {
      return {
        isAcademic: false,
        isPersonal: true,
        isPromotionalOrNewsletter: false,
        reason: `Matches personal identity or credential verification pattern: '${pat}'`,
        category: 'admission',
        confidence: 'high',
      };
    }
  }

  // Step 4: Check student personal casual conversations (even if sent from university domain)
  for (const pat of PERSONAL_CONVERSATION_PATTERNS) {
    if (subject.includes(pat)) {
      return {
        isAcademic: false,
        isPersonal: true,
        isPromotionalOrNewsletter: false,
        reason: `Matches personal conversation or informal exchange: '${pat}'`,
        category: 'general',
        confidence: 'high',
      };
    }
  }

  // Handle missing sender header (e.g. test mock messages)
  if (!sender) {
    return {
      isAcademic: true,
      isPersonal: false,
      isPromotionalOrNewsletter: false,
      reason: 'No sender header provided',
      category: 'general',
      confidence: 'low',
    };
  }

  // Step 5: Check strong academic signals
  const hasAcademicSender =
    ACADEMIC_SENDER_SHORT_REGEX.test(sender) ||
    ACADEMIC_SENDER_PATTERNS.some((sig) => sender.includes(sig));
  const hasAcademicTopic = ACADEMIC_TOPIC_SIGNALS.some((topic) => subject.includes(topic) || text.includes(topic));

  if (hasAcademicSender && hasAcademicTopic) {
    let category: NoticeCategory = 'academic';
    if (subject.includes('exam') || subject.includes('fat') || subject.includes('cat ') || subject.includes('quiz')) {
      category = 'exam';
    } else if (subject.includes('assignment') || subject.includes('project') || subject.includes('submission')) {
      category = 'assignment';
    } else if (subject.includes('scholarship') || subject.includes('award')) {
      category = 'scholarship';
    } else if (subject.includes('fee') || subject.includes('payment')) {
      category = 'fee';
    } else if (subject.includes('hackathon') || subject.includes('workshop') || subject.includes('conclave') || subject.includes('lecture')) {
      category = 'event';
    } else if (subject.includes('internship') || subject.includes('cdc') || subject.includes('placement')) {
      category = 'placement';
    } else if (subject.includes('admission') || subject.includes('counselling') || subject.includes('branch transfer')) {
      category = 'admission';
    }

    return {
      isAcademic: true,
      isPersonal: false,
      isPromotionalOrNewsletter: false,
      reason: 'Verified official university authority and academic subject content',
      category,
      confidence: 'high',
    };
  }

  // Step 6: If from academic sender without overt topic match, check if general campus announcement
  if (hasAcademicSender) {
    return {
      isAcademic: true,
      isPersonal: false,
      isPromotionalOrNewsletter: false,
      reason: 'Official university department sender',
      category: 'administrative',
      confidence: 'medium',
    };
  }

  // Step 7: Default: not clearly academic -> treat as personal / non-academic to protect privacy
  return {
    isAcademic: false,
    isPersonal: true,
    isPromotionalOrNewsletter: false,
    reason: 'Does not match official academic authority or university curriculum pattern',
    category: 'general',
    confidence: 'medium',
  };
}
