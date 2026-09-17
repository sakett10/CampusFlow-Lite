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
const mockMessagesGet = vi.fn();
const mockAttachmentsGet = vi.fn();
const mockList = vi.fn();

vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn();
    generateAuthUrl = vi.fn().mockReturnValue('https://mock-auth-url');
    revokeToken = vi.fn().mockResolvedValue({});
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
            data: { emailAddress: 'student1@vitstudent.ac.in' },
          }),
          messages: {
            list: mockList,
            get: mockMessagesGet,
            attachments: {
              get: mockAttachmentsGet,
            },
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
      if (authHeader === 'Bearer student_1') {
        req.auth = { userId: 'student_1', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer student_2') {
        req.auth = { userId: 'student_2', sessionClaims: { metadata: { role: 'student' } } };
      } else if (authHeader === 'Bearer reviewer_A') {
        req.auth = { userId: 'reviewer_A', sessionClaims: { metadata: { role: 'reviewer' } } };
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
import {
  MemoryObjectStorageDriver,
  setObjectStorageDriver,
  generateStorageKey,
} from './services/objectStorage.service.js';
import { attachmentsService } from './services/attachments.service.js';
import { setNoticeAnalyzer, resetNoticeAnalyzer } from './services/noticeAnalyzer.service.js';

describe('Notice Attachments & Delivery Layer', () => {
  let memoryStorage: MemoryObjectStorageDriver;

  beforeEach(async () => {
    mockMessagesGet.mockReset();
    mockAttachmentsGet.mockReset();
    mockList.mockReset();
    resetNoticeAnalyzer();

    // Ensure clean in-memory storage driver
    memoryStorage = new MemoryObjectStorageDriver();
    setObjectStorageDriver(memoryStorage);

    await pool.query('DELETE FROM notice_attachments');
    await pool.query('DELETE FROM notices');
    await pool.query('DELETE FROM campus_emails');
    await pool.query('DELETE FROM processed_gmail_messages');
    await pool.query('DELETE FROM gmail_connections');
  });

  it('1. Authenticated owner can list attachments of their notice', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, 'student_1', 'CAT-1 Timetable', 'Test timetable', 'exam', 'urgent', 'published', 'gmail_personal')`,
      [noticeId],
    );

    const pdfKey = generateStorageKey(noticeId, 'timetable.pdf');
    await memoryStorage.put(pdfKey, Buffer.from('%PDF-1.4 test'), 'application/pdf');

    await attachmentsService.createAttachmentRecord({
      noticeId,
      userId: 'student_1',
      filename: 'timetable.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 15,
      storageKey: pdfKey,
    });

    const res = await request(app)
      .get(`/api/notices/${noticeId}/attachments`)
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].filename).toBe('timetable.pdf');
    expect(res.body[0].mimeType).toBe('application/pdf');
    expect(res.body[0].attachmentType).toBe('pdf');
    expect(res.body[0].sizeBytes).toBe(15);
    // Never exposes internal storageKey or tokens
    expect(res.body[0].storageKey).toBeUndefined();
    expect(res.body[0].gmailAttachmentId).toBeUndefined();
  });

  it('2. Authenticated owner can open PDF attachment with inline Content-Disposition', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, 'student_1', 'Academic Calendar', 'Test calendar', 'academic', 'normal', 'published', 'gmail_personal')`,
      [noticeId],
    );

    const pdfBuffer = Buffer.from('%PDF-1.4 sample content');
    const pdfKey = generateStorageKey(noticeId, 'calendar.pdf');
    await memoryStorage.put(pdfKey, pdfBuffer, 'application/pdf');

    const record = await attachmentsService.createAttachmentRecord({
      noticeId,
      userId: 'student_1',
      filename: 'calendar.pdf',
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      storageKey: pdfKey,
    });

    const res = await request(app)
      .get(`/api/notices/${noticeId}/attachments/${record.id}`)
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('inline; filename="calendar.pdf"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toEqual(pdfBuffer);
  });

  it('3. Authenticated owner can open image attachment with correct image MIME type', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, 'student_1', 'Hackathon Poster', 'Hackathon flyer', 'event', 'normal', 'published', 'gmail_personal')`,
      [noticeId],
    );

    const imgBuffer = Buffer.from('fake-png-binary-data');
    const imgKey = generateStorageKey(noticeId, 'poster.png');
    await memoryStorage.put(imgKey, imgBuffer, 'image/png');

    const record = await attachmentsService.createAttachmentRecord({
      noticeId,
      userId: 'student_1',
      filename: 'poster.png',
      mimeType: 'image/png',
      sizeBytes: imgBuffer.length,
      storageKey: imgKey,
    });

    const res = await request(app)
      .get(`/api/notices/${noticeId}/attachments/${record.id}`)
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-disposition']).toContain('inline; filename="poster.png"');
    expect(res.body).toEqual(imgBuffer);
  });

  it('4. Multi-Tenant Isolation: Student B cannot list attachments of Student A personal notice', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, 'student_1', 'Student 1 Private Notice', 'Private', 'academic', 'normal', 'published', 'gmail_personal')`,
      [noticeId],
    );

    const pdfKey = generateStorageKey(noticeId, 'private.pdf');
    await memoryStorage.put(pdfKey, Buffer.from('%PDF-1.4 private'), 'application/pdf');

    await attachmentsService.createAttachmentRecord({
      noticeId,
      userId: 'student_1',
      filename: 'private.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 15,
      storageKey: pdfKey,
    });

    // Student B requests Student A's notice attachments
    const res = await request(app)
      .get(`/api/notices/${noticeId}/attachments`)
      .set('Authorization', 'Bearer student_2');

    // Must return 404 (non-leaking)
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Notice not found');
  });

  it('5. Multi-Tenant Isolation: Student B cannot open attachment of Student A personal notice', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, 'student_1', 'Student 1 Private Notice', 'Private', 'academic', 'normal', 'published', 'gmail_personal')`,
      [noticeId],
    );

    const pdfKey = generateStorageKey(noticeId, 'private.pdf');
    await memoryStorage.put(pdfKey, Buffer.from('%PDF-1.4 private'), 'application/pdf');

    const record = await attachmentsService.createAttachmentRecord({
      noticeId,
      userId: 'student_1',
      filename: 'private.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 15,
      storageKey: pdfKey,
    });

    // Student B requests Student A's attachment by ID
    const res = await request(app)
      .get(`/api/notices/${noticeId}/attachments/${record.id}`)
      .set('Authorization', 'Bearer student_2');

    // Must return 404 (non-leaking)
    expect(res.status).toBe(404);
  });

  it('6. Nonexistent attachment or notice returns safe 404', async () => {
    const fakeNoticeId = randomUUID();
    const fakeAttachmentId = randomUUID();

    const res1 = await request(app)
      .get(`/api/notices/${fakeNoticeId}/attachments`)
      .set('Authorization', 'Bearer student_1');
    expect(res1.status).toBe(404);
    expect(res1.body.error).toBe('Notice not found');

    const res2 = await request(app)
      .get(`/api/notices/${fakeNoticeId}/attachments/${fakeAttachmentId}`)
      .set('Authorization', 'Bearer student_1');
    expect(res2.status).toBe(404);
  });

  it('7. Unauthenticated requests are rejected with 401', async () => {
    const noticeId = randomUUID();
    const attId = randomUUID();

    const resList = await request(app).get(`/api/notices/${noticeId}/attachments`);
    expect(resList.status).toBe(401);

    const resGet = await request(app).get(`/api/notices/${noticeId}/attachments/${attId}`);
    expect(resGet.status).toBe(401);
  });

  it('8. Viewing attachment does NOT contact Gmail API once stored', async () => {
    const noticeId = randomUUID();
    await pool.query(
      `INSERT INTO notices (id, created_by_user_id, title, summary, category, priority, status, source_type)
       VALUES ($1, 'student_1', 'Saved Notice', 'Summary', 'academic', 'normal', 'published', 'gmail_personal')`,
      [noticeId],
    );

    const pdfBuffer = Buffer.from('%PDF-1.4 stored');
    const pdfKey = generateStorageKey(noticeId, 'stored.pdf');
    await memoryStorage.put(pdfKey, pdfBuffer, 'application/pdf');

    const record = await attachmentsService.createAttachmentRecord({
      noticeId,
      userId: 'student_1',
      filename: 'stored.pdf',
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      storageKey: pdfKey,
      gmailMessageId: 'msg_123',
      gmailAttachmentId: 'att_456',
    });

    const res = await request(app)
      .get(`/api/notices/${noticeId}/attachments/${record.id}`)
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(200);
    // Gmail API must NOT be called at view time!
    expect(mockMessagesGet).not.toHaveBeenCalled();
    expect(mockAttachmentsGet).not.toHaveBeenCalled();
  });

  it('9. Gmail sync downloads supported PDF and stores binary in private storage', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_1', 'student1@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    const msgId = 'msg_with_pdf';
    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: msgId }] },
    });

    const pdfBase64 = Buffer.from('%PDF-1.4 official circular').toString('base64url');

    mockMessagesGet.mockResolvedValueOnce({
      data: {
        id: msgId,
        snippet: 'Fall 2026 Examination Schedule released for all branches',
        payload: {
          headers: [
            { name: 'From', value: 'Controller of Examinations <coe@vit.ac.in>' },
            { name: 'Subject', value: '[VIT] Fall 2026 Examination Schedule Announcement' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from('Please find the examination timetable attached.').toString('base64url') },
            },
            {
              filename: 'Exam_Schedule_2026.pdf',
              mimeType: 'application/pdf',
              body: {
                attachmentId: 'att_pdf_001',
                size: 1024,
              },
            },
          ],
        },
      },
    });

    mockAttachmentsGet.mockResolvedValueOnce({
      data: {
        data: pdfBase64,
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Fall 2026 Examination Schedule Announcement',
        summary: 'Examination timetable released',
        category: 'exam',
        priority: 'urgent',
        isCampusWide: true,
        isPersonal: false,
        source: {
          provider: 'gmail',
          messageId: msgId,
          sender: 'coe@vit.ac.in',
          subject: '[VIT] Fall 2026 Examination Schedule Announcement',
        },
      }),
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(200);
    expect(res.body.noticesCreated).toBe(1);

    // Verify attachment record was created
    const { rows: attRows } = await pool.query('SELECT * FROM notice_attachments WHERE user_id = $1', ['student_1']);
    expect(attRows).toHaveLength(1);
    expect(attRows[0].filename).toBe('Exam_Schedule_2026.pdf');
    expect(attRows[0].mime_type).toBe('application/pdf');

    // Verify binary was uploaded to private object storage driver
    const stored = await memoryStorage.get(attRows[0].storage_key);
    expect(stored).not.toBeNull();
    expect(stored?.data.toString('utf8')).toContain('%PDF-1.4 official circular');

    // Verify notice list API returns attachment metadata
    const noticesRes = await request(app)
      .get('/api/notices')
      .set('Authorization', 'Bearer student_1');

    expect(noticesRes.body[0].attachments).toHaveLength(1);
    expect(noticesRes.body[0].attachments[0].filename).toBe('Exam_Schedule_2026.pdf');
    expect(noticesRes.body[0].attachments[0].attachmentType).toBe('pdf');
  });

  it('10. Unsupported attachment types (.zip, .exe, .docx) are rejected and never stored', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_1', 'student1@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    const msgId = 'msg_with_unsupported';
    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: msgId }] },
    });

    mockMessagesGet.mockResolvedValueOnce({
      data: {
        id: msgId,
        snippet: 'Campus workshop resources and code files',
        payload: {
          headers: [
            { name: 'From', value: 'Workshop Coordinator <workshop@vit.ac.in>' },
            { name: 'Subject', value: '[VIT] Workshop Code Files & Resources' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from('Here are the workshop files.').toString('base64url') },
            },
            {
              filename: 'materials.zip',
              mimeType: 'application/zip',
              body: { attachmentId: 'att_zip_001', size: 5000 },
            },
            {
              filename: 'installer.exe',
              mimeType: 'application/x-msdownload',
              body: { attachmentId: 'att_exe_001', size: 10000 },
            },
            {
              filename: 'handout.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              body: { attachmentId: 'att_docx_001', size: 2000 },
            },
          ],
        },
      },
    });

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Workshop Code Files & Resources',
        summary: 'Workshop files',
        category: 'event',
        priority: 'normal',
        isCampusWide: true,
        isPersonal: false,
        source: {
          provider: 'gmail',
          messageId: msgId,
          sender: 'workshop@vit.ac.in',
          subject: '[VIT] Workshop Code Files & Resources',
        },
      }),
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(200);
    expect(res.body.noticesCreated).toBe(1);

    // Zero attachments stored!
    const { rows: attRows } = await pool.query('SELECT * FROM notice_attachments');
    expect(attRows).toHaveLength(0);
    expect(mockAttachmentsGet).not.toHaveBeenCalled();
  });

  it('11. Attachments from personal/rejected emails are never downloaded or stored', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_1', 'student1@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    const msgId = 'msg_personal_chat';
    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: msgId }] },
    });

    mockMessagesGet.mockResolvedValueOnce({
      data: {
        id: msgId,
        snippet: 'Hey are you free to meet near SJT?',
        payload: {
          headers: [
            { name: 'From', value: '26@vitstudent.ac.in' },
            { name: 'Subject', value: 'where are you?' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from('meet near food court').toString('base64url') },
            },
            {
              filename: 'selfie.jpg',
              mimeType: 'image/jpeg',
              body: { attachmentId: 'att_jpg_001', size: 2048 },
            },
          ],
        },
      },
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(200);
    expect(res.body.noticesCreated).toBe(0);

    // Zero attachments stored and zero calls to fetch attachment from Gmail
    const { rows: attRows } = await pool.query('SELECT * FROM notice_attachments');
    expect(attRows).toHaveLength(0);
    expect(mockAttachmentsGet).not.toHaveBeenCalled();
  });

  it('12. Attachment download failure does NOT abort notice creation', async () => {
    await pool.query(
      `INSERT INTO gmail_connections (id, user_id, google_email, access_token, refresh_token, expiry_date)
       VALUES ($1, 'student_1', 'student1@vitstudent.ac.in', 'token_1', 'refresh_1', 1700000000)`,
      [randomUUID()],
    );

    const msgId = 'msg_failing_att';
    mockList.mockResolvedValueOnce({
      data: { messages: [{ id: msgId }] },
    });

    mockMessagesGet.mockResolvedValueOnce({
      data: {
        id: msgId,
        snippet: 'Important Circular with broken attachment link',
        payload: {
          headers: [
            { name: 'From', value: 'Dean Office <dean@vit.ac.in>' },
            { name: 'Subject', value: '[VIT] Dean Circular on Attendance Requirements' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from('Attendance must be maintained.').toString('base64url') },
            },
            {
              filename: 'Circular_Signed.pdf',
              mimeType: 'application/pdf',
              body: { attachmentId: 'broken_att_id', size: 1024 },
            },
          ],
        },
      },
    });

    // Gmail API throws 500 when fetching attachment
    mockAttachmentsGet.mockRejectedValueOnce(new Error('Gmail attachment fetch timeout'));

    setNoticeAnalyzer({
      analyze: async () => ({
        title: 'Dean Circular on Attendance Requirements',
        summary: 'Attendance rules circular',
        category: 'academic',
        priority: 'important',
        isCampusWide: true,
        isPersonal: false,
        source: {
          provider: 'gmail',
          messageId: msgId,
          sender: 'dean@vit.ac.in',
          subject: '[VIT] Dean Circular on Attendance Requirements',
        },
      }),
    });

    const res = await request(app)
      .post('/api/gmail/sync')
      .set('Authorization', 'Bearer student_1');

    expect(res.status).toBe(200);
    // Notice must still be created successfully!
    expect(res.body.noticesCreated).toBe(1);

    const { rows: noticeRows } = await pool.query('SELECT * FROM notices WHERE source_message_id = $1', [msgId]);
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0].title).toBe('Dean Circular on Attendance Requirements');
  });
});
