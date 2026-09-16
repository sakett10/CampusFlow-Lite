/**
 * Institution Identity Configuration and Domain Matching.
 *
 * Provides extensible multi-institution support (VIT, NLU, ATLAS, NM College, etc.)
 * with strict domain-boundary matching to prevent false positives (e.g. vitaminshoppe.com).
 *
 * Separates:
 *  1. Institution Identity (trusted domains, boundary checking, authority patterns)
 *  2. Campus Relevance (evaluated in emailClassifier.service.ts)
 *  3. Notice Classification (academic, exam, fee, etc.)
 */

export interface InstitutionConfig {
  id: string;
  name: string;
  /** Authoritative root domains for the institution (subdomains match via domain-boundary) */
  domains: string[];
  /** Dedicated student email domains where student-to-student personal mail may originate */
  studentDomains?: string[];
  /** Institution-specific authority or portal keywords */
  authorityPatterns?: string[];
}

/**
 * Generic mailbox providers that must NEVER be treated as institutional domains.
 */
export const GENERIC_MAILBOX_DOMAINS: readonly string[] = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'yahoo.co.in',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'aol.com',
  'mail.com',
  'gmx.com',
  'yandex.com',
];

export const DEFAULT_INSTITUTIONS: InstitutionConfig[] = [
  {
    id: 'vit',
    name: 'Vellore Institute of Technology',
    domains: [
      'vit.ac.in',
    ],
    studentDomains: [
      'vitstudent.ac.in',
    ],
    authorityPatterns: [
      'vit business school',
      'v-space',
      'vitol',
      'pat office',
      'group, vellore campus',
      'group, chennai campus',
      'periyar evr',
      'smec',
      'site',
      'score',
      'sense',
      'select',
    ],
  },
  {
    id: 'mnlu_mumbai',
    name: 'Maharashtra National Law University Mumbai',
    domains: [
      'mnlumumbai.edu.in',
    ],
    studentDomains: [],
    authorityPatterns: [
      'mnlu',
      'mnlu mumbai',
      'moot court',
      'examination cell',
      'vice chancellor',
      'vc office',
      'registrar office',
    ],
  },
];

let activeInstitutions: InstitutionConfig[] = [...DEFAULT_INSTITUTIONS];

/**
 * Returns all currently registered institution configurations.
 */
export function getInstitutions(): InstitutionConfig[] {
  return activeInstitutions;
}

/**
 * Registers an additional institution or updates an existing one by id.
 * Allows extending CampusFlow without modifying core classification logic.
 */
export function registerInstitution(config: InstitutionConfig): void {
  const index = activeInstitutions.findIndex((i) => i.id === config.id);
  if (index >= 0) {
    activeInstitutions[index] = config;
  } else {
    activeInstitutions.push(config);
  }
}

/**
 * Resets active institutions to default set. Useful for test isolation.
 */
export function resetInstitutions(): void {
  activeInstitutions = [...DEFAULT_INSTITUTIONS];
}

/**
 * Extracts a normalized domain hostname from a sender string or email address.
 * Returns null if no valid email or domain structure is present (e.g. fake display name "Vitality Team").
 */
export function extractDomainFromSender(sender: string): string | null {
  if (!sender) return null;
  const trimmed = sender.trim();
  if (!trimmed) return null;

  // Extract from angle brackets if present: "Display Name <user@domain.com>"
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  const emailCandidate = bracketMatch ? bracketMatch[1].trim() : trimmed;

  const atIndex = emailCandidate.lastIndexOf('@');
  const rawDomain = atIndex !== -1 ? emailCandidate.slice(atIndex + 1) : emailCandidate;
  const domain = rawDomain.toLowerCase().trim().replace(/^[./]+|[./]+$/g, '');

  // Must contain at least one dot and have valid domain label characters
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return null;
  }

  return domain;
}

/**
 * Exact domain-boundary matching: candidate must equal targetDomain OR end with `.${targetDomain}`.
 * Prevents substring collisions like "vitaminshoppe.com" matching "vit.ac.in" or "vitality-app.io".
 */
export function matchesDomainBoundary(candidateDomain: string, targetDomain: string): boolean {
  if (!candidateDomain || !targetDomain) return false;
  const cand = candidateDomain.toLowerCase().trim();
  const targ = targetDomain.toLowerCase().trim();
  if (cand === targ) return true;
  return cand.endsWith('.' + targ);
}

/**
 * Checks whether a domain or sender belongs to a generic public mailbox provider (Gmail, Outlook, Yahoo, etc.).
 * Generic mailbox domains must NEVER be treated as institutional domains.
 */
