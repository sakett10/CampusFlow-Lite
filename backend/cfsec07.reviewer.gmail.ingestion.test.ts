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
const mockGet = vi.fn();
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
      if (authHeader === 'Bearer reviewer_1') {
        req.auth = { userId: 'reviewer_1', sessionClaims: { metadata: { role: 'reviewer' } } };
      } else if (authHeader === 'Bearer student_1') {
        req.auth = { userId: 'student_1', sessionClaims: { metadata: { role: 'student' } } };
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
    getAuth: (req: Request & { auth?: { userId: string | null; sessionClaims?: Record<string, unknown> } }) => ({
      userId: req.auth?.userId || null,
      sessionClaims: req.auth?.sessionClaims,
    }),
  };
});

import app from './index.js';
import { pool } from './db.js';
import { setNoticeAnalyzer, resetNoticeAnalyzer, type NoticeAnalyzer } from './services/noticeAnalyzer.service.js';
import { noticesService, UnauthorizedNoticeAccessError } from './services/notices.service.js';
import type { NoticeCandidate } from './types.js';

describe('CF-SEC-07: Reviewer Gmail Ingestion Classification & Authorization', () => {
  const mockCandidate: NoticeCandidate = {
    title: 'University Symposium 2026',
    summary: 'Department symposium on AI in Education.',
    category: 'academic',
    priority: 'normal',
    venue: 'Main Auditorium',
    source: {
      provider: 'gmail',
      messageId: 'msg_symp_500',
      sender: 'dean.academic@vit.ac.in',
      subject: 'Annual AI Symposium Call for Papers',
    },
  };

  beforeEach(async () => {
    mockGet.mockReset();
    resetNoticeAnalyzer();
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM gmail_connections');

    // 1. Seed reviewer_1 connected with personal Gmail address (@gmail.com domain)
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'reviewer_1', 'reviewer.personal@gmail.com', 'tok_rev', 'ref_rev', 1700000000)
      `,
      [randomUUID()],
    );

    // 2. Seed student_1 connected with college Gmail address
    await pool.query(
      `
      INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
      VALUES ($1, 'student_1', 'alice.2024@vitstudent.ac.in', 'tok_stu', 'ref_stu', 1700000000)
      `,
      [randomUUID()],
    );

    const emailBody = 'Department symposium call for papers and registration details.';
    const encodedBody = Buffer.from(emailBody).toString('base64url');

    mockGet.mockResolvedValue({
      data: {
        id: 'msg_symp_500',
        threadId: 'thread_500',
        snippet: 'Symposium call for papers...',
        payload: {
          headers: [
            { name: 'From', value: 'dean.academic@vit.ac.in' },
            { name: 'To', value: 'reviewer.personal@gmail.com' },
            { name: 'Subject', value: 'Annual AI Symposium' },
            { name: 'Date', value: 'Mon, 15 Sep 2026 10:00:00 +0530' },
          ],
          mimeType: 'text/plain',
          body: { data: encodedBody },
        },
      },
    });

    const mockAnalyzer: NoticeAnalyzer = {
      analyze: vi.fn().mockResolvedValue(mockCandidate),
    };
    setNoticeAnalyzer(mockAnalyzer);
  });

  it('1. Authorized reviewer ingesting notice from Gmail creates an institutional notice with status pending (even with @gmail.com)', async () => {
    const res = await request(app)
      .post('/api/notices/from-gmail/msg_symp_500')
      .set('Authorization', 'Bearer reviewer_1');

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('University Symposium 2026');
    expect(res.body.sourceType).toBe('institutional');
    expect(res.body.status).toBe('pending');

    // Verify in database that source_type is strictly 'institutional'
    const { rows } = await pool.query('SELECT source_type, status FROM notices WHERE id = $1', [res.body.id]);
    expect(rows[0].source_type).toBe('institutional');
    expect(rows[0].status).toBe('pending');
  });

  it('2. Ordinary student cannot use reviewer /api/notices/from-gmail endpoint (blocked with 403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/notices/from-gmail/msg_symp_500')
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Reviewer or Admin access required');

    // Verify no notice was created in DB
    const { rows } = await pool.query('SELECT * FROM notices');
    expect(rows).toHaveLength(0);
  });

  it('3. Direct service call to createFromGmailMessage by non-reviewer throws UnauthorizedNoticeAccessError', async () => {
    await expect(
      noticesService.createFromGmailMessage('student_1', 'msg_symp_500'),
    ).rejects.toThrow(UnauthorizedNoticeAccessError);
  });

  it('4. Normal student background Gmail sync sets sourceType to gmail_personal', async () => {
    // Normal student sync path calls createFromCandidate with sourceType: 'gmail_personal'
    const studentCandidate: NoticeCandidate = {
      title: 'Course Enrollment Verification Form',
      summary: 'Please verify your elective courses for the semester.',
      category: 'academic',
      priority: 'important',
      source: {
        provider: 'gmail',
        messageId: 'msg_stu_sync_1',
        sender: 'hod.cse@vit.ac.in',
        subject: 'Elective Verification',
      },
    };

    const studentNotice = await noticesService.createFromCandidate('student_1', studentCandidate, {
      sourceType: 'gmail_personal',
      initialStatus: 'published',
      accountEmail: 'alice.2024@vitstudent.ac.in',
    });

    expect(studentNotice.sourceType).toBe('gmail_personal');
    expect(studentNotice.createdByUserId).toBe('student_1');

    // Verify in PostgreSQL
    const { rows } = await pool.query('SELECT source_type, created_by_user_id FROM notices WHERE id = $1', [studentNotice.id]);
    expect(rows[0].source_type).toBe('gmail_personal');
    expect(rows[0].created_by_user_id).toBe('student_1');
  });
});
