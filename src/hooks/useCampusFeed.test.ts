import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCampusFeed } from './useCampusFeed';
import { campusApi } from '../api/campusApi';

const mockGetToken = vi.fn();
const mockUser = {
  id: 'reviewer_user_1',
  publicMetadata: { role: 'reviewer' },
};

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
  useUser: () => ({
    user: mockUser,
  }),
}));


describe('useCampusFeed Hook and Delete Routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetToken.mockResolvedValue('mock_token_123');
  });


  it('routes notice deletions to /api/notices/:id and personal deletions to /api/campus-items/:id', async () => {
    const mockItems = [
      {
        id: 'cff9d47b-c0f8-4c16-8d94-20209c8d5918',
        title: 'National Sports Day 2026 - Yoga Competition',
        type: 'EVENT' as const,
        description: 'Yoga event in Anna Audi',
        date: '2026-08-31',
        startTime: '13:00',
        endTime: '15:00',
        registrationDeadline: null,
        venue: 'Anna Audi',
        eligibility: 'All Students',
        organizer: 'Sports Dept',
        importantActions: [],
        sourceText: 'Yoga event details',
        sourceType: 'notice' as const,
      },
      {
        id: 'pers_item_456',
        title: 'Study Session with Peers',
        type: 'EVENT' as const,
        description: 'Group study at library',
        date: '2026-09-01',
        startTime: '14:00',
        endTime: '16:00',
        registrationDeadline: null,
        venue: 'Central Library',
        eligibility: null,
        organizer: 'Self',
        importantActions: [],
        sourceText: 'Study notes',
        sourceType: 'personal' as const,
      },
    ];

    vi.spyOn(campusApi, 'getAll').mockResolvedValue(mockItems);
    const deleteSpy = vi.spyOn(campusApi, 'delete').mockResolvedValue(undefined);

    const { result } = renderHook(() => useCampusFeed());

    // Wait for items to load
    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
    });

    // 1. Delete the Notice item
    await act(async () => {
      await result.current.deleteItem('cff9d47b-c0f8-4c16-8d94-20209c8d5918');
    });

    expect(deleteSpy).toHaveBeenCalledWith(
      'mock_token_123',
      'cff9d47b-c0f8-4c16-8d94-20209c8d5918',
      'notice',
      'reviewer',
    );

    // Notice item is removed from hook state
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe('pers_item_456');

    // 2. Delete the Personal item
    await act(async () => {
      await result.current.deleteItem('pers_item_456');
    });

    expect(deleteSpy).toHaveBeenCalledWith(
      'mock_token_123',
      'pers_item_456',
      'personal',
      'reviewer',
    );

    // Personal item is removed from hook state
    expect(result.current.items).toHaveLength(0);
  });

  it('campusApi.delete issues DELETE to /api/notices/:id for notices and /api/campus-items/:id for personal items', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Delete notice
    await campusApi.delete('tok_1', 'notice_uuid_1', 'notice', 'reviewer');
    expect(fetchMock).toHaveBeenCalledWith('/api/notices/notice_uuid_1', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer tok_1',
        'x-user-role': 'reviewer',
      },
    });

    // Delete personal item
    await campusApi.delete('tok_1', 'personal_uuid_2', 'personal');
    expect(fetchMock).toHaveBeenCalledWith('/api/campus-items/personal_uuid_2', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer tok_1',
      },
    });
  });
});

