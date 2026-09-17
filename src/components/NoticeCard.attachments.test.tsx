import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NoticeCard from './NoticeCard';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import type { Notice } from '../lib/types';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(),
}));

const baseNotice: Notice = {
  id: 'notice-123',
  createdByUserId: 'user_123',
  title: 'Important Circular',
  summary: 'Here is the circular body.',
  category: 'academic',
  priority: 'important',
  status: 'published',
  sourceProvider: 'gmail',
  sourceType: 'institutional',
  createdAt: '2026-09-15T10:00:00Z',
  updatedAt: '2026-09-15T10:00:00Z',
};

describe('NoticeCard Attachments', () => {
  const mockGetToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({
      getToken: mockGetToken.mockResolvedValue('test-clerk-token'),
      userId: 'user_123',
      isLoaded: true,
    });
    // Mock window.URL.createObjectURL and revokeObjectURL
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-blob-url');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render attachments section when notice has no attachments', () => {
    render(
      <MemoryRouter>
        <NoticeCard notice={baseNotice} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('notice-attachments-section')).toBeNull();
  });

  it('does not render attachments section when attachments array is empty', () => {
    render(
      <MemoryRouter>
        <NoticeCard notice={{ ...baseNotice, attachments: [] }} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('notice-attachments-section')).toBeNull();
  });

  it('renders attachments list with PDF and Image metadata', () => {
    const noticeWithAttachments: Notice = {
      ...baseNotice,
      attachments: [
        {
          id: 'att-1',
          noticeId: 'notice-123',
          filename: 'timetable.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1048576, // 1.0 MB
          attachmentType: 'pdf',
          createdAt: '2026-09-15T10:00:00Z',
        },
        {
          id: 'att-2',
          noticeId: 'notice-123',
          filename: 'poster.png',
          mimeType: 'image/png',
          sizeBytes: 512000, // 500.0 KB
          attachmentType: 'image',
          createdAt: '2026-09-15T10:00:00Z',
        },
      ],
    };

    render(
      <MemoryRouter>
        <NoticeCard notice={noticeWithAttachments} />
      </MemoryRouter>
    );

    const section = screen.getByTestId('notice-attachments-section');
    expect(section).toBeDefined();
    expect(screen.getByText('Attachments (2)')).toBeDefined();

    expect(screen.getByText('timetable.pdf')).toBeDefined();
    expect(screen.getByText('(1.0 MB)')).toBeDefined();
    expect(screen.getByRole('button', { name: /Open PDF/i })).toBeDefined();

    expect(screen.getByText('poster.png')).toBeDefined();
    expect(screen.getByText('(500.0 KB)')).toBeDefined();
    expect(screen.getByRole('button', { name: /Preview/i })).toBeDefined();
  });

  it('handles Open PDF action by fetching with auth token and opening new tab', async () => {
    const mockPopup = { location: { href: '' }, close: vi.fn() } as unknown as Window;
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(mockPopup);
    const mockBlob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const noticeWithPdf: Notice = {
      ...baseNotice,
      attachments: [
        {
          id: 'att-pdf-1',
          noticeId: 'notice-123',
          filename: 'exam_schedule.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 204800,
          attachmentType: 'pdf',
          createdAt: '2026-09-15T10:00:00Z',
        },
      ],
    };

    render(
      <MemoryRouter>
        <NoticeCard notice={noticeWithPdf} />
      </MemoryRouter>
    );

    const openPdfBtn = screen.getByRole('button', { name: /Open PDF/i });
    fireEvent.click(openPdfBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/notices/notice-123/attachments/att-pdf-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-clerk-token',
          }),
        })
      );
      expect(windowOpenSpy).toHaveBeenCalledWith('about:blank', '_blank');
      expect(mockPopup.location.href).toBe('blob:http://localhost/fake-blob-url');
    });
  });

  it('handles Preview Image action by opening image lightbox modal and allows closing', async () => {
    const mockBlob = new Blob(['image data'], { type: 'image/png' });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const noticeWithImage: Notice = {
      ...baseNotice,
      attachments: [
        {
          id: 'att-img-1',
          noticeId: 'notice-123',
          filename: 'campus_map.png',
          mimeType: 'image/png',
          sizeBytes: 102400,
          attachmentType: 'image',
          createdAt: '2026-09-15T10:00:00Z',
        },
      ],
    };

    render(
      <MemoryRouter>
        <NoticeCard notice={noticeWithImage} />
      </MemoryRouter>
    );

    const previewBtn = screen.getByRole('button', { name: /Preview/i });
    fireEvent.click(previewBtn);

    // Modal should be displayed
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Image preview/i })).toBeDefined();
      expect(screen.getByAltText('campus_map.png')).toBeDefined();
    });

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /Close image preview/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Image preview/i })).toBeNull();
    });
  });

  it('displays an error message when attachment download fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Attachment not found' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const noticeWithPdf: Notice = {
      ...baseNotice,
      attachments: [
        {
          id: 'att-err-1',
          noticeId: 'notice-123',
          filename: 'missing.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          attachmentType: 'pdf',
          createdAt: '2026-09-15T10:00:00Z',
        },
      ],
    };

    render(
      <MemoryRouter>
        <NoticeCard notice={noticeWithPdf} />
      </MemoryRouter>
    );

    const openPdfBtn = screen.getByRole('button', { name: /Open PDF/i });
    fireEvent.click(openPdfBtn);

    await waitFor(() => {
      expect(screen.getByText(/Unable to open attachment/i)).toBeDefined();
    });
  });
});
