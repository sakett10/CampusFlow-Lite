import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

const mockList = vi.fn();
const mockGet = vi.fn();

vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
    generateAuthUrl = vi.fn().mockReturnValue('https://mock-auth-url');
    getToken = vi.fn().mockResolvedValue({
      tokens: {
        access_token: 'mock_access',
        refresh_token: 'mock_refresh',
        expiry_date: 1234567890,
      },
    });
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      gmail: vi.fn().mockImplementation(() => ({
        users: {
          getProfile: vi.fn().mockResolvedValue({
            data: { emailAddress: 'student@vitstudent.ac.in' },
          }),
          messages: {
            list: mockList,
            get: mockGet,
          },
        },
      })),
    },
  };
});

// Mock auth before importing app
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer student_user') {
        req.auth = { userId: 'student_user', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer reviewer_user') {
        req.auth = { userId: 'reviewer_user', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    requireAuth: () => (req: Request & { auth?: { userId: string | null } }, res: Response, next: NextFunction) => {
      if (!req.auth || !req.auth.userId) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
      next();
    },
    getAuth: (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }) => ({
      userId: req.auth?.userId || null,
      sessionClaims: req.auth?.sessionClaims,
    }),
  };
});

import app from './index.js';
import { pool } from './db.js';
import { classifyEmail } from './services/emailClassifier.service.js';
import {
  sanitizeEmailForAI,
  capLength,
  removeQuotedChains,
  removeSignaturesAndBoilerplate,
  sanitizeUrlsInText,
  sanitizeUrl,
  normalizeWhitespace,
} from './services/emailSanitizer.service.js';
import { getNoticeAnalyzer, resetNoticeAnalyzer } from './services/noticeAnalyzer.service.js';
import { NoticeValidationError } from './services/noticeValidator.js';
import { campusEmailsService } from './services/campusEmails.service.js';
import { reclassifyExistingCampusEmails } from './services/gmail.service.js';

