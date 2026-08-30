import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StructuredGmailMessage, NoticeCandidate } from './types.js';
import {
  validateNoticeCandidate,
  NoticeValidationError,
  isValidUrl,
} from './services/noticeValidator.js';
import {
  AINoticeAnalyzer,
  setNoticeAnalyzer,
  resetNoticeAnalyzer,
  noticeAnalyzerService,
  buildNoticePrompt,
  type NoticeAnalyzer,
} from './services/noticeAnalyzer.service.js';

describe('Notice Validator Unit Tests', () => {
  const defaultSource: NoticeCandidate['source'] = {
    provider: 'gmail',
    messageId: 'msg_valid_123',
    sender: 'dean@vit.ac.in',
    subject: 'Important Examination Notice',
  };

  it('validates a valid full NoticeCandidate', () => {
    const raw = {
      title: 'Fall Semester FAT Examination Schedule 2026',
      summary: 'The Final Assessment Test schedule has been published on VTOP for all undergraduate programs.',
      category: 'exam',
      priority: 'important',
      audience: 'All B.Tech 2024-2028 Students',
      importantDates: [
        { label: 'Exam Start Date', date: '2026-11-15' },
        { label: 'Hall Ticket Download Deadline', date: '2026-11-10' },
      ],
      actionRequired: 'Download and print hall ticket from VTOP.',
      venue: 'SJT & TT Examination Halls',
      links: [{ label: 'VTOP Portal', url: 'https://vtop.vit.ac.in' }],
      documents: [{ label: 'Official Circular PDF', url: 'https://vtop.vit.ac.in/circulars/fat2026.pdf' }],
      source: defaultSource,
    };

    const validated = validateNoticeCandidate(raw, defaultSource);
    expect(validated.title).toBe(raw.title);
    expect(validated.summary).toBe(raw.summary);
    expect(validated.category).toBe('exam');
    expect(validated.priority).toBe('important');
    expect(validated.audience).toBe('All B.Tech 2024-2028 Students');
    expect(validated.importantDates).toHaveLength(2);
    expect(validated.links).toHaveLength(1);
    expect(validated.documents).toHaveLength(1);
    expect(validated.source.messageId).toBe('msg_valid_123');
  });

  it('validates a minimal notice without fabricating optional fields', () => {
    const raw = {
      title: 'Library Hours Extension',
      summary: 'The Central Library will remain open until 2 AM during exam week.',
      category: 'general',
      priority: 'normal',
    };

    const validated = validateNoticeCandidate(raw, defaultSource);
    expect(validated.title).toBe('Library Hours Extension');
    expect(validated.summary).toBe('The Central Library will remain open until 2 AM during exam week.');
    expect(validated.category).toBe('general');
    expect(validated.priority).toBe('normal');
    expect(validated.audience).toBeUndefined();
    expect(validated.importantDates).toBeUndefined();
    expect(validated.actionRequired).toBeUndefined();
    expect(validated.venue).toBeUndefined();
    expect(validated.links).toBeUndefined();
    expect(validated.documents).toBeUndefined();
  });

  it('rejects candidate with missing or empty title', () => {
    expect(() =>
      validateNoticeCandidate(
        {
          title: '   ',
          summary: 'Some valid summary text',
          category: 'academic',
          priority: 'normal',
        },
        defaultSource,
      ),
    ).toThrow(NoticeValidationError);
  });

  it('rejects candidate with missing or empty summary', () => {
    expect(() =>
      validateNoticeCandidate(
        {
          title: 'Valid Title',
          summary: '',
          category: 'academic',
          priority: 'normal',
        },
        defaultSource,
      ),
    ).toThrow(NoticeValidationError);
  });

  it('rejects candidate with invalid category', () => {
    expect(() =>
      validateNoticeCandidate(
        {
          title: 'Valid Title',
          summary: 'Valid summary',
          category: 'party_and_fun',
          priority: 'normal',
        },
        defaultSource,
      ),
    ).toThrow(NoticeValidationError);
  });

  it('rejects candidate with invalid priority', () => {
    expect(() =>
      validateNoticeCandidate(
        {
          title: 'Valid Title',
          summary: 'Valid summary',
          category: 'event',
          priority: 'apocalyptic',
        },
        defaultSource,
      ),
    ).toThrow(NoticeValidationError);
  });

  it('rejects candidate when source.messageId is missing and no defaultSource is provided', () => {
    expect(() =>
      validateNoticeCandidate({
        title: 'Valid Title',
        summary: 'Valid summary',
        category: 'event',
        priority: 'normal',
        source: {
          provider: 'gmail',
          messageId: '',
          sender: 'test@vit.ac.in',
          subject: 'Test',
        },
      }),
    ).toThrow(NoticeValidationError);
  });

  it('filters out invalid and non-http(s) URLs in links and documents', () => {
    const raw = {
      title: 'Workshop on Quantum Computing',
      summary: 'Hands-on session on Qiskit framework.',
      category: 'event',
      priority: 'normal',
      links: [
        { label: 'Valid Link', url: 'https://events.vit.ac.in/qiskit' },
        { label: 'Invalid URL', url: 'not-a-url' },
        { label: 'Javascript scheme', url: 'javascript:alert(1)' },
      ],
      documents: [
        { label: 'Valid Doc', url: 'http://cdn.vit.ac.in/brochure.pdf' },
        { label: 'Bad Doc', url: 'ftp://files/doc.pdf' },
      ],
    };

    const validated = validateNoticeCandidate(raw, defaultSource);
    expect(validated.links).toEqual([
      { label: 'Valid Link', url: 'https://events.vit.ac.in/qiskit' },
    ]);
    expect(validated.documents).toEqual([
      { label: 'Valid Doc', url: 'http://cdn.vit.ac.in/brochure.pdf' },
    ]);
  });

  it('correctly checks URL validity with isValidUrl helper', () => {
    expect(isValidUrl('https://vit.ac.in')).toBe(true);
    expect(isValidUrl('http://vtop.vit.ac.in/subpath?query=1')).toBe(true);
    expect(isValidUrl('ftp://ftp.vit.ac.in')).toBe(false);
    expect(isValidUrl('mailto:dean@vit.ac.in')).toBe(false);
    expect(isValidUrl('javascript:void(0)')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl(null)).toBe(false);
  });
});

