import { GoogleGenAI } from '@google/genai';
import type {
  NoticeCandidate,
  StructuredGmailMessage,
} from '../types.js';


import { validateNoticeCandidate } from './noticeValidator.js';

export interface NoticeAnalyzer {
  analyze(message: StructuredGmailMessage): Promise<NoticeCandidate>;
}

const noticeCandidateSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    category: {
      type: 'string',
      enum: [
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
      ],
    },
    priority: {
      type: 'string',
      enum: ['low', 'normal', 'important', 'urgent'],
    },
    audience: { type: 'string', nullable: true },
    importantDates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['label', 'date'],
      },
    },
    actionRequired: { type: 'string', nullable: true },
    venue: { type: 'string', nullable: true },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['label', 'url'],
      },
    },
    documents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['label', 'url'],
      },
    },
    isCampusWide: { type: 'boolean' },
    isPersonal: { type: 'boolean' },
  },
  required: ['title', 'summary', 'category', 'priority'],
  additionalProperties: false,
};

export const buildNoticePrompt = (message: StructuredGmailMessage): string => `
You are the CampusFlow Notice Analyzer. Transform the university email into a clean, concise, information-dense campus notice candidate.

STRICT ANTI-HALLUCINATION RULES:
1. Use ONLY facts directly mentioned in the email.
2. NEVER invent dates, deadlines, venues, links, documents, eligibility criteria, organizations, people, or required actions.
3. If an optional detail is missing or ambiguous, leave it null/empty.
4. Summary: Write a concise 1-3 sentence summary explaining what the notice is about without fluff.
5. Category: Choose exactly one category from:
   - academic (curriculum, classes, syllabus, faculty)
   - exam (FAT, CAT, midterm, quiz, re-exam schedules/seating)
   - assignment (course projects, homework deadlines)
   - administrative (ID cards, clearances, certificates, circulars)
   - event (workshops, hackathons, guest lectures, club fests)
   - placement (campus recruitment, internship drives, company talks)
   - admission (counseling, semester registration, branch transfer)
   - hostel (room allocation, mess, curfews, maintenance)
   - fee (tuition payments, fine deadlines, refund policies)
   - scholarship (merit awards, financial aid, government schemes)
   - alert (urgent safety, weather disruptions, emergency closures)
   - general (miscellaneous announcements)
6. Priority: Choose exactly one:
   - urgent (immediate action within 24h, campus closures, critical examination changes)
   - important (deadlines within 7 days, mandatory fee/registration windows, official circulars)
   - normal (standard updates, general events, regular notices)
   - low (informational tips, optional surveys)
   Do NOT mark every notice as urgent.
7. Links & Documents: Extract ONLY real HTTP/HTTPS URLs present in the email content. NEVER invent URLs.
8. Classification of Campus-Wide vs Personal:
   - isCampusWide (boolean): Set to TRUE if this email is a broad campus circular, sporting event, club announcement, hackathon, workshop, exam timetable, or academic notice intended for students, groups, batches, or the university. Set to FALSE if it is an individual private email.
   - isPersonal (boolean): Set to TRUE if this email is addressed to an individual specific student/candidate about their specific personal credentials, private document verification, 1-on-1 verification requests, OTPs, or password resets (e.g. "Dear Candidate [ 2026033287 ] upload your missing document"). Set to FALSE for general notices.

EMAIL SUBJECT: ${message.subject || 'No Subject'}
EMAIL SENDER: ${message.sender || 'Unknown Sender'}
EMAIL DATE: ${message.date || 'Unknown Date'}
EMAIL CONTENT:
"""
${message.bodyText || message.snippet || ''}
"""
`;


export class AINoticeAnalyzer implements NoticeAnalyzer {
  private async analyzeWithGemini(promptText: string): Promise<Record<string, unknown>> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        responseSchema: noticeCandidateSchema,
      },
    });

    if (!response.text) {
      throw new Error('No response from Gemini');
    }

    return JSON.parse(response.text);
  }

  private async analyzeWithGroq(promptText: string): Promise<Record<string, unknown>> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured.');
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: 'You extract structured notice information from university emails. Return only valid JSON.',
          },
          {
            role: 'user',
            content: promptText,
          },
        ],
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'notice_candidate',
            strict: true,
            schema: noticeCandidateSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from Groq');
    }

    return JSON.parse(content);
  }

  async analyze(message: StructuredGmailMessage): Promise<NoticeCandidate> {
    const promptText = buildNoticePrompt(message);
    let rawResult: Record<string, unknown>;

    try {
      rawResult = await this.analyzeWithGemini(promptText);
    } catch (geminiError) {
      console.error('Gemini Notice Analysis failed, attempting Groq fallback:', geminiError);

      try {
        rawResult = await this.analyzeWithGroq(promptText);
      } catch (groqError) {
        console.error('Groq fallback also failed:', groqError);
        throw new Error(
          'Both AI providers failed to analyze the notice. Please try again later.',
          { cause: groqError },
        );
      }
    }

    const trustedSource: NoticeCandidate['source'] = {
      provider: 'gmail',
      messageId: message.id,
      sender: message.sender,
      subject: message.subject,
    };

    return validateNoticeCandidate(rawResult, trustedSource);
  }
}

// Module-level dependency injection for testing
let activeAnalyzer: NoticeAnalyzer = new AINoticeAnalyzer();

export const setNoticeAnalyzer = (analyzer: NoticeAnalyzer): void => {
  activeAnalyzer = analyzer;
};

export const resetNoticeAnalyzer = (): void => {
  activeAnalyzer = new AINoticeAnalyzer();
};

export const getNoticeAnalyzer = (): NoticeAnalyzer => activeAnalyzer;

export const noticeAnalyzerService = {
  analyze: (message: StructuredGmailMessage): Promise<NoticeCandidate> => {
    return activeAnalyzer.analyze(message);
  },
};