export function isGenericMailboxDomain(domainOrSender: string): boolean {
  if (!domainOrSender) return false;
  const domain = extractDomainFromSender(domainOrSender) || domainOrSender.toLowerCase().trim();
  return GENERIC_MAILBOX_DOMAINS.some((generic) => matchesDomainBoundary(domain, generic));
}

/**
 * Resolves which registered institution a sender belongs to, if any.
 * Returns null for generic mailbox providers or unrecognized domains.
 */
export function getInstitutionForSender(sender: string): InstitutionConfig | null {
  const domain = extractDomainFromSender(sender);
  if (!domain) return null;
  if (isGenericMailboxDomain(domain)) return null;

  for (const inst of getInstitutions()) {
    for (const d of inst.domains) {
      if (matchesDomainBoundary(domain, d)) return inst;
    }
    if (inst.studentDomains) {
      for (const sd of inst.studentDomains) {
        if (matchesDomainBoundary(domain, sd)) return inst;
      }
    }
  }
  return null;
}

/**
 * Checks if the sender belongs to any recognized university domain family (root domains or student domains).
 * Explicitly rejects generic mailbox providers (gmail.com, outlook.com, etc.).
 */
export function isCampusAffineSender(sender: string): boolean {
  const domain = extractDomainFromSender(sender);
  if (!domain) return false;
  if (isGenericMailboxDomain(domain)) return false;

  for (const inst of getInstitutions()) {
    for (const d of inst.domains) {
      if (matchesDomainBoundary(domain, d)) return true;
    }
    if (inst.studentDomains) {
      for (const sd of inst.studentDomains) {
        if (matchesDomainBoundary(domain, sd)) return true;
      }
    }
  }
  return false;
}

/**
 * Checks if the sender belongs specifically to an institution's official root domains (non-student authority domain).
 * Explicitly rejects generic mailbox providers.
 */
export function isTrustedInstitutionSender(sender: string): boolean {
  const domain = extractDomainFromSender(sender);
  if (!domain) return false;
  if (isGenericMailboxDomain(domain)) return false;

  for (const inst of getInstitutions()) {
    for (const d of inst.domains) {
      if (matchesDomainBoundary(domain, d)) return true;
    }
  }
  return false;
}

/**
 * Checks if the sender is from a student domain across any configured institution.
 * Explicitly rejects generic mailbox providers and unknown non-institutional student prefixes.
 */
export function isStudentInstitutionSender(sender: string): boolean {
  const domain = extractDomainFromSender(sender);
  if (!domain) return false;
  if (isGenericMailboxDomain(domain)) return false;

  for (const inst of getInstitutions()) {
    if (inst.studentDomains) {
      for (const sd of inst.studentDomains) {
        if (matchesDomainBoundary(domain, sd)) return true;
      }
    }
  }

  // Student subdomains must be anchored to an authorized institution root domain
  // (e.g. student.vit.ac.in or student.mnlumumbai.edu.in if registered)
  for (const inst of getInstitutions()) {
    for (const d of inst.domains) {
      if (matchesDomainBoundary(domain, d) && (domain.startsWith('student.') || domain.includes('.student.'))) {
        return true;
      }
    }
  }

  return false;
}

const GENERAL_ACADEMIC_SHORT_REGEX = /\b(hod|cdc)\b/i;

const GENERAL_ACADEMIC_AUTHORITY_PATTERNS = [
  'dean',
  'director',
  'head of department',
  'registrar',
  'proctor',
  'warden',
  'controller of examination',
  'controller of examinations',
  'coe',
  'exam cell',
  'examination cell',
  'academics',
  'academic research',
  'student welfare',
  'central library',
  'moodle',
  'canvas',
  'blackboard',
  'placement',
  'placement cell',
  'counselling',
  'admissions',
  'registration',
  'branch transfer',
  'academic coordinator',
  'course instructor',
  'course assistant',
  'faculty',
  'professor',
];

/**
 * Detects whether the sender header contains academic authority signals.
 */
export function isAcademicAuthoritySender(sender: string): boolean {
  if (!sender) return false;
  const s = sender.toLowerCase();

  if (GENERAL_ACADEMIC_SHORT_REGEX.test(s)) return true;
  if (GENERAL_ACADEMIC_AUTHORITY_PATTERNS.some((pat) => s.includes(pat))) return true;

  for (const inst of getInstitutions()) {
    if (inst.authorityPatterns?.some((pat) => s.includes(pat.toLowerCase()))) {
      return true;
    }
  }

  return false;
}
