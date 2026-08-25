import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAssignments } from './useAssignments';

const mockGetToken = vi.fn();

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({
    getToken: mockGetToken
  })
}));

globalThis.fetch = vi.fn();

describe('useAssignments hook', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetToken.mockResolvedValue('fake-token');

    // Default GET mock
    (globalThis.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => []
    });
  });

  it('initializes with empty array and loading state', async () => {
    const { result } = renderHook(() => useAssignments());

    // Should be loading initially
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.assignments).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/assignments', expect.objectContaining({
      headers: { Authorization: 'Bearer fake-token' }
    }));
  });

  it('sets error if getToken returns null', async () => {
    mockGetToken.mockResolvedValue(null);
    const { result } = renderHook(() => useAssignments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Authentication required');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('adds and reads an assignment', async () => {
    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const mockAssignment = {
      id: '123',
      courseId: 'c1',
      title: 'Math Homework',
      description: 'Page 42',
      dueDate: '2026-10-10',
      status: 'PENDING'
    };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAssignment
    });

    await act(async () => {
      await result.current.addAssignment({
        courseId: 'c1',
        title: 'Math Homework',
        description: 'Page 42',
        dueDate: '2026-10-10',
        status: 'PENDING'
      });
    });

    expect(result.current.assignments.length).toBe(1);
    expect(result.current.assignments[0]).toEqual(mockAssignment);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/assignments', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'Bearer fake-token'
      })
    }));
  });

  it('updates an assignment', async () => {
    const mockAssignment = {
      id: '123',
      courseId: 'c1',
      title: 'Math Homework',
      description: 'Page 42',
      dueDate: '2026-10-10',
      status: 'PENDING'
    };

    // First load returns the assignment
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockAssignment]
    });

    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.assignments.length).toBe(1);

    const updatedAssignment = { ...mockAssignment, title: 'Math Homework Final' };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => updatedAssignment
    });

    await act(async () => {
      await result.current.updateAssignment('123', { title: 'Math Homework Final' });
    });

    expect(result.current.assignments[0].title).toBe('Math Homework Final');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/assignments/123', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        'Authorization': 'Bearer fake-token'
      })
    }));
  });

  it('updates an assignment status', async () => {
    const mockAssignment = {
      id: '123',
      courseId: 'c1',
      title: 'A1',
      description: '',
      dueDate: '2026-10-10',
      status: 'PENDING'
    };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockAssignment]
    });

    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const updatedAssignment = { ...mockAssignment, status: 'COMPLETED' };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => updatedAssignment
    });

    await act(async () => {
      await result.current.updateStatus('123', 'COMPLETED');
    });

    expect(result.current.assignments[0].status).toBe('COMPLETED');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/assignments/123/status', expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({
        'Authorization': 'Bearer fake-token'
      }),
      body: JSON.stringify({ status: 'COMPLETED' })
    }));
  });

  it('deletes an assignment', async () => {
    const mockAssignment = {
      id: '123', courseId: 'c1', title: 'A1', description: '', dueDate: '2026-10-10', status: 'PENDING'
    };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockAssignment]
    });

    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true
    });

    await act(async () => {
      await result.current.deleteAssignment('123');
    });

    expect(result.current.assignments.length).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/assignments/123', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({
        'Authorization': 'Bearer fake-token'
      })
    }));
  });

  it('handles API errors gracefully', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    const { result } = renderHook(() => useAssignments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load assignments (500)');
    expect(result.current.assignments).toEqual([]);
  });
});