describe('Notice Analyzer Pipeline & Multi-Type Extraction', () => {
  beforeEach(() => {
    resetNoticeAnalyzer();
  });

  const baseMessage: StructuredGmailMessage = {
    id: 'msg_999',
    threadId: 'thread_999',
    sender: 'dean.academics@vit.ac.in',
    recipient: 'student@vitstudent.ac.in',
    subject: 'Continuous Assessment Test Schedule',
    date: 'Sun, 30 Aug 2026 10:00:00 +0530',
    snippet: 'CAT-1 exam schedule released...',
    bodyText: 'CAT-1 exam schedule for Fall 2026 is released on VTOP portal.',
    sourceMessageId: 'msg_999',
  };

  it('buildNoticePrompt includes subject, sender, date, and content safely without leaking credentials', () => {
    const prompt = buildNoticePrompt(baseMessage);
    expect(prompt).toContain('Continuous Assessment Test Schedule');
    expect(prompt).toContain('dean.academics@vit.ac.in');
    expect(prompt).toContain('CAT-1 exam schedule for Fall 2026');
    expect(prompt).not.toContain('access_token');
    expect(prompt).not.toContain('refresh_token');
  });

  it('supports dependency injection of NoticeAnalyzer implementation', async () => {
    const mockAnalyzer: NoticeAnalyzer = {
      analyze: vi.fn().mockResolvedValue({
        title: 'Mock Exam Notice',
        summary: 'Mock exam summary.',
        category: 'exam',
        priority: 'urgent',
        source: {
          provider: 'gmail',
          messageId: 'msg_999',
          sender: 'dean@vit.ac.in',
          subject: 'Exam Notice',
        },
      }),
    };

    setNoticeAnalyzer(mockAnalyzer);

    const result = await noticeAnalyzerService.analyze(baseMessage);
    expect(result.title).toBe('Mock Exam Notice');
    expect(result.category).toBe('exam');
    expect(mockAnalyzer.analyze).toHaveBeenCalledWith(baseMessage);
  });

  it('correctly models Examination notice candidates', async () => {
    const examCandidate: NoticeCandidate = {
      title: 'FAT Winter 2026 Timetable',
      summary: 'Final Assessment Test timetable released for all undergraduate students.',
      category: 'exam',
      priority: 'urgent',
      audience: 'Undergraduate Batches 2023-2027',
      importantDates: [{ label: 'FAT Commencement', date: '2026-12-01' }],
      venue: 'SJT Hall 401',
      actionRequired: 'Verify seating allocation on VTOP.',
      source: {
        provider: 'gmail',
        messageId: 'msg_exam_1',
        sender: 'controller.exams@vit.ac.in',
        subject: 'FAT Schedule',
      },
    };

    setNoticeAnalyzer({
      analyze: vi.fn().mockResolvedValue(examCandidate),
    });

    const result = await noticeAnalyzerService.analyze({
      ...baseMessage,
      id: 'msg_exam_1',
    });

    expect(result.category).toBe('exam');
    expect(result.priority).toBe('urgent');
    expect(result.venue).toBe('SJT Hall 401');
    expect(result.importantDates).toHaveLength(1);
    expect(result.actionRequired).toBe('Verify seating allocation on VTOP.');
  });

  it('correctly models Event notice candidates with registration links', async () => {
    const eventCandidate: NoticeCandidate = {
      title: 'HackVIT 2026: 36-Hour National Hackathon',
      summary: 'Annual flagship hackathon open to all engineering students with 5L in prizes.',
      category: 'event',
      priority: 'normal',
      venue: 'Anna Auditorium',
      importantDates: [
        { label: 'Event Date', date: '2026-10-15' },
        { label: 'Registration Deadline', date: '2026-10-01' },
      ],
      links: [{ label: 'Register on Devfolio', url: 'https://hackvit2026.devfolio.co' }],
      source: {
        provider: 'gmail',
        messageId: 'msg_event_1',
        sender: 'hackvit@vit.ac.in',
        subject: 'HackVIT 2026 Registrations Open',
      },
    };

    setNoticeAnalyzer({
      analyze: vi.fn().mockResolvedValue(eventCandidate),
    });

    const result = await noticeAnalyzerService.analyze({
      ...baseMessage,
      id: 'msg_event_1',
    });

    expect(result.category).toBe('event');
    expect(result.links).toHaveLength(1);
    expect(result.links?.[0].url).toBe('https://hackvit2026.devfolio.co');
  });

  it('correctly models Administrative notice candidates with document circulars', async () => {
    const adminCandidate: NoticeCandidate = {
      title: 'Mandatory Student ID Card Re-validation',
      summary: 'All hostel and day-scholar students must update their RFID ID cards before semester end.',
      category: 'administrative',
      priority: 'important',
      actionRequired: 'Submit old ID card at Admin Block Room 102.',
      importantDates: [{ label: 'Deadline', date: '2026-09-30' }],
      documents: [{ label: 'Administrative Circular', url: 'https://vtop.vit.ac.in/admin/circular_id_2026.pdf' }],
      source: {
        provider: 'gmail',
        messageId: 'msg_admin_1',
        sender: 'registrar@vit.ac.in',
        subject: 'ID Card Revalidation',
      },
    };

    setNoticeAnalyzer({
      analyze: vi.fn().mockResolvedValue(adminCandidate),
    });

    const result = await noticeAnalyzerService.analyze({
      ...baseMessage,
      id: 'msg_admin_1',
    });

    expect(result.category).toBe('administrative');
    expect(result.documents).toHaveLength(1);
    expect(result.documents?.[0].label).toBe('Administrative Circular');
  });

  it('correctly models Placement notice candidates', async () => {
    const placementCandidate: NoticeCandidate = {
      title: 'Google Super Dream Recruitment Drive 2027',
      summary: 'Google Software Engineer recruitment drive registration is now open on the PAT portal.',
      category: 'placement',
      priority: 'urgent',
      audience: 'B.Tech CSE/IT 2027 Passing Out Batch with CGPA >= 8.5',
      importantDates: [{ label: 'Application Deadline', date: '2026-09-10 23:59 IST' }],
      links: [{ label: 'PAT Portal Application', url: 'https://pat.vit.ac.in/drives/google2027' }],
      source: {
        provider: 'gmail',
        messageId: 'msg_place_1',
        sender: 'pat.office@vit.ac.in',
        subject: 'Google Recruitment Drive',
      },
    };

    setNoticeAnalyzer({
      analyze: vi.fn().mockResolvedValue(placementCandidate),
    });

    const result = await noticeAnalyzerService.analyze({
      ...baseMessage,
      id: 'msg_place_1',
    });

    expect(result.category).toBe('placement');
    expect(result.audience).toContain('CGPA >= 8.5');
    expect(result.links?.[0].url).toBe('https://pat.vit.ac.in/drives/google2027');
  });

  it('AINoticeAnalyzer handles fallback and throws when both AI providers fail', async () => {
    const realAnalyzer = new AINoticeAnalyzer();
    // Simulate failure by withholding keys
    const originalGemini = process.env.GEMINI_API_KEY;
    const originalGroq = process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      await expect(realAnalyzer.analyze(baseMessage)).rejects.toThrow(
        'Both AI providers failed to analyze the notice',
      );
    } finally {
      process.env.GEMINI_API_KEY = originalGemini;
      process.env.GROQ_API_KEY = originalGroq;
    }
  });
});