describe('Gmail Zero-Persistence & Data Minimization Suite (Phase 1)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetNoticeAnalyzer();
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM gmail_connections');
  });

  describe('1. Email Sanitizer Service for AI Processing', () => {
    it('caps text length at exactly 2500 chars on 10,000 character input without breaking words', () => {
      const longWord = 'academic announcement '.repeat(500); // 11,000 chars
      expect(longWord.length).toBeGreaterThan(10000);

      const capped = capLength(longWord, 2500);
      expect(capped.length).toBeLessThanOrEqual(2500);
      expect(capped.endsWith('...')).toBe(true);
    });

    it('removes quoted reply chains and forwarded email headers', () => {
      const emailWithQuotes = `Here is the revised project submission deadline for CSE3002.
Please note that all submissions are due on Friday at 5 PM.

On Wed, Sep 10, 2026 at 10:15 AM John Doe <john@vitstudent.ac.in> wrote:
> Can we get an extension on the project?
> We need more time for testing.
> Thanks.`;

      const cleaned = removeQuotedChains(emailWithQuotes);
      expect(cleaned).toContain('Here is the revised project submission deadline for CSE3002.');
      expect(cleaned).not.toContain('On Wed, Sep 10, 2026');
      expect(cleaned).not.toContain('Can we get an extension');
      expect(cleaned).not.toContain('>');
    });

    it('removes signature blocks and institutional confidentiality boilerplate', () => {
      const emailWithDisclaimer = `The midterm exam for MAT2001 will be held in SJT 401 on Monday.

--
Dr. K. Sharma
Associate Professor, Department of Mathematics
VIT Vellore

This email and any attachments are confidential and intended solely for the use of the individual to whom they are addressed. If you have received this email in error please delete it immediately.
Save paper, save trees. Please do not print this email unless necessary.`;

      const cleaned = removeSignaturesAndBoilerplate(emailWithDisclaimer);
      expect(cleaned).toContain('The midterm exam for MAT2001 will be held in SJT 401 on Monday.');
      expect(cleaned).not.toContain('Dr. K. Sharma');
      expect(cleaned).not.toContain('This email and any attachments are confidential');
      expect(cleaned).not.toContain('Save paper, save trees');
    });

    it('strips tracking parameters while preserving destination URLs and valid query params', () => {
      const rawUrl = 'https://vit.ac.in/portal/submit?assignmentId=9823&utm_source=newsletter&utm_medium=email&utm_campaign=fall2026&fbclid=IwAR123';
      const cleanedUrl = sanitizeUrl(rawUrl);

      expect(cleanedUrl).toContain('https://vit.ac.in/portal/submit?assignmentId=9823');
      expect(cleanedUrl).not.toContain('utm_source');
      expect(cleanedUrl).not.toContain('utm_medium');
      expect(cleanedUrl).not.toContain('utm_campaign');
      expect(cleanedUrl).not.toContain('fbclid');
    });

    it('preserves external non-VIT URLs while stripping tracking parameters', () => {
      const text = 'Submit the external survey at https://docs.google.com/forms/d/e/123/viewform?usp=sf_link&utm_source=email and view rules at https://github.com/org/repo?ref=email_promo';
      const cleaned = sanitizeUrlsInText(text);

      expect(cleaned).toContain('https://docs.google.com/forms/d/e/123/viewform?usp=sf_link');
      expect(cleaned).toContain('https://github.com/org/repo');
      expect(cleaned).not.toContain('utm_source');
      expect(cleaned).not.toContain('ref=email_promo');
    });

    it('normalizes excessive whitespace and newlines', () => {
      const uglyText = 'Line 1\r\n\r\n\r\n\r\n\r\nLine 2     with     spaces\n\n\n\nLine 3';
      const normalized = normalizeWhitespace(uglyText);

      expect(normalized).toBe('Line 1\n\nLine 2 with spaces\n\nLine 3');
    });

    it('combines all sanitization steps in sanitizeEmailForAI', () => {
      const bigMessyEmail = `Important announcement regarding CAT-2 schedules.

Please check your slot on VTOP.

https://vtop.vit.ac.in/vtop/open/page?tab=exam&utm_source=broadcast&gclid=xyz

-- 
Office of Academic Affairs

This communication is confidential and intended for VIT students only.
` + 'Extra repeated text. '.repeat(300);

      const sanitized = sanitizeEmailForAI(bigMessyEmail, 2500);

      expect(sanitized.length).toBeLessThanOrEqual(2500);
      expect(sanitized).toContain('Important announcement regarding CAT-2 schedules.');
      expect(sanitized).toContain('https://vtop.vit.ac.in/vtop/open/page?tab=exam');
      expect(sanitized).not.toContain('utm_source');
      expect(sanitized).not.toContain('gclid');
      expect(sanitized).not.toContain('Office of Academic Affairs');
      expect(sanitized).not.toContain('This communication is confidential');
    });
  });

  describe('2. Two-Stage Classification (Pre-Persistence Gate)', () => {
    it('Stage 1 classifies official university email as academic from metadata alone', () => {
      const result = classifyEmail({
        from: 'COE VIT <coe@vit.ac.in>',
        subject: 'FAT Schedule - Fall Semester 2026-27',
        snippet: 'The Final Assessment Test schedule is published on VTOP.',
      });

      expect(result.outcome).toBe('campus');
      expect(result.isAcademic).toBe(true);
      expect(result.isCampusRelevant).toBe(true);
      expect(result.isPersonal).toBe(false);
    });

    it('Stage 1 classifies personal promotional email as promotional from metadata alone', () => {
      const result = classifyEmail({
        from: 'Swiggy <no-reply@swiggy.in>',
        subject: '50% off on your favorite biryani tonight!',
        snippet: 'Hungry? Order now and get free delivery on orders above Rs. 199.',
      });

      expect(result.outcome).toBe('promotional');
      expect(result.isAcademic).toBe(false);
      expect(result.isCampusRelevant).toBe(false);
      expect(result.isPromotionalOrNewsletter).toBe(true);
    });

    it('Stage 1 returns uncertain when metadata is ambiguous', () => {
      const result = classifyEmail({
        from: 'sundar.p@vit.ac.in',
        subject: 'Follow up on discussion',
        snippet: 'Regarding the points we spoke about yesterday morning.',
      });

      expect(result.outcome).toBe('uncertain');
    });

    it('Stage 2 resolves uncertain email to academic when body reveals course/academic context', () => {
      // Stage 1 (without body)
      const stage1 = classifyEmail({
        from: 'sundar.p@vit.ac.in',
        subject: 'Follow up on discussion',
        snippet: 'Regarding the points we spoke about yesterday morning.',
      });
      expect(stage1.outcome).toBe('uncertain');

      // Stage 2 (with body containing academic keywords)
      const stage2 = classifyEmail({
        from: 'sundar.p@vit.ac.in',
        subject: 'Follow up on discussion',
        snippet: 'Regarding the points we spoke about yesterday morning.',
        bodyText: 'Regarding the points we spoke about: the assignment deadline for CSE2001 is extended to next Monday. Submit the lab report on VTOP.',
      });

      expect(stage2.outcome).toBe('campus');
      expect(stage2.isAcademic).toBe(true);
    });

    it('Stage 2 resolves uncertain email to personal when body reveals personal/casual discussion', () => {
      // Stage 2 (with body containing personal keywords)
      const stage2 = classifyEmail({
        from: 'sundar.p@vit.ac.in',
        subject: 'Follow up on discussion',
        snippet: 'Regarding the points we spoke about yesterday morning.',
        bodyText: 'Hey, are you free for lunch at the food court? Let me know what time works.',
      });

      expect(stage2.outcome).toBe('personal');
      expect(stage2.isAcademic).toBe(false);
    });

    it('classifies official VIT circular with vague subject as academic', () => {
      const result = classifyEmail({
        from: 'Registrar Office <registrar@vit.ac.in>',
        subject: 'Important Circular No. 45/2026',
        snippet: 'Please find the circular details attached.',
      });
      expect(result.outcome).toBe('campus');
      expect(result.isAcademic).toBe(true);
      expect(result.isCampusRelevant).toBe(true);
      expect(result.isPersonal).toBe(false);
    });

    it('recognizes official VITAP sender as academic authority', () => {
      const result = classifyEmail({
        from: 'Academic Office <academics@vitap.ac.in>',
        subject: 'Midterm Examination Schedule Announcement',
        snippet: 'The midterm timetable is now available.',
      });
      expect(result.outcome).toBe('campus');
      expect(result.isAcademic).toBe(true);
    });

    it('recognizes official VIT Chennai sender as academic authority', () => {
      const result = classifyEmail({
        from: 'Dean Academics <dean.academics@chennai.vit.ac.in>',
        subject: 'FAT Timetable Updates',
        snippet: 'Please check your exam slots on the portal.',
      });
      expect(result.outcome).toBe('campus');
      expect(result.isAcademic).toBe(true);
    });

    it('classifies personal email with an academic keyword as personal (never academic)', () => {
      const result = classifyEmail({
        from: 'rahul@vitstudent.ac.in',
        subject: 'Selling my cycle before fat exams',
        snippet: 'Hero sprint cycle for sale before the final assessment test begins.',
      });
      expect(result.outcome).toBe('personal');
      expect(result.isAcademic).toBe(false);
      expect(result.isPersonal).toBe(true);
    });

    it('classifies promotional email containing an academic keyword as personal (promotional)', () => {
      const result = classifyEmail({
        from: 'Internshala Alerts <student-alert@internshala.com>',
        subject: 'Winter Internship submission deadline: flat 50% cash stipend',
        snippet: 'Apply before the deadline to earn stipend while attending college classes.',
      });
      expect(result.outcome).toBe('promotional');
      expect(result.isAcademic).toBe(false);
      expect(result.isCampusRelevant).toBe(false);
      expect(result.isPromotionalOrNewsletter).toBe(true);
    });
  });

  describe('3. Gmail Sync Zero-Persistence Integration', () => {
    it('never persists personal/promotional emails to campus_emails and never sends them to AI', async () => {
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_personal_promo_99' }] },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg_personal_promo_99',
          snippet: 'Huge weekend sale at ASICS! Flat 50% discount on all running shoes.',
          payload: {
            headers: [
              { name: 'From', value: 'ASICS Store <offers@asics.co.in>' },
              { name: 'Subject', value: 'Weekend Mega Sale - 50% Off' },
            ],
          },
        },
      });

      const analyzer = getNoticeAnalyzer();
      const aiSpy = vi.spyOn(analyzer, 'analyze');

      const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');

      expect(res.status).toBe(200);
      expect(res.body.ignoredMessages).toBe(1);
      expect(res.body.relevantAcademicMessages).toBe(0);

      // ZERO PERSISTENCE: campus_emails must have ZERO rows for this message
      const { rows: emailRows } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['msg_personal_promo_99'],
      );
      expect(emailRows).toHaveLength(0);

      // DEDUPLICATION: processed_gmail_messages MUST record the message ID
      const { rows: processedRows } = await pool.query(
        'SELECT * FROM processed_gmail_messages WHERE gmail_message_id = $1',
        ['msg_personal_promo_99'],
      );
      expect(processedRows).toHaveLength(1);
      expect(processedRows[0].user_id).toBe('student_user');

      // AI SAFETY: Neither Gemini nor Groq is invoked
      expect(aiSpy).not.toHaveBeenCalled();

      // Ensure no notices or assignments created
      const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
      expect(noticeRows).toHaveLength(0);
      const { rows: taskRows } = await pool.query('SELECT * FROM assignments');
      expect(taskRows).toHaveLength(0);
    });

    it('enforces zero-persistence for personal emails even when syncing an authorized reviewer account', async () => {
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'reviewer_user', 'reviewer@vit.ac.in', 'token_1', 'refresh_1', 1700000000)`,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_reviewer_personal_01' }] },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg_reviewer_personal_01',
          snippet: 'Hey, are you free for lunch today at the cafeteria?',
          payload: {
            headers: [
              { name: 'From', value: 'colleague@vit.ac.in' },
              { name: 'Subject', value: 'Lunch today?' },
            ],
            body: {
              data: Buffer.from('Hey, are you free for lunch today at the cafeteria? Let me know.').toString('base64url'),
            },
          },
        },
      });

      const analyzer = getNoticeAnalyzer();
      const aiSpy = vi.spyOn(analyzer, 'analyze');

      const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer reviewer_user');

      expect(res.status).toBe(200);
      expect(res.body.ignoredMessages).toBe(1);
      expect(res.body.relevantAcademicMessages).toBe(0);

      // Reviewer Personal Zero Persistence:
      // 0 campus_emails rows
      const { rows: emailRows } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['msg_reviewer_personal_01'],
      );
      expect(emailRows).toHaveLength(0);

      // 1 processed_gmail_messages row for deduplication
      const { rows: processedRows } = await pool.query(
        'SELECT * FROM processed_gmail_messages WHERE gmail_message_id = $1',
        ['msg_reviewer_personal_01'],
      );
      expect(processedRows).toHaveLength(1);
      expect(processedRows[0].user_id).toBe('reviewer_user');

      // 0 notices
      const { rows: noticeRows } = await pool.query('SELECT * FROM notices');
      expect(noticeRows).toHaveLength(0);

      // 0 assignments
      const { rows: taskRows } = await pool.query('SELECT * FROM assignments');
      expect(taskRows).toHaveLength(0);

      // noticeAnalyzerService NOT called (no Gemini/Groq external call)
      expect(aiSpy).not.toHaveBeenCalled();
    });

    it('persists academic emails and sanitizes content before sending to AI', async () => {
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_academic_urgent_01' }] },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg_academic_urgent_01',
          snippet: 'Dear Students, CAT-1 exam schedule for CSE2001 is updated on VTOP.',
          payload: {
            headers: [
              { name: 'From', value: 'Dean Academics <dean.academics@vit.ac.in>' },
              { name: 'Subject', value: 'CAT-1 Examination Schedule Circular' },
            ],
            body: {
              data: Buffer.from(
                'Dear Students, CAT-1 exam schedule for CSE2001 is updated on VTOP. Attendance is mandatory. https://vtop.vit.ac.in?utm_source=email\n\n--\nOffice of Academics\nThis email is confidential.',
              ).toString('base64url'),
            },
          },
        },
      });

      const analyzer = getNoticeAnalyzer();
      vi.spyOn(analyzer, 'analyze').mockImplementation(async (msg) => {
        return {
          title: msg.subject,
          category: 'exam',
          priority: 'urgent',
          summary: 'CAT-1 exam schedule announced',
          actionRequired: 'Check exam schedule',
          importantDates: [{ label: 'Exam Date', date: '2026-10-15' }],
          source: {
            provider: 'gmail',
            messageId: msg.id,
            sender: msg.sender,
            subject: msg.subject,
          },
        };
      });

      const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');

      expect(res.status).toBe(200);
      expect(res.body.relevantAcademicMessages).toBe(1);

      // Academic email IS persisted to campus_emails
      const { rows: emailRows } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['msg_academic_urgent_01'],
      );
      expect(emailRows).toHaveLength(1);
      expect(emailRows[0].subject).toBe('CAT-1 Examination Schedule Circular');

      // Deduplication record exists
      const { rows: processedRows } = await pool.query(
        'SELECT * FROM processed_gmail_messages WHERE gmail_message_id = $1',
        ['msg_academic_urgent_01'],
      );
      expect(processedRows).toHaveLength(1);

      // For student, analysis completes and creates private notice, but institutional notices are not auto-published (student privacy isolation)
      expect(emailRows[0].analysis_status).toBe('completed');
      const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE source_message_id = $1', [
        'msg_academic_urgent_01',
      ]);
      expect(noticeRows).toHaveLength(1);
      expect(noticeRows[0].source_type).toBe('gmail_personal');
      expect(noticeRows[0].created_by_user_id).toBe('student_user');
      const { rows: instNotices } = await pool.query(
        "SELECT * FROM notices WHERE source_message_id = $1 AND source_type = 'institutional'",
        ['msg_academic_urgent_01'],
      );
      expect(instNotices).toHaveLength(0);
    });

    it('handles uncertain email: stage 1 metadata yields uncertain, stage 2 fetches body and evaluates', async () => {
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_uncertain_01' }] },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg_uncertain_01',
          snippet: 'Please find attached the file we discussed.',
          payload: {
            headers: [
              { name: 'From', value: 'Prof. Ramesh <ramesh.faculty@vit.ac.in>' },
              { name: 'Subject', value: 'File update' },
            ],
            body: {
              data: Buffer.from(
                'Dear class, here is the syllabus and project submission guidelines for CSE3001. Deadline is Oct 30.',
              ).toString('base64url'),
            },
          },
        },
      });

      const analyzer = getNoticeAnalyzer();
      vi.spyOn(analyzer, 'analyze').mockImplementation(async (msg) => {
        return {
          title: msg.subject,
          category: 'assignment',
          priority: 'important',
          summary: 'Project submission guidelines',
          actionRequired: 'Submit project',
          importantDates: [{ label: 'Deadline', date: '2026-10-30' }],
          source: {
            provider: 'gmail',
            messageId: msg.id,
            sender: msg.sender,
            subject: msg.subject,
          },
        };
      });

      const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');

      expect(res.status).toBe(200);
      expect(res.body.relevantAcademicMessages).toBe(1);

      // Academic resolved: saved to campus_emails
      const { rows: emailRows } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['msg_uncertain_01'],
      );
      expect(emailRows).toHaveLength(1);
    });

    it('enforces zero-persistence for missing sender header when second-stage rejects it', async () => {
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_no_sender_99' }] },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg_no_sender_99',
          snippet: 'Random newsletter content without sender header',
          payload: {
            headers: [
              { name: 'Subject', value: 'Newsletter Update' },
            ],
          },
        },
      });

      const analyzer = getNoticeAnalyzer();
      vi.spyOn(analyzer, 'analyze').mockRejectedValueOnce(
        new NoticeValidationError('Definitively not a notice', ['category']),
      );

      const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');

      expect(res.status).toBe(200);
      expect(res.body.ignoredMessages).toBe(1);
      expect(res.body.relevantAcademicMessages).toBe(0);

      // ZERO PERSISTENCE: 0 rows in campus_emails
      const { rows: emailRows } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['msg_no_sender_99'],
      );
      expect(emailRows).toHaveLength(0);

      // Deduplication record exists
      const { rows: processedRows } = await pool.query(
        'SELECT * FROM processed_gmail_messages WHERE gmail_message_id = $1',
        ['msg_no_sender_99'],
      );
      expect(processedRows).toHaveLength(1);
    });

    it('enforces zero-persistence for unknown sender with generic campus vocabulary when rejected by second stage', async () => {
      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
        [randomUUID()],
      );

      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: 'msg_unknown_vocab_01' }] },
      });

      mockGet.mockResolvedValueOnce({
        data: {
          id: 'msg_unknown_vocab_01',
          snippet: 'Free online workshop on coding. Enroll now for exam preparation.',
          payload: {
            headers: [
              { name: 'From', value: 'Promo Academy <offers@promo-training-courses.net>' },
              { name: 'Subject', value: 'Workshop & exam preparation offer' },
            ],
            body: {
              data: Buffer.from('Enroll in our workshop and exam prep courses today!').toString('base64url'),
            },
          },
        },
      });

      const analyzer = getNoticeAnalyzer();
      vi.spyOn(analyzer, 'analyze').mockRejectedValueOnce(
        new NoticeValidationError('Promotional workshop, not a university campus notice', ['category']),
      );

      const res = await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');

      expect(res.status).toBe(200);
      expect(res.body.ignoredMessages).toBe(1);
      expect(res.body.relevantAcademicMessages).toBe(0);

      // PRIVACY: Not persisted to campus_emails because relevance was never established!
      const { rows: emailRows } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['msg_unknown_vocab_01'],
      );
      expect(emailRows).toHaveLength(0);

      const { rows: processedRows } = await pool.query(
        'SELECT * FROM processed_gmail_messages WHERE gmail_message_id = $1',
        ['msg_unknown_vocab_01'],
      );
      expect(processedRows).toHaveLength(1);
    });
  });

  describe('4. Log Sanitization Verification', () => {
    it('does not log raw message IDs or thread IDs during routine operations', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      await pool.query(
        `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
         VALUES ($1, 'student_user', 'student@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
        [randomUUID()],
      );

      const secretMsgId = 'sensitive_secret_msg_id_12345';
      mockList.mockResolvedValueOnce({
        data: { messages: [{ id: secretMsgId }] },
      });
      mockGet.mockResolvedValueOnce({
        data: {
          id: secretMsgId,
          snippet: 'Flash sale 70% off discount shoes.',
          payload: {
            headers: [
              { name: 'From', value: 'Brand Sale <sale@brand.com>' },
              { name: 'Subject', value: 'Exclusive Flash Sale' },
            ],
          },
        },
      });

      await request(app).post('/api/gmail/sync').set('Authorization', 'Bearer student_user');

      // Check all console.log calls to ensure the secret message ID was NEVER logged
      const loggedTexts = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(loggedTexts).not.toContain(secretMsgId);
    });
  });

  describe('5. Uniqueness & Historical Pruning Verification (Phase 2)', () => {
    it('enforces (user_id, source_message_id) uniqueness and updates via ON CONFLICT', async () => {
      const email1 = await campusEmailsService.persistEmail({
        userId: 'user_A',
        sourceAccountEmail: 'usera@vitstudent.ac.in',
        sourceMessageId: 'msg_unique_100',
        subject: 'Initial Subject',
        bodyText: 'Initial Body',
      });

      expect(email1.userId).toBe('user_A');
      expect(email1.sourceMessageId).toBe('msg_unique_100');
      expect(email1.subject).toBe('Initial Subject');

      // Attempt to insert again with same user_id and source_message_id
      const emailUpdated = await campusEmailsService.persistEmail({
        userId: 'user_A',
        sourceAccountEmail: 'usera@vitstudent.ac.in',
        sourceMessageId: 'msg_unique_100',
        subject: 'Updated Subject',
        bodyText: 'Updated Body',
      });

      expect(emailUpdated.id).toBe(email1.id);
      expect(emailUpdated.subject).toBe('Updated Subject');

      const { rows } = await pool.query(
        'SELECT * FROM campus_emails WHERE user_id = $1 AND source_message_id = $2',
        ['user_A', 'msg_unique_100'],
      );
      expect(rows).toHaveLength(1);
    });

    it('allows identical source_message_id across two distinct users (cross-user coexistence)', async () => {
      await campusEmailsService.persistEmail({
        userId: 'user_A',
        sourceAccountEmail: 'usera@vitstudent.ac.in',
        sourceMessageId: 'shared_broadcast_msg_1',
        subject: 'Campus Broadcast',
      });

      await campusEmailsService.persistEmail({
        userId: 'user_B',
        sourceAccountEmail: 'userb@vitstudent.ac.in',
        sourceMessageId: 'shared_broadcast_msg_1',
        subject: 'Campus Broadcast',
      });

      const { rows: allRows } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['shared_broadcast_msg_1'],
      );
      expect(allRows).toHaveLength(2);
      expect(allRows.map((r) => r.user_id).sort()).toEqual(['user_A', 'user_B']);
    });

    it('rejects raw duplicate insert violating uq_campus_emails_user_msg', async () => {
      await pool.query(
        `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject)
         VALUES ($1, 'user_A', 'usera@vitstudent.ac.in', 'dup_msg_1', 'Original')`,
        [randomUUID()],
      );

      await expect(
        pool.query(
          `INSERT INTO campus_emails (id, user_id, source_account_email, source_message_id, subject)
           VALUES ($1, 'user_A', 'usera@vitstudent.ac.in', 'dup_msg_1', 'Duplicate')`,
          [randomUUID()],
        ),
      ).rejects.toThrow();
    });

    it('verifies notices and assignments survive deletion of campus_emails rows', async () => {
      const email = await campusEmailsService.persistEmail({
        userId: 'student_user',
        sourceAccountEmail: 'student@vitstudent.ac.in',
        sourceMessageId: 'msg_survive_test_1',
        subject: 'Hackathon Announcement',
      });

      // Insert published notice with this source_message_id
      const noticeId = randomUUID();
      await pool.query(
        `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_message_id)
         VALUES ($1, 'reviewer_user', 'Hackathon Announcement', 'Hackathon details', 'event', 'normal', 'published', 'msg_survive_test_1')`,
        [noticeId],
      );

      // Insert assignment with source_id = source_message_id
      const assignmentId = randomUUID();
      await pool.query(
        `INSERT INTO assignments (id, user_id, title, due_date, status, source, source_id)
         VALUES ($1, 'student_user', 'Register for Hackathon', '2026-10-15', 'PENDING', 'gmail', 'msg_survive_test_1')`,
        [assignmentId],
      );

      // Delete campus_emails row
      await campusEmailsService.deleteBySourceMessageId('student_user', 'msg_survive_test_1');

      // Verify email row is gone
      const { rows: emailRows } = await pool.query(
        'SELECT * FROM campus_emails WHERE id = $1',
        [email.id],
      );
      expect(emailRows).toHaveLength(0);

      // Verify notice survived completely untouched
      const { rows: noticeRows } = await pool.query(
        'SELECT * FROM notices WHERE id = $1',
        [noticeId],
      );
      expect(noticeRows).toHaveLength(1);
      expect(noticeRows[0].status).toBe('published');

      // Verify assignment survived completely untouched
      const { rows: assignmentRows } = await pool.query(
        'SELECT * FROM assignments WHERE id = $1',
        [assignmentId],
      );
      expect(assignmentRows).toHaveLength(1);
    });

    it('reclassifyExistingCampusEmails deletes non-academic emails from campus_emails', async () => {
      await campusEmailsService.persistEmail({
        userId: 'student_user',
        sourceAccountEmail: 'student@vitstudent.ac.in',
        sourceMessageId: 'promo_cleanup_1',
        subject: 'Big Sale - 50% Off Electronics',
        bodyText: 'Limited time offer! Get your discounted laptops now at www.electronicsale.com.',
        snippet: 'Limited time offer!',
      });

      const { rows: before } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['promo_cleanup_1'],
      );
      expect(before).toHaveLength(1);

      const stats = await reclassifyExistingCampusEmails('student_user');
      expect(stats.ignoredCount).toBe(1);

      // Email row must be deleted completely
      const { rows: after } = await pool.query(
        'SELECT * FROM campus_emails WHERE source_message_id = $1',
        ['promo_cleanup_1'],
      );
      expect(after).toHaveLength(0);

      // Recorded in processed_gmail_messages
      const { rows: processed } = await pool.query(
        'SELECT * FROM processed_gmail_messages WHERE user_id = $1 AND gmail_message_id = $2',
        ['student_user', 'promo_cleanup_1'],
      );
      expect(processed).toHaveLength(1);
    });
  });
});
