/**
 * Email Sanitizer Service for AI Notice Analysis
 *
 * Enforces strict data minimization before email content is transmitted to AI providers:
 * 1. Strips quoted reply / forward chains.
 * 2. Removes common signatures and legal confidentiality boilerplates.
 * 3. Removes tracking query parameters from URLs while preserving meaningful external links.
 * 4. Normalizes whitespace.
 * 5. Caps total character length at 2500 characters.
 */

const TRACKING_PARAM_NAMES = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'trk',
  '_hsenc',
  '_hsmi',
]);

/**
 * Strips tracking parameters (e.g. utm_*) from a URL while preserving destination and valid query params.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    let modified = false;

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAM_NAMES.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
        modified = true;
      }
    }

    if (!modified) {
      return rawUrl;
    }

    const cleaned = parsed.toString();
    // URL parser adds trailing slash for root domain; return trimmed if originally without
    if (!rawUrl.endsWith('/') && cleaned.endsWith('/') && parsed.pathname === '/') {
      return cleaned.slice(0, -1);
    }
    return cleaned;
  } catch {
    // If not a standard URL, return original
    return rawUrl;
  }
}

/**
 * Sanitizes URLs found in text by stripping tracking query params.
 * Preserves all valid HTTP/HTTPS URLs (never restricts to specific domains).
 */
export function sanitizeUrlsInText(text: string): string {
  return text.replace(/https?:\/\/[^\s)"]+/gi, (matchedUrl) => {
    return sanitizeUrl(matchedUrl);
  });
}

/**
 * Removes quoted reply chains and forwarded headers from email body text.
 */
export function removeQuotedChains(text: string): string {
  // 1. Detect standard quote headers e.g. "On <date>, <sender> wrote:" or "---------- Forwarded message ---------"
  const quoteHeaderRegex = /(?:^|\n)(?:On\s+[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4}[\s\S]*?wrote:|-{3,}\s*Forwarded\s+message\s*-{3,}|From:\s*.*?\nSent:\s*.*?\nTo:\s*.*?\nSubject:)/i;
  const quoteMatch = quoteHeaderRegex.exec(text);
  let cleaned = quoteMatch ? text.slice(0, quoteMatch.index) : text;

  // 2. Remove any remaining blockquote lines starting with >
  cleaned = cleaned
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n');

  return cleaned;
}

/**
 * Removes common email signatures and standard institutional confidentiality disclaimers.
 */
export function removeSignaturesAndBoilerplate(text: string): string {
  let cleaned = text;

  // 1. Remove standard signature delimiter "-- \n" or "--\n"
  const sigDelimiterMatch = /(?:^|\n)--\s*\n[\s\S]*$/m.exec(cleaned);
  if (sigDelimiterMatch) {
    cleaned = cleaned.slice(0, sigDelimiterMatch.index);
  }

  // 2. Remove standard institutional confidentiality notices
  const disclaimerRegexes = [
    /(?:this\s+(?:e-?mail|message|communication)\s+(?:and\s+any\s+(?:attachments?|files?)\s+)?(?:is|are)\s+(?:confidential|intended|privileged)[\s\S]*)/i,
    /(?:disclaimer:\s*(?:the\s+information\s+contained|this\s+message)[\s\S]*)/i,
    /(?:please\s+do\s+not\s+print\s+this\s+e-?mail\s+unless[\s\S]*)/i,
    /(?:save\s+paper[,\s]+save\s+trees[\s\S]*)/i,
    /(?:confidentiality\s+notice:\s*this\s+transmission[\s\S]*)/i,
  ];

  for (const regex of disclaimerRegexes) {
    const match = regex.exec(cleaned);
    if (match) {
      cleaned = cleaned.slice(0, match.index);
    }
  }

  return cleaned;
}

/**
 * Normalizes line endings, multiple consecutive newlines, and internal whitespace.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Enforces a strict maximum character limit on text sent to AI models (default 2500 characters).
 * Preserves clean word boundaries when truncating.
 */
export function capLength(text: string, maxLen = 2500): string {
  if (text.length <= maxLen) {
    return text;
  }

  const truncated = text.slice(0, maxLen);
  // Find last whitespace within the last 50 chars to avoid cutting a word in half
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen - 50) {
    return truncated.slice(0, lastSpace).trim() + '...';
  }

  return truncated.trim() + '...';
}

/**
 * Main sanitization pipeline for email content before passing to AI Notice Analyzer.
 */
export function sanitizeEmailForAI(rawText: string, maxLen = 2500): string {
  if (!rawText || !rawText.trim()) {
    return '';
  }

  // 1. Strip reply chains
  const noQuotes = removeQuotedChains(rawText);

  // 2. Strip signatures and legal boilerplates
  const noBoilerplate = removeSignaturesAndBoilerplate(noQuotes);

  // 3. Clean URLs (strip tracking params while keeping destination)
  const cleanedUrls = sanitizeUrlsInText(noBoilerplate);

  // 4. Normalize spacing
  const normalized = normalizeWhitespace(cleanedUrls);

  // 5. Enforce strict character cap
  return capLength(normalized, maxLen);
}
