import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Mock test database BEFORE importing app
vi.mock('./db.js', async () => {
  const { createTestPool } = await import('./testDb.js');
  return { pool: createTestPool() };
});

// Mock googleapis
vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      gmail: vi.fn().mockImplementation(() => ({
        users: {
          messages: {
            get: vi.fn(),
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
      if (authHeader === 'Bearer reviewer_A') {
        req.auth = { userId: 'reviewer_A', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer reviewer_B') {
        req.auth = { userId: 'reviewer_B', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer student_1') {
        req.auth = { userId: 'student_1', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer student_2') {
        req.auth = { userId: 'student_2', sessionClaims: { metadata: { role: 'student' } } };
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

import app from './index.js';
import { pool } from './db.js';
import { parseMonthRange } from './services/notices.service.js';

describe('Backend Month-Based Notice Filtering & Security Audit', () => {
  beforeEach(async () => {
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM notices');
  });

  describe('1. parseMonthRange Unit Validation & Range Logic', () => {
    it('correctly parses and computes exclusive range for standard months', () => {
      expect(parseMonthRange('2026-09')).toEqual({
        start: '2026-09-01 00:00:00',
        end: '2026-10-01 00:00:00',
      });

      expect(parseMonthRange('2026-08')).toEqual({
        start: '2026-08-01 00:00:00',
        end: '2026-09-01 00:00:00',
      });

      expect(parseMonthRange('2025-12')).toEqual({
        start: '2025-12-01 00:00:00',
        end: '2026-01-01 00:00:00',
      });
    });

    it('handles December to January year boundaries correctly without string prefixing', () => {
      const decRange = parseMonthRange('2026-12');
      expect(decRange).toEqual({
        start: '2026-12-01 00:00:00',
        end: '2027-01-01 00:00:00',
      });
    });

    it('rejects malformed month formats with null', () => {
      expect(parseMonthRange('2026')).toBeNull();
      expect(parseMonthRange('09-2026')).toBeNull();
      expect(parseMonthRange('2026-9')).toBeNull();
      expect(parseMonthRange('abc')).toBeNull();
      expect(parseMonthRange('2026/09')).toBeNull();
      expect(parseMonthRange('')).toBeNull();
      expect(parseMonthRange(null)).toBeNull();
      expect(parseMonthRange(undefined)).toBeNull();
      expect(parseMonthRange(12345)).toBeNull();
    });

    it('rejects invalid month numbers with null (out of range 01-12)', () => {
      expect(parseMonthRange('2026-00')).toBeNull();
      expect(parseMonthRange('2026-13')).toBeNull();
      expect(parseMonthRange('2026-99')).toBeNull();
    });
  });

  describe('2. HTTP GET /api/notices?month= Validation', () => {
    it('returns 400 Bad Request for malformed month format', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid month format');
    });

    it('returns 400 Bad Request for single-digit month', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-9')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid month format');
    });

    it('returns 400 Bad Request for reversed format MM-YYYY', async () => {
      const res = await request(app)
        .get('/api/notices?month=09-2026')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid month format');
    });

    it('returns 400 Bad Request for non-numeric month', async () => {
      const res = await request(app)
        .get('/api/notices?month=abc')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid month format');
    });

    it('returns 400 Bad Request for month numbers greater than 12', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-13')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid month format');
    });

    it('returns 400 Bad Request for month numbers equal to 00', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-00')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid month format');
    });
  });

  describe('3. Database Month Range Queries & Boundary Precision', () => {
    beforeEach(async () => {
      // Helper to insert notices directly into database
      const insertNotice = async (title: string, date: string) => {
        const id = randomUUID();
        await pool.query(
          `
          INSERT INTO notices (
            id, created_by_user_id, title, summary, category, priority,
            source_type, status, source_received_at, published_at, created_at
          ) VALUES ($1, 'reviewer_A', $2, 'Summary', 'academic', 'normal', 'institutional', 'published', $3, $3, $3)
          `,
          [id, title, date],
        );
        return id;
      };

      await insertNotice('August End Notice', '2026-08-31 23:59:59');
      await insertNotice('September Start Notice', '2026-09-01 00:00:00');
      await insertNotice('September Mid Notice', '2026-09-15 12:00:00');
      await insertNotice('September End Notice', '2026-09-30 23:59:59');
      await insertNotice('October Start Notice', '2026-10-01 00:00:00');
      await insertNotice('December 2026 Notice', '2026-12-15 10:00:00');
      await insertNotice('January 2027 Notice', '2027-01-02 10:00:00');
    });

    it('returns exactly notices within the September 2026 range [2026-09-01, 2026-10-01)', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-09')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(200);
      const titles = res.body.map((n: { title: string }) => n.title);
      expect(titles).toHaveLength(3);
      expect(titles).toContain('September Start Notice');
      expect(titles).toContain('September Mid Notice');
      expect(titles).toContain('September End Notice');
      expect(titles).not.toContain('August End Notice');
      expect(titles).not.toContain('October Start Notice');
    });

    it('returns previous month (August 2026) notices when requested', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-08')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(200);
      const titles = res.body.map((n: { title: string }) => n.title);
      expect(titles).toHaveLength(1);
      expect(titles).toContain('August End Notice');
    });

    it('correctly handles December to January year boundary queries', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-12')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(200);
      const titles = res.body.map((n: { title: string }) => n.title);
      expect(titles).toHaveLength(1);
      expect(titles).toContain('December 2026 Notice');
      expect(titles).not.toContain('January 2027 Notice');

      // Now query January 2027
      const resJan = await request(app)
        .get('/api/notices?month=2027-01')
        .set('Authorization', 'Bearer student_1');

      expect(resJan.status).toBe(200);
      const titlesJan = resJan.body.map((n: { title: string }) => n.title);
      expect(titlesJan).toHaveLength(1);
      expect(titlesJan).toContain('January 2027 Notice');
    });

    it('preserves existing default behavior when month parameter is omitted', async () => {
      const res = await request(app)
        .get('/api/notices')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(7); // All notices across all months returned
    });
  });

  describe('4. Canonical Chronology Precedence (source_received_at -> published_at -> created_at)', () => {
    it('uses source_received_at when available even if created_at is different', async () => {
      const gmailNoticeId = randomUUID();
      // Notice created in January, but email received in September
      await pool.query(
        `
        INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority,
          source_type, status, source_received_at, published_at, created_at
        ) VALUES (
          $1, 'student_1', 'Gmail Synced in September', 'Summary', 'academic', 'normal',
          'gmail_personal', 'published', '2026-09-10 14:00:00', NULL, '2026-01-01 00:00:00'
        )
        `,
        [gmailNoticeId],
      );

      const resSep = await request(app)
        .get('/api/notices?month=2026-09')
        .set('Authorization', 'Bearer student_1');

      expect(resSep.status).toBe(200);
      expect(resSep.body.map((n: { id: string }) => n.id)).toContain(gmailNoticeId);

      const resJan = await request(app)
        .get('/api/notices?month=2026-01')
        .set('Authorization', 'Bearer student_1');

      expect(resJan.status).toBe(200);
      expect(resJan.body.map((n: { id: string }) => n.id)).not.toContain(gmailNoticeId);
    });

    it('uses published_at when source_received_at is null', async () => {
      const pubNoticeId = randomUUID();
      // Official notice published in September, created in August
      await pool.query(
        `
        INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority,
          source_type, status, source_received_at, published_at, created_at
        ) VALUES (
          $1, 'reviewer_A', 'Official Circular Published September', 'Summary', 'general', 'normal',
          'institutional', 'published', NULL, '2026-09-05 10:00:00', '2026-08-20 00:00:00'
        )
        `,
        [pubNoticeId],
      );

      const resSep = await request(app)
        .get('/api/notices?month=2026-09')
        .set('Authorization', 'Bearer student_1');

      expect(resSep.status).toBe(200);
      expect(resSep.body.map((n: { id: string }) => n.id)).toContain(pubNoticeId);

      const resAug = await request(app)
        .get('/api/notices?month=2026-08')
        .set('Authorization', 'Bearer student_1');

      expect(resAug.status).toBe(200);
      expect(resAug.body.map((n: { id: string }) => n.id)).not.toContain(pubNoticeId);
    });
  });

  describe('5. Strict Tenant Isolation & Security Invariants Under Month Queries', () => {
    let noticeUserA: string;
    let noticeUserB: string;
    let noticeInstPub: string;
    let noticeInstPending: string;

    beforeEach(async () => {
      noticeUserA = randomUUID();
      noticeUserB = randomUUID();
      noticeInstPub = randomUUID();
      noticeInstPending = randomUUID();

      // User A personal notice in September 2026
      await pool.query(
        `
        INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority,
          source_type, status, source_received_at, published_at, created_at
        ) VALUES (
          $1, 'student_1', 'Student 1 Private Syllabus Email', 'Private', 'academic', 'normal',
          'gmail_personal', 'published', '2026-09-12 10:00:00', '2026-09-12 10:00:00', '2026-09-12 10:00:00'
        )
        `,
        [noticeUserA],
      );

      // User B personal notice in September 2026
      await pool.query(
        `
        INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority,
          source_type, status, source_received_at, published_at, created_at
        ) VALUES (
          $1, 'student_2', 'Student 2 Private Fee Receipt', 'Private', 'fee', 'urgent',
          'gmail_personal', 'published', '2026-09-14 10:00:00', '2026-09-14 10:00:00', '2026-09-14 10:00:00'
        )
        `,
        [noticeUserB],
      );

      // Institutional published notice in September 2026
      await pool.query(
        `
        INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority,
          source_type, status, source_received_at, published_at, created_at
        ) VALUES (
          $1, 'reviewer_A', 'Campus-Wide September Convocation', 'Public', 'event', 'important',
          'institutional', 'published', '2026-09-18 10:00:00', '2026-09-18 10:00:00', '2026-09-18 10:00:00'
        )
        `,
        [noticeInstPub],
      );

      // Institutional pending review notice in September 2026
      await pool.query(
        `
        INSERT INTO notices (
          id, created_by_user_id, title, summary, category, priority,
          source_type, status, source_received_at, published_at, created_at
        ) VALUES (
          $1, 'reviewer_A', 'Draft September Notice Pending Review', 'Draft', 'general', 'low',
          'institutional', 'pending', '2026-09-20 10:00:00', NULL, '2026-09-20 10:00:00'
        )
        `,
        [noticeInstPending],
      );
    });

    it('student_1 querying September sees their own gmail_personal notice, NOT student_2 personal notice', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-09')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(200);
      const ids = res.body.map((n: { id: string }) => n.id);

      expect(ids).toContain(noticeUserA);
      expect(ids).not.toContain(noticeUserB); // NEVER leaked to student_1!
      expect(ids).toContain(noticeInstPub); // Public institutional notice is visible
      expect(ids).not.toContain(noticeInstPending); // Pending notice is hidden from students
    });

    it('student_2 querying September sees their own gmail_personal notice, NOT student_1 personal notice', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-09')
        .set('Authorization', 'Bearer student_2');

      expect(res.status).toBe(200);
      const ids = res.body.map((n: { id: string }) => n.id);

      expect(ids).toContain(noticeUserB);
      expect(ids).not.toContain(noticeUserA); // NEVER leaked to student_2!
      expect(ids).toContain(noticeInstPub); // Public institutional notice is visible
      expect(ids).not.toContain(noticeInstPending); // Pending notice is hidden from students
    });

    it('reviewer querying September CANNOT see any student gmail_personal notices', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-09')
        .set('Authorization', 'Bearer reviewer_A');

      expect(res.status).toBe(200);
      const ids = res.body.map((n: { id: string }) => n.id);

      expect(ids).not.toContain(noticeUserA); // Reviewer must NOT see student_1 personal notice!
      expect(ids).not.toContain(noticeUserB); // Reviewer must NOT see student_2 personal notice!
      expect(ids).toContain(noticeInstPub); // Reviewer sees institutional published notice
      expect(ids).toContain(noticeInstPending); // Reviewer sees institutional pending notice
    });
  });

  describe('6. Composition with Other Filters', () => {
    let m1Id: string;

    beforeEach(async () => {
      m1Id = randomUUID();
      const m2Id = randomUUID();
      const m3Id = randomUUID();
      const m4Id = randomUUID();

      const insert = async (
        id: string,
        title: string,
        category: string,
        priority: string,
        date: string,
      ) => {
        await pool.query(
          `
          INSERT INTO notices (
            id, created_by_user_id, title, summary, category, priority,
            source_type, status, source_received_at, published_at, created_at
          ) VALUES ($1, 'reviewer_A', $2, 'Course midterms schedule', $3, $4, 'institutional', 'published', $5, $5, $5)
          `,
          [id, title, category, priority, date],
        );
      };

      await insert(m1Id, 'Midterm FAT Schedule 2026', 'academic', 'urgent', '2026-09-10 10:00:00');
      await insert(m2Id, 'Robotics Hackathon 2026', 'event', 'normal', '2026-09-12 10:00:00');
      await insert(m3Id, 'Summer FAT Exam 2026', 'academic', 'urgent', '2026-08-25 10:00:00');
      await insert(m4Id, 'Midterm Supplementary Exam', 'academic', 'low', '2026-09-15 10:00:00');
    });

    it('composes month with category, priority, and search filters simultaneously', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-09&category=academic&priority=urgent&search=FAT')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(m1Id);
      expect(res.body[0].title).toBe('Midterm FAT Schedule 2026');
    });

    it('returns empty array when filters match within month but search term does not match', async () => {
      const res = await request(app)
        .get('/api/notices?month=2026-09&search=NonExistentKeywords')
        .set('Authorization', 'Bearer student_1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });
});
