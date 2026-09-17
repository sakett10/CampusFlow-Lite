import { pool } from '../db.js';
import { randomUUID } from 'node:crypto';
import type {
  NoticeAttachmentMetadata,
  NoticeAttachmentRecord,
  SupportedAttachmentMimeType,
} from '../types.js';
import {
  getObjectStorageDriver,
  deriveAttachmentType,
  normalizeAttachmentMimeType,
} from './objectStorage.service.js';

interface RawAttachmentRow {
  id: string;
  notice_id: string;
  user_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
  gmail_message_id: string | null;
  gmail_attachment_id: string | null;
  created_at: string | Date;
}

function mapRowToRecord(row: RawAttachmentRow): NoticeAttachmentRecord {
  const normalizedMime = (normalizeAttachmentMimeType(row.mime_type) || 'application/pdf') as SupportedAttachmentMimeType;
  return {
    id: row.id,
    noticeId: row.notice_id,
    userId: row.user_id,
    filename: row.filename,
    mimeType: normalizedMime,
    sizeBytes: Number(row.size_bytes) || 0,
    attachmentType: deriveAttachmentType(normalizedMime),
    storageKey: row.storage_key,
    gmailMessageId: row.gmail_message_id,
    gmailAttachmentId: row.gmail_attachment_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}

function mapRecordToMetadata(record: NoticeAttachmentRecord): NoticeAttachmentMetadata {
  return {
    id: record.id,
    noticeId: record.noticeId,
    filename: record.filename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    attachmentType: record.attachmentType,
    createdAt: record.createdAt,
  };
}

export const attachmentsService = {
  /**
   * Get public-safe metadata list for all attachments of a notice.
   * Never leaks storage keys or internal tokens.
   */
  getAttachmentsForNotice: async (noticeId: string): Promise<NoticeAttachmentMetadata[]> => {
    const { rows } = await pool.query<RawAttachmentRow>(
      `
      SELECT id, notice_id, user_id, filename, mime_type, size_bytes, storage_key,
             gmail_message_id, gmail_attachment_id, created_at
      FROM notice_attachments
      WHERE notice_id = $1
      ORDER BY created_at ASC
      `,
      [noticeId],
    );

    return rows.map(mapRowToRecord).map(mapRecordToMetadata);
  },

  /**
   * Internal record lookup by attachment ID and notice ID.
   */
  getAttachmentById: async (
    attachmentId: string,
    noticeId: string,
  ): Promise<NoticeAttachmentRecord | null> => {
    const { rows } = await pool.query<RawAttachmentRow>(
      `
      SELECT id, notice_id, user_id, filename, mime_type, size_bytes, storage_key,
             gmail_message_id, gmail_attachment_id, created_at
      FROM notice_attachments
      WHERE id = $1 AND notice_id = $2
      `,
      [attachmentId, noticeId],
    );

    if (rows.length === 0) return null;
    return mapRowToRecord(rows[0]);
  },

  /**
   * Persist a new attachment record in PostgreSQL.
   */
  createAttachmentRecord: async (params: {
    noticeId: string;
    userId: string;
    filename: string;
    mimeType: SupportedAttachmentMimeType;
    sizeBytes: number;
    storageKey: string;
    gmailMessageId?: string | null;
    gmailAttachmentId?: string | null;
  }): Promise<NoticeAttachmentRecord> => {
    const id = randomUUID();
    const { rows } = await pool.query<RawAttachmentRow>(
      `
      INSERT INTO notice_attachments (
        id, notice_id, user_id, filename, mime_type, size_bytes, storage_key,
        gmail_message_id, gmail_attachment_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        id,
        params.noticeId,
        params.userId,
        params.filename,
        params.mimeType,
        params.sizeBytes,
        params.storageKey,
        params.gmailMessageId || null,
        params.gmailAttachmentId || null,
      ],
    );

    return mapRowToRecord(rows[0]);
  },

  /**
   * Retrieve attachment binary strictly from CampusFlow's private object storage.
   * Does NOT contact Gmail at view time.
   */
  getAttachmentBinary: async (
    storageKey: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> => {
    const driver = getObjectStorageDriver();
    return driver.get(storageKey);
  },

  /**
   * Delete an attachment from both object storage and PostgreSQL.
   */
  deleteAttachment: async (attachmentId: string, noticeId: string): Promise<boolean> => {
    const existing = await attachmentsService.getAttachmentById(attachmentId, noticeId);
    if (!existing) return false;

    const driver = getObjectStorageDriver();
    try {
      await driver.delete(existing.storageKey);
    } catch (err) {
      console.warn('Failed to delete object from storage:', err);
    }

    await pool.query('DELETE FROM notice_attachments WHERE id = $1', [attachmentId]);
    return true;
  },
};
