import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock googleapis
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
            data: { emailAddress: 'user@vitstudent.ac.in' },
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

// Mock Clerk auth
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware: () => (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
      _res: Response,
      next: NextFunction,
    ) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer user_A') {
        req.auth = { userId: 'user_A', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer user_B') {
        req.auth = { userId: 'user_B', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer reviewer_1') {
        req.auth = { userId: 'reviewer_1', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else {
        req.auth = { userId: null };
      }
      next();
    },
    requireAuth: () => (
      req: Request & { auth?: { userId: string | null } },
      res: Response,
      next: NextFunction,
    ) => {
      if (!req.auth || !req.auth.userId) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
      next();
    },
    getAuth: (
      req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } },
    ) => ({
      userId: req.auth?.userId || null,
      sessionClaims: req.auth?.sessionClaims,
    }),
  };
});

import { pool } from './db.js';
import { noticesService, UnauthorizedNoticeAccessError } from './services/notices.service.js';
import { storageService } from './services/storage.service.js';
import { parseGmailMessageDetails } from './services/gmail.service.js';
import { resetNoticeAnalyzer } from './services/noticeAnalyzer.service.js';

describe('Data Correctness and Strict Account Isolation Suite', () => {
  beforeEach(async () => {
    mockList.mockReset();
    mockGet.mockReset();
    resetNoticeAnalyzer();
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM gmail_connections');
  });

  describe('1. Authoritative Timestamp & Date Concept Separation', () => {
    it('accurately parses Gmail internalDate into immutable UTC ISO 8601 string, ignoring corrupted Date headers', () => {
      // internalDate for 2026-08-30 09:57:26 UTC = 1788083846000
      const epochMs = 1788083846000;
      const fakeMsg = {
        id: 'msg_date_test_1',
        internalDate: String(epochMs),
        snippet: 'Important Sports Day update',
        payload: {
          headers: [
            { name: 'From', value: 'sports@vit.ac.in' },
            { name: 'To', value: 'student@vitstudent.ac.in' },
            { name: 'Subject', value: 'National Sports Day 2026' },
            // Date header is deliberately inconsistent/localized
            { name: 'Date', value: 'Thu, 1 Jan 1970 00:00:00 GMT' },
          ],
        },
      };

      const parsed = parseGmailMessageDetails(fakeMsg, 'msg_date_test_1');
      expect(parsed.internalDate).toBe(String(epochMs));
      const authoritativeDate = parsed.internalDate
        ? new Date(Number(parsed.internalDate)).toISOString()
        : new Date(parsed.date).toISOString();
      expect(authoritativeDate).toBe(new Date(epochMs).toISOString());
    });

    it('distinguishes source_received_at from event date and does not invent task due date when no deadline is present', async () => {
      const emailReceivedAt = '2026-08-30T09:57:26.000Z';
      const eventDate = '2026-09-15'; // Event happens Sep 15, but email arrived Aug 30

      // Notice with event date but NO deadline keyword
      const notice = await noticesService.createFromCandidate(
        'user_A',
        {
          title: 'Campus Orientation Day',
          summary: 'Orientation ceremony on September 15th at Main Auditorium.',
          category: 'event',
          priority: 'normal',
          importantDates: [{ label: 'Ceremony Date', date: eventDate }],
          source: {
            provider: 'gmail',
            messageId: 'msg_orientation_1',
            sender: 'admin@vit.ac.in',
            subject: 'Orientation Day',
            receivedAt: emailReceivedAt,
          },
        },
        {
          accountEmail: 'userA@vitstudent.ac.in',
          initialStatus: 'published',
          sourceReceivedAt: emailReceivedAt,
        },
      );

      expect(notice.sourceReceivedAt).toBe(emailReceivedAt);
      expect(notice.importantDates![0].date).toBe(eventDate);

      // Student converts notice to task without providing custom due date
      const conversion = await noticesService.convertToTask('user_A', notice.id);
      expect(conversion.task).toBeDefined();
      // MUST NOT set event date as task due date because orientation is an event, not a deadline!
      expect(conversion.task.dueDate).toBe('');
    });

    it('extracts task due date when an explicit deadline keyword is present', async () => {
      const emailReceivedAt = '2026-08-30T09:57:26.000Z';
      const deadlineDate = '2026-09-20';

      const notice = await noticesService.createFromCandidate(
        'user_A',
        {
          title: 'Project Submission',
          summary: 'Submit capstone code by 2026-09-20.',
          category: 'assignment',
          priority: 'urgent',
          importantDates: [
            { label: 'Event Date', date: '2026-09-15' },
            { label: 'Submission Deadline', date: deadlineDate },
          ],
          source: {
            provider: 'gmail',
            messageId: 'msg_project_sub',
            sender: 'prof@vit.ac.in',
            subject: 'Capstone Deadline',
            receivedAt: emailReceivedAt,
          },
        },
        {
          accountEmail: 'userA@vitstudent.ac.in',
          initialStatus: 'published',
          sourceReceivedAt: emailReceivedAt,
        },
      );

      const conversion = await noticesService.convertToTask('user_A', notice.id);
      expect(conversion.task.dueDate).toBe(deadlineDate);
    });
  });

  describe('2. Strict Account and Tenant Isolation (P0)', () => {
    it('User A and User B cannot see each other Gmail-derived notices', async () => {
      // Notice created from User A's Gmail
      const noticeA = await noticesService.createFromCandidate(
        'user_A',
        {
          title: 'User A Private Academic Notice',
          summary: 'Confidential grade report for User A',
          category: 'academic',
          priority: 'normal',
          source: {
            provider: 'gmail',
            messageId: 'msg_user_a_priv',
            sender: 'grades@vit.ac.in',
            subject: 'Grade Report',
          },
        },
        {
          accountEmail: 'userA@vitstudent.ac.in',
          initialStatus: 'published',
        },
      );

      // Notice created from User B's Gmail
      const noticeB = await noticesService.createFromCandidate(
        'user_B',
        {
          title: 'User B Private Academic Notice',
          summary: 'Confidential scholarship decision for User B',
          category: 'scholarship',
          priority: 'normal',
          source: {
            provider: 'gmail',
            messageId: 'msg_user_b_priv',
            sender: 'scholarships@vit.ac.in',
            subject: 'Scholarship Decision',
          },
        },
        {
          accountEmail: 'userB@vitstudent.ac.in',
          initialStatus: 'published',
        },
      );

      // User A queries all notices
      const userANotices = await noticesService.getAll({
        isReviewer: false,
        userId: 'user_A',
        status: 'published',
      });
      const userAIds = userANotices.map((n) => n.id);
      expect(userAIds).toContain(noticeA.id);
      expect(userAIds).not.toContain(noticeB.id);

      // User B queries all notices
      const userBNotices = await noticesService.getAll({
        isReviewer: false,
        userId: 'user_B',
        status: 'published',
      });
      const userBIds = userBNotices.map((n) => n.id);
      expect(userBIds).toContain(noticeB.id);
      expect(userBIds).not.toContain(noticeA.id);

      // User B cannot fetch User A's notice by ID
      const fetchedByB = await noticesService.getById(noticeA.id, false, 'user_B');
      expect(fetchedByB).toBeNull();

      // User B cannot convert User A's notice to a task
      await expect(
        noticesService.convertToTask('user_B', noticeA.id),
      ).rejects.toThrow(UnauthorizedNoticeAccessError);
    });

    it('Reviewer cannot view another user private Gmail notice', async () => {
      const noticeA = await noticesService.createFromCandidate(
        'user_A',
        {
          title: 'User A Private Notice',
          summary: 'User A private study session',
          category: 'academic',
          priority: 'normal',
          source: {
            provider: 'gmail',
            messageId: 'msg_a_personal_study',
            sender: 'tutor@vit.ac.in',
            subject: 'Tutoring',
          },
        },
        {
          accountEmail: 'userA@vitstudent.ac.in',
          initialStatus: 'published',
        },
      );

      // Reviewer 1 queries notices
      const reviewerNotices = await noticesService.getAll({
        isReviewer: true,
        userId: 'reviewer_1',
      });
      const reviewerNoticeIds = reviewerNotices.map((n) => n.id);
      expect(reviewerNoticeIds).not.toContain(noticeA.id);

      // Reviewer 1 cannot get notice by ID
      const revNotice = await noticesService.getById(noticeA.id, true, 'reviewer_1');
      expect(revNotice).toBeNull();
    });

    it('Campus Feed (storageService.getAll) strictly isolates Gmail-derived notices', async () => {
      // User A's Gmail notice
      await noticesService.createFromCandidate(
        'user_A',
        {
          title: 'User A Club Selection',
          summary: 'User A has been selected for Coding Club',
          category: 'event',
          priority: 'normal',
          source: {
            provider: 'gmail',
            messageId: 'msg_a_club',
            sender: 'codingclub@vit.ac.in',
            subject: 'Selection',
          },
        },
        {
          accountEmail: 'userA@vitstudent.ac.in',
          initialStatus: 'published',
        },
      );

      // User B loads Campus Feed
      const feedB = await storageService.getAll('user_B');
      expect(feedB.some((item) => (item.title || '').includes('User A Club Selection'))).toBe(false);

      // User A loads Campus Feed
      const feedA = await storageService.getAll('user_A');
      expect(feedA.some((item) => (item.title || '').includes('User A Club Selection'))).toBe(true);
    });

    it('Institutional campus notices (source_account_email is NULL) are visible to all users once published', async () => {
      const institutionalNotice = await noticesService.createFromCandidate(
        'admin',
        {
          title: 'University Convocation 2026',
          summary: 'Annual Convocation for graduating students.',
          category: 'event',
          priority: 'important',
          source: {
            provider: 'gmail',
            messageId: '',
            sender: 'Chancellor Office',
            subject: 'Convocation',
          },
        },
        {
          initialStatus: 'published',
        },
      );

      const userANotices = await noticesService.getAll({
        isReviewer: false,
        userId: 'user_A',
        status: 'published',
      });
      expect(userANotices.map((n) => n.id)).toContain(institutionalNotice.id);

      const userBNotices = await noticesService.getAll({
        isReviewer: false,
        userId: 'user_B',
        status: 'published',
      });
      expect(userBNotices.map((n) => n.id)).toContain(institutionalNotice.id);
    });
  });
});
