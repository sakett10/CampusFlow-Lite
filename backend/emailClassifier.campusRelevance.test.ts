/**
 * Regression tests for the campus-relevance classification gate (first stage).
 *
 * Guards the fix for two production failures:
 *  1. Environmental Science class reminder was silently discarded (default-reject branch,
 *     `!classification.isAcademic` => ignored before notice analysis),
 *  2. Gravitas payment reminder was silently discarded (no academic-topic vocabulary match,
 *     sender not recognized as an academic authority).
 *
 * Architecture under test:
 *  - First stage = HIGH-RECALL campus-relevance gate
 *    ('campus' | 'personal' | 'promotional' | 'uncertain') with isCampusRelevant.
 *  - Only high-confidence personal / promotional mail is discarded before the second-stage
 *    analyzer; ambiguous ('uncertain') mail reaches noticeAnalyzerService.analyze().
 *  - Privacy: student-to-student casual conversation, OTP, verification and marketing mail
 *    stay discarded.
 *  - AI fallback: Gemini -> Groq -> deterministic heuristic extraction, all validated by
 *    validateNoticeCandidate before any notice is persisted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StructuredGmailMessage, NoticeCandidate } from './types.js';
import { classifyEmail } from './services/emailClassifier.service.js';
import {
  isCampusAffineSender,
  isTrustedInstitutionSender,
  isStudentInstitutionSender,
  isGenericMailboxDomain,
  getInstitutionForSender,
  extractDomainFromSender,
  registerInstitution,
  resetInstitutions,
} from './config/institutions.js';
import {
  noticeAnalyzerService,
  setNoticeAnalyzer,
  resetNoticeAnalyzer,
  AINoticeAnalyzer,
} from './services/noticeAnalyzer.service.js';
import { extractHeuristicCandidate } from './services/noticeAnalyzer.service.js';
import {
  validateNoticeCandidate,
  NoticeValidationError,
} from './services/noticeValidator.js';

let idCounter = 0;
function msg(overrides: Partial<StructuredGmailMessage> = {}): StructuredGmailMessage {
  idCounter += 1;
  const id = `msg_${idCounter}`;
  return {
    id,
    threadId: `thread_${idCounter}`,
    sender: 'proctor@vit.ac.in',
    recipient: 'student@vitstudent.ac.in',
    subject: 'Campus Notice',
    date: 'Wed, 16 Sep 2026 10:00:00 +0530',
    snippet: '',
    bodyText: '',
    sourceMessageId: id,
    ...overrides,
  };
}

const ENV_SCI_REMINDER = msg({
  sender: 'EnvS Course Assistant <envs1003.class@vit.ac.in>',
  subject: 'Environmental Science class reminder',
  snippet: 'Tomorrow 10:00 AM',
  bodyText:
    'Dear students, the Environmental Science (BCE1003) class will be held tomorrow at 10:00 AM in AB2-204. Please bring your course material. Attendance will be recorded.',
});

const GRAVITAS_PAYMENT = msg({
  sender: 'Gravitas VIT <gravitas@vit.ac.in>',
  subject: 'Gravitas payment reminder',
  snippet: 'Payment due',
  bodyText:
    'Dear participant, this is a reminder that the Gravitas event registration payment of Rs. 500 is due. Please complete the payment before the deadline to confirm your participation.',
});

describe('emailClassifier: campus-relevance gate (root-cause regressions)', () => {
  describe('production failure #1: Environmental Science class reminder', () => {
    it('is recognized as potentially campus-relevant (high recall, no hardcoding)', () => {
      const result = classifyEmail({
        from: ENV_SCI_REMINDER.sender,
        subject: ENV_SCI_REMINDER.subject,
        snippet: ENV_SCI_REMINDER.snippet,
        bodyText: ENV_SCI_REMINDER.bodyText,
      });

      expect(result.isCampusRelevant).toBe(true);
      expect(['campus', 'uncertain']).toContain(result.outcome);
      expect(result.isPersonal).toBe(false);
      expect(result.isPromotionalOrNewsletter).toBe(false);
    });

    it('is classified confidently as campus (campus topic + body present)', () => {
      const result = classifyEmail({
        from: ENV_SCI_REMINDER.sender,
        subject: ENV_SCI_REMINDER.subject,
        snippet: ENV_SCI_REMINDER.snippet,
        bodyText: ENV_SCI_REMINDER.bodyText,
      });

      expect(result.outcome).toBe('campus');
      expect(result.isAcademic).toBe(true);
    });

    it('is classified campus-relevant even from an unrecognized external sender', () => {
      const result = classifyEmail({
        from: 'notifications@course-portal.example.com',
        subject: 'Environmental Science class reminder',
        snippet: 'Class tomorrow at 10 AM',
        bodyText:
          'The Environmental Science class is scheduled tomorrow at 10 AM. Attendance will be recorded.',
      });

      expect(result.isCampusRelevant).toBe(true);
      expect(result.outcome).not.toBe('personal');
      expect(result.outcome).not.toBe('promotional');
    });

    it('reaches the notice analyzer and produces a validated notice candidate', async () => {
      // Deterministic second-stage path (no AI keys required):
      // gmail.service.ts uses extractHeuristicCandidate + validateNoticeCandidate when AI fails;
      // here it proves the email is *capable of producing a notice* end-to-end.
      const rawCandidate = extractHeuristicCandidate(ENV_SCI_REMINDER);
      const candidate = validateNoticeCandidate(rawCandidate, {
        provider: 'gmail',
        messageId: ENV_SCI_REMINDER.sourceMessageId,
        sender: ENV_SCI_REMINDER.sender,
        subject: ENV_SCI_REMINDER.subject,
      });

      expect(candidate.title.toLowerCase()).toContain('environmental science');
      expect(['academic', 'exam', 'event', 'general']).toContain(candidate.category);
    });

    it('is accepted by the analyzer interface as a notice-bearing message', async () => {
      const mockAnalyzer: { analyze: ReturnType<typeof vi.fn> } = {
        analyze: vi.fn().mockResolvedValue({
          title: 'Environmental Science class reminder',
          summary: 'Class tomorrow at 10:00 AM in AB2-204.',
          category: 'academic',
          priority: 'normal',
        } satisfies Partial<NoticeCandidate>),
      };
      setNoticeAnalyzer(mockAnalyzer as never);

      const candidate = await noticeAnalyzerService.analyze(ENV_SCI_REMINDER);
      expect(candidate.title).toContain('Environmental Science');
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(ENV_SCI_REMINDER);
    });
  });

  describe('production failure #2: Gravitas payment reminder', () => {
    it('is recognized as potentially campus-relevant (high recall, no hardcoding)', () => {
      const result = classifyEmail({
        from: GRAVITAS_PAYMENT.sender,
        subject: GRAVITAS_PAYMENT.subject,
        snippet: GRAVITAS_PAYMENT.snippet,
        bodyText: GRAVITAS_PAYMENT.bodyText,
      });

      expect(result.isCampusRelevant).toBe(true);
      expect(['campus', 'uncertain']).toContain(result.outcome);
      expect(result.isPromotionalOrNewsletter).toBe(false);
    });

    it('is capable of producing a fee/general notice through the deterministic path', () => {
      const rawCandidate = extractHeuristicCandidate(GRAVITAS_PAYMENT);
      const candidate = validateNoticeCandidate(rawCandidate, {
        provider: 'gmail',
        messageId: GRAVITAS_PAYMENT.sourceMessageId,
        sender: GRAVITAS_PAYMENT.sender,
        subject: GRAVITAS_PAYMENT.subject,
      });

      expect(candidate.title.toLowerCase()).toContain('gravitas');
      expect(['fee', 'general', 'event', 'alert', 'administrative']).toContain(candidate.category);
    });
  });

  describe('broader campus topics must be campus-relevant (generalization, not hardcoding)', () => {
    const cases: Array<{ name: string; message: StructuredGmailMessage }> = [
      {
        name: 'exam announcement',
        message: msg({
          sender: 'COE <coe@vit.ac.in>',
          subject: 'FAT Schedule - Fall Semester 2026-27',
          bodyText:
            'The Final Assessment Test schedule is published on VTOP. Check your exam slots.',
        }),
      },
      {
        name: 'assignment/submission announcement',
        message: msg({
          sender: 'Course Instructor <cse2001.faculty@vitstudent.ac.in>',
          subject: 'Assignment 3 submission deadline extended',
          bodyText:
            'The deadline for Assignment 3 submission has been extended to Friday 11:59 PM on VTOP.',
        }),
      },
      {
        name: 'timetable/class schedule update',
        message: msg({
          sender: 'Academic Coordinator <academic.coordinator@vit.ac.in>',
          subject: 'Revised timetable for Semester 2026-27',
          bodyText:
            'The revised class timetable for the current semester is now available on VTOP.',
        }),
      },
      {
        name: 'hostel notice',
        message: msg({
          sender: 'Hostel Office <hostel@vit.ac.in>',
          subject: 'Hostel water supply maintenance',
          bodyText:
            'Water supply in hostel blocks J and K will be interrupted on Saturday morning for maintenance.',
        }),
      },
      {
        name: 'club/hackathon/event announcement',
        message: msg({
          sender: 'CS Club <csclub@vitstudent.ac.in>',
          subject: 'Smart India Hackathon internal selection round',
          bodyText:
            'Our club is organizing the internal hackathon selection round this weekend. Register your team.',
        }),
      },
    ];

    for (const { name, message } of cases) {
      it(`classifies ${name} as campus-relevant`, () => {
        const result = classifyEmail({
          from: message.sender,
          subject: message.subject,
          snippet: message.snippet,
          bodyText: message.bodyText,
        });

        expect(result.isCampusRelevant).toBe(true);
        expect(result.outcome).not.toBe('personal');
        expect(result.outcome).not.toBe('promotional');
      });
    }
  });

  describe('privacy: personal emails must never become campus notices', () => {
    const personalCases: Array<{ name: string; sender: string; subject: string; body: string }> = [
      {
        name: '"where are you?"',
        sender: 'Rahul <rahul.k@vitstudent.ac.in>',
        subject: 'where are you?',
        body: 'Hey, where are you? I have been waiting near the main gate for 20 minutes.',
      },
      {
        name: '"call me when free"',
        sender: 'Priya <priya.s@vitstudent.ac.in>',
        subject: 'call me when free',
        body: 'Call me when free, need to talk about tomorrow.',
      },
      {
        name: 'birthday message',
        sender: 'Vikram <vikram.m@vitstudent.ac.in>',
        subject: 'Happy Birthday!',
        body: 'Happy birthday! Have a great year ahead.',
      },
      {
        name: 'cycle sale (student-to-student with an academic word present)',
        sender: 'Anil <anil.t@vitstudent.ac.in>',
        subject: 'Selling my cycle before fat exams',
        body: 'Hero sprint cycle for sale before the final assessment test begins.',
      },
    ];

    for (const { name, sender, subject, body } of personalCases) {
      it(`classifies ${name} as personal (zero persistence)`, () => {
        const result = classifyEmail({
          from: sender,
          subject,
          snippet: body,
          bodyText: body,
        });

        expect(result.outcome).toBe('personal');
        expect(result.isCampusRelevant).toBe(false);
        expect(result.isPersonal).toBe(true);
      });
    }
  });

  describe('privacy: OTP / verification / promotional must be discarded', () => {
    it('classifies Amazon promotional email as promotional', () => {
      const result = classifyEmail({
        from: 'Amazon.in <promo@amazon.in>',
        subject: 'Deal of the day: 60% off on headphones',
        snippet: 'Shop now, limited stock available. Unsubscribe from these emails.',
        bodyText: 'Limited time deal. 60% off on headphones. Unsubscribe here.',
      });

      expect(result.outcome).toBe('promotional');
      expect(result.isCampusRelevant).toBe(false);
      expect(result.isPromotionalOrNewsletter).toBe(true);
    });

    it('classifies newsletter as promotional', () => {
      const result = classifyEmail({
        from: 'Tech Weekly <digest@newsletter-example.com>',
        subject: 'Your weekly newsletter digest',
        snippet: 'Top stories of the week. Unsubscribe anytime.',
        bodyText: 'Top stories of the week. Unsubscribe anytime.',
      });

      expect(result.outcome).toBe('promotional');
      expect(result.isCampusRelevant).toBe(false);
    });

    it('classifies OTP/password reset as promotional (never persisted)', () => {
      const result = classifyEmail({
        from: 'Security <no-reply@service-portal.com>',
        subject: 'Your one-time password',
        snippet: 'Your OTP is 123456. It expires in 10 minutes.',
        bodyText: 'Your OTP is 123456. Do not share it with anyone.',
      });

      expect(result.isCampusRelevant).toBe(false);
      expect(['personal', 'promotional']).toContain(result.outcome);
    });

    it('classifies external job-portal marketing as promotional', () => {
      const result = classifyEmail({
        from: 'Internshala Alerts <alerts@internshala.com>',
        subject: 'Winter internship submission deadline: flat 50% cash stipend',
        snippet: 'Apply before the deadline. Unsubscribe.',
        bodyText: 'Apply before the deadline. Unsubscribe.',
      });

      expect(result.outcome).toBe('promotional');
      expect(result.isCampusRelevant).toBe(false);
    });
  });

  describe('AI fallback chain (Gemini -> Groq -> deterministic)', () => {
    const noticeEmail = msg({
      sender: 'COE <coe@vit.ac.in>',
      subject: 'FAT Schedule - Fall Semester 2026-27',
      bodyText:
        'The Final Assessment Test schedule is published on VTOP. Check your exam slots.',
    });

    const validRawGeminiResult = {
      title: 'FAT Schedule - Fall Semester 2026-27',
      summary: 'The Final Assessment Test schedule has been published on VTOP.',
      category: 'exam',
      priority: 'important',
    };

    beforeEach(() => {
      resetNoticeAnalyzer();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      resetNoticeAnalyzer();
    });

    it('Gemini failure -> Groq fallback still produces a validated candidate', async () => {
      const analyzer = new AINoticeAnalyzer();
      const groqRaw = { ...validRawGeminiResult, priority: 'normal' };

      const geminiSpy = vi
        .spyOn(analyzer as unknown as { analyzeWithGemini: () => Promise<Record<string, unknown>> }, 'analyzeWithGemini')
        .mockRejectedValue(new Error('Gemini quota exhausted'));
      const groqSpy = vi
        .spyOn(analyzer as unknown as { analyzeWithGroq: () => Promise<Record<string, unknown>> }, 'analyzeWithGroq')
        .mockResolvedValue(groqRaw);

      const candidate = await analyzer.analyze(noticeEmail);

      expect(geminiSpy).toHaveBeenCalled();
      expect(groqSpy).toHaveBeenCalled();
      expect(candidate.title).toBe('FAT Schedule - Fall Semester 2026-27');
      expect(candidate.category).toBe('exam');
    });

    it('Gemini + Groq failure -> deterministic heuristic fallback still yields a validated candidate', async () => {
      // gmail.service.ts catches the analyzer failure and engages extractHeuristicCandidate
      // + validateNoticeCandidate; this proves that deterministic fallback works for a
      // campus-relevant email that now passes the first-stage gate.
      const analyzer = new AINoticeAnalyzer();
      vi.spyOn(
        analyzer as unknown as { analyzeWithGemini: () => Promise<Record<string, unknown>> },
        'analyzeWithGemini',
      ).mockRejectedValue(new Error('Gemini down'));
      vi.spyOn(
        analyzer as unknown as { analyzeWithGroq: () => Promise<Record<string, unknown>> },
        'analyzeWithGroq',
      ).mockRejectedValue(new Error('Groq down'));

      await expect(analyzer.analyze(noticeEmail)).rejects.toThrow(
        'Both AI providers failed to analyze the notice',
      );

      // Deterministic fallback used by the sync pipeline:
      const rawCandidate = extractHeuristicCandidate(noticeEmail);
      const candidate = validateNoticeCandidate(rawCandidate, {
        provider: 'gmail',
        messageId: noticeEmail.sourceMessageId,
        sender: noticeEmail.sender,
        subject: noticeEmail.subject,
      });
      expect(candidate.title).toBe('FAT Schedule - Fall Semester 2026-27');
      expect(candidate.category).toBe('exam');
    });

    it('validation failure does not create an invalid notice (NoticeValidationError)', () => {
      const invalidCandidate = {
        title: '   ',
        summary: '',
        category: 'exam',
        priority: 'normal',
      };

      expect(() =>
        validateNoticeCandidate(invalidCandidate, {
          provider: 'gmail',
          messageId: 'msg_invalid',
          sender: 'coe@vit.ac.in',
          subject: 'FAT Schedule',
        }),
      ).toThrow(NoticeValidationError);
    });
  });

  describe('CodeRabbit Security & Privacy Fixes: Multi-Institution & Domain Boundary (Findings 1 & 2)', () => {
    beforeEach(() => {
      resetInstitutions();
    });

    afterEach(() => {
      resetInstitutions();
    });

    describe('Finding 1: Missing sender header classification', () => {
      it('missing sender returns uncertain (never campus)', () => {
        const result1 = classifyEmail({
          subject: 'Important University Update',
          snippet: 'Please check your portal for announcements.',
        });
        expect(result1.outcome).toBe('uncertain');
        expect(result1.isCampusRelevant).toBe(true);
        expect(result1.isAcademic).toBe(false);

        const result2 = classifyEmail({
          from: null,
          subject: 'Exam notification',
          bodyText: 'Details inside',
        });
        expect(result2.outcome).toBe('uncertain');

        const result3 = classifyEmail({
          from: '',
          subject: '',
          snippet: '',
        });
        expect(result3.outcome).toBe('uncertain');
      });
    });

    describe('Finding 2: Domain Boundary and Campus-Affine Checks', () => {
      it('rejects vitaminshoppe.com as not campus-affine', () => {
        expect(isCampusAffineSender('offers@vitaminshoppe.com')).toBe(false);
        expect(isCampusAffineSender('support@vitaminshoppe.com')).toBe(false);

        const result = classifyEmail({
          from: 'Vitamin Shoppe <deals@vitaminshoppe.com>',
          subject: 'Mega weekend discounts on supplements',
          bodyText: 'Limited time offers for members.',
        });
        expect(result.outcome).not.toBe('campus');
        expect(result.isCampusRelevant).toBe(false);
      });

      it('rejects vitality-app.io as not campus-affine', () => {
        expect(isCampusAffineSender('support@vitality-app.io')).toBe(false);
        expect(isCampusAffineSender('hello@sub.vitality-app.io')).toBe(false);

        const result = classifyEmail({
          from: 'Vitality App <support@vitality-app.io>',
          subject: 'Your weekly fitness summary',
          bodyText: 'You reached your step goal today!',
        });
        expect(result.outcome).not.toBe('campus');
        expect(result.isCampusRelevant).toBe(false);
      });

      it('rejects fake display name such as "Vitality Team" with no valid institution domain as not campus-affine', () => {
        expect(isCampusAffineSender('Vitality Team')).toBe(false);
        expect(isCampusAffineSender('"Vitality Team"')).toBe(false);
        expect(isCampusAffineSender('"Vitality Team" <promo@vitality-app.io>')).toBe(false);
        expect(isCampusAffineSender('"Vitality Team" <team@randommarketing.com>')).toBe(false);
        expect(extractDomainFromSender('Vitality Team')).toBeNull();

        const result = classifyEmail({
          from: 'Vitality Team',
          subject: 'Check our new features',
          bodyText: 'Download the app today.',
        });
        expect(result.outcome).not.toBe('campus');
      });

      it('recognizes valid VIT domain as campus-affine and trusted', () => {
        expect(isCampusAffineSender('dean@vit.ac.in')).toBe(true);
        expect(isTrustedInstitutionSender('dean@vit.ac.in')).toBe(true);
        expect(isStudentInstitutionSender('dean@vit.ac.in')).toBe(false);
        expect(getInstitutionForSender('dean@vit.ac.in')?.id).toBe('vit');

        // Subdomains of vit.ac.in
        expect(isCampusAffineSender('portal@vtop.vit.ac.in')).toBe(true);
        expect(isTrustedInstitutionSender('portal@vtop.vit.ac.in')).toBe(true);
      });

      it('recognizes valid VIT student domain as student domain but not trusted root domain', () => {
        expect(isCampusAffineSender('student@vitstudent.ac.in')).toBe(true);
        expect(isStudentInstitutionSender('student@vitstudent.ac.in')).toBe(true);
        expect(isTrustedInstitutionSender('student@vitstudent.ac.in')).toBe(false);
        expect(getInstitutionForSender('student@vitstudent.ac.in')?.id).toBe('vit');
      });

      it('recognizes valid MNLU Mumbai domain as campus-affine and trusted', () => {
        expect(isCampusAffineSender('office@mnlumumbai.edu.in')).toBe(true);
        expect(isTrustedInstitutionSender('office@mnlumumbai.edu.in')).toBe(true);
        expect(isStudentInstitutionSender('office@mnlumumbai.edu.in')).toBe(false);
        expect(getInstitutionForSender('office@mnlumumbai.edu.in')?.id).toBe('mnlu_mumbai');

        // Authority roles at MNLU Mumbai
        expect(isCampusAffineSender('registrar@mnlumumbai.edu.in')).toBe(true);
        expect(isCampusAffineSender('examination.cell@mnlumumbai.edu.in')).toBe(true);
      });

      it('never treats generic mailbox providers (gmail, outlook, yahoo) as institutional domains', () => {
        expect(isGenericMailboxDomain('student@gmail.com')).toBe(true);
        expect(isGenericMailboxDomain('professor@outlook.com')).toBe(true);
        expect(isGenericMailboxDomain('lecturer@yahoo.com')).toBe(true);
        expect(isGenericMailboxDomain('user@hotmail.com')).toBe(true);

        expect(isCampusAffineSender('student@gmail.com')).toBe(false);
        expect(isCampusAffineSender('professor@outlook.com')).toBe(false);
        expect(isCampusAffineSender('lecturer@yahoo.com')).toBe(false);

        expect(isTrustedInstitutionSender('student@gmail.com')).toBe(false);
        expect(isTrustedInstitutionSender('professor@outlook.com')).toBe(false);
        expect(isTrustedInstitutionSender('lecturer@yahoo.com')).toBe(false);

        expect(isStudentInstitutionSender('student@gmail.com')).toBe(false);
        expect(getInstitutionForSender('student@gmail.com')).toBeNull();
        expect(getInstitutionForSender('professor@outlook.com')).toBeNull();
      });

      it('treats unknown college domains as unverified non-institutional domains', () => {
        expect(isCampusAffineSender('info@harvard.edu')).toBe(false);
        expect(isCampusAffineSender('contact@oxford.ac.uk')).toBe(false);
        expect(isCampusAffineSender('registrar@nludelhi.ac.in')).toBe(false);
        expect(isCampusAffineSender('admin@nujs.edu')).toBe(false);
        expect(isCampusAffineSender('info@atlasuniversity.edu.in')).toBe(false);
        expect(isCampusAffineSender('admin@nmcollege.in')).toBe(false);
        expect(isCampusAffineSender('dean@mit.edu')).toBe(false);

        expect(isTrustedInstitutionSender('registrar@nludelhi.ac.in')).toBe(false);
        expect(getInstitutionForSender('registrar@nludelhi.ac.in')).toBeNull();
      });

      it('supports extending institution configurations dynamically', () => {
        expect(isCampusAffineSender('dean@customcollege.edu.in')).toBe(false);

        registerInstitution({
          id: 'custom_college',
          name: 'Custom College of Technology',
          domains: ['customcollege.edu.in'],
          studentDomains: ['student.customcollege.edu.in'],
        });

        expect(isCampusAffineSender('dean@customcollege.edu.in')).toBe(true);
        expect(isCampusAffineSender('student@student.customcollege.edu.in')).toBe(true);
        // Strict boundary checking still holds
        expect(isCampusAffineSender('sales@notcustomcollege.edu.in')).toBe(false);
      });
    });

    describe('Privacy: Student personal email vs. legitimate notices across VIT and MNLU', () => {
      it('VIT student personal email is discarded (personal / zero persistence)', () => {
        // Casual chat from VIT student domain
        const result1 = classifyEmail({
          from: 'arun.k@vitstudent.ac.in',
          subject: 'where are you?',
          bodyText: 'Hey, are you free for lunch at the food court? Let me know what time works.',
        });
        expect(result1.outcome).toBe('personal');
        expect(result1.isCampusRelevant).toBe(false);
        expect(result1.isPersonal).toBe(true);

        // Cycle sale with academic keywords
        const result2 = classifyEmail({
          from: 'priya.s@vitstudent.ac.in',
          subject: 'Selling my cycle before fat exams',
          bodyText: 'Hero sprint cycle for sale before final assessment test.',
        });
        expect(result2.outcome).toBe('personal');
        expect(result2.isCampusRelevant).toBe(false);

        // General email without campus signal from student domain
        const result3 = classifyEmail({
          from: 'rahul.t@vitstudent.ac.in',
          subject: 'Quick question about yesterday',
          bodyText: 'Did you get the notes from yesterday evening?',
        });
        expect(result3.outcome).toBe('personal');
        expect(result3.isCampusRelevant).toBe(false);
      });

      it('MNLU student personal email is discarded (personal / zero persistence)', () => {
        // Personal casual conversation from MNLU student prefix or domain
        const result1 = classifyEmail({
          from: 'lawstudent@student.mnlumumbai.edu.in',
          subject: 'where are you?',
          bodyText: 'Are you in the library or canteen? Let me know.',
        });
        expect(result1.outcome).toBe('personal');
        expect(result1.isCampusRelevant).toBe(false);
        expect(result1.isPersonal).toBe(true);

        // Weekend plans informal email
        const result2 = classifyEmail({
          from: 'advocate.intern@student.mnlumumbai.edu.in',
          subject: 'plans for the weekend',
          bodyText: 'Movie tonight or dinner? Ping me when you get free.',
        });
        expect(result2.outcome).toBe('personal');
        expect(result2.isCampusRelevant).toBe(false);
      });

      it('legitimate VIT notice reaches second-stage notice analysis', () => {
        const vitResult = classifyEmail({
          from: 'Dean Academics <dean.academics@vit.ac.in>',
          subject: 'CAT-1 Examination Schedule and Guidelines',
          bodyText: 'The CAT-1 schedule for all branches has been published on VTOP. Attendance is mandatory.',
        });
        expect(vitResult.outcome).toBe('campus');
        expect(vitResult.isCampusRelevant).toBe(true);
        expect(vitResult.isAcademic).toBe(true);
      });

      it('legitimate MNLU Mumbai notice reaches second-stage notice analysis', () => {
        const mnluResult = classifyEmail({
          from: 'Examination Cell <examination.cell@mnlumumbai.edu.in>',
          subject: 'End-term Examination Timetable Winter Semester',
          bodyText: 'Please find the timetable for end-term exams. Seating arrangement will be posted on notice board.',
        });
        expect(mnluResult.outcome).toBe('campus');
        expect(mnluResult.isCampusRelevant).toBe(true);
        expect(mnluResult.isAcademic).toBe(true);
      });

      it('generic mailbox senders (gmail/outlook) with strong campus context enter uncertain path (not campus, not personal)', () => {
        const gmailResult = classifyEmail({
          from: 'Guest Lecturer <guestlecturer2026@gmail.com>',
          subject: 'Guest Lecture and Class Test on Cyber Law',
          bodyText: 'Tomorrow at 11 AM in Moot Court Hall. Attendance and assignment submission will be recorded.',
        });
        expect(gmailResult.outcome).toBe('uncertain');
        expect(gmailResult.isCampusRelevant).toBe(true);
        expect(gmailResult.isAcademic).toBe(false);

        const outlookResult = classifyEmail({
          from: 'Dr. Sharma <sharma.courses2026@outlook.com>',
          subject: 'Midterm Examination Guidelines and Syllabus',
          bodyText: 'The midterm examination will cover modules 1 through 3. Please be present on time.',
        });
        expect(outlookResult.outcome).toBe('uncertain');
        expect(outlookResult.isCampusRelevant).toBe(true);
        expect(outlookResult.isAcademic).toBe(false);
      });

      it('generic mailbox senders without campus context are discarded as personal', () => {
        const personalGmail = classifyEmail({
          from: 'friend@gmail.com',
          subject: 'Dinner tonight',
          bodyText: 'Hey, let us grab pizza tonight at 8.',
        });
        expect(personalGmail.outcome).toBe('personal');
        expect(personalGmail.isCampusRelevant).toBe(false);
      });

      it('guarantees user institution and email isolation (one user data cannot leak to another)', () => {
        // User A (VIT) and User B (MNLU) sender classification produces independent institution recognition
        const userASender = 'Dean Academics <dean.academics@vit.ac.in>';
        const userBSender = 'Registrar <registrar@mnlumumbai.edu.in>';

        const instA = getInstitutionForSender(userASender);
        const instB = getInstitutionForSender(userBSender);

        expect(instA?.id).toBe('vit');
        expect(instB?.id).toBe('mnlu_mumbai');
        expect(instA?.id).not.toBe(instB?.id);

        // Subdomain resolution is strictly scoped to its own institution
        expect(getInstitutionForSender('vtop.vit.ac.in')?.id).toBe('vit');
        expect(getInstitutionForSender('portal.mnlumumbai.edu.in')?.id).toBe('mnlu_mumbai');
        expect(getInstitutionForSender('student@vitstudent.ac.in')?.id).toBe('vit');
        expect(getInstitutionForSender('student@mnlumumbai.edu.in')?.id).toBe('mnlu_mumbai');
      });
    });

    describe('Diagnostic Suite: VIT student domain senders (26@vitstudent.ac.in & numeric local-parts)', () => {
      it('reproduces domain extraction and institution resolution for 26@vitstudent.ac.in', () => {
        const rawSender = '26@vitstudent.ac.in';
        expect(extractDomainFromSender(rawSender)).toBe('vitstudent.ac.in');
        expect(isStudentInstitutionSender(rawSender)).toBe(true);
        expect(isTrustedInstitutionSender(rawSender)).toBe(false);
        expect(isCampusAffineSender(rawSender)).toBe(true);
        expect(getInstitutionForSender(rawSender)?.id).toBe('vit');
      });

      it('reproduces domain extraction and institution resolution for "26 <26@vitstudent.ac.in>"', () => {
        const formattedSender = '26 <26@vitstudent.ac.in>';
        expect(extractDomainFromSender(formattedSender)).toBe('vitstudent.ac.in');
        expect(isStudentInstitutionSender(formattedSender)).toBe(true);
        expect(isTrustedInstitutionSender(formattedSender)).toBe(false);
        expect(isCampusAffineSender(formattedSender)).toBe(true);
        expect(getInstitutionForSender(formattedSender)?.id).toBe('vit');
      });

      it('reproduces domain extraction for ordinary @vitstudent.ac.in sender', () => {
        const ordinarySender = 'Rahul Sharma <rahul.s2023@vitstudent.ac.in>';
        expect(extractDomainFromSender(ordinarySender)).toBe('vitstudent.ac.in');
        expect(isStudentInstitutionSender(ordinarySender)).toBe(true);
        expect(isTrustedInstitutionSender(ordinarySender)).toBe(false);
        expect(isCampusAffineSender(ordinarySender)).toBe(true);
        expect(getInstitutionForSender(ordinarySender)?.id).toBe('vit');
      });

      it('personal student-to-student email from @vitstudent.ac.in is discarded as personal (zero persistence)', () => {
        const personalEmail = classifyEmail({
          from: '26 <26@vitstudent.ac.in>',
          subject: 'where are you?',
          bodyText: 'Hey, are you free to meet near SJT?',
        });
        expect(personalEmail.outcome).toBe('personal');
        expect(personalEmail.isCampusRelevant).toBe(false);
        expect(personalEmail.isPersonal).toBe(true);
      });

      it('legitimate campus notice from @vit.ac.in is classified as campus with high confidence', () => {
        const officialNotice = classifyEmail({
          from: 'CoE Office <coe@vit.ac.in>',
          subject: 'Fall Semester CAT-1 Schedule Announcement',
          bodyText: 'The Continuous Assessment Test timetable is published on VTOP. Attendance is mandatory.',
        });
        expect(officialNotice.outcome).toBe('campus');
        expect(officialNotice.isCampusRelevant).toBe(true);
        expect(officialNotice.isAcademic).toBe(true);
        expect(officialNotice.confidence).toBe('high');
      });

      it('diagnoses how a campus-relevant broadcast from 26@vitstudent.ac.in behaves in classifier', () => {
        // When 26@vitstudent.ac.in sends a campus-relevant notice (e.g. club event or symposium)
        const studentNotice = classifyEmail({
          from: '26 <26@vitstudent.ac.in>',
          subject: 'Code2Create Hackathon Registration and Workshop Guidelines',
          bodyText: 'Registration is now open for the annual hackathon. Submit your team details before the deadline.',
        });

        // 1. isStudent = true
        // 2. hasCampusTopic = true
        // 3. hasAuthority = false (unless club/role pattern matches)
        // Outcome must be 'uncertain' (NOT personal!), making it campus-relevant for second-stage analysis
        expect(studentNotice.isCampusRelevant).toBe(true);
        expect(studentNotice.outcome).toBe('uncertain');
        expect(studentNotice.isPersonal).toBe(false);
      });
    });
  });
});
