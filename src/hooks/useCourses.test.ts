import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCourses } from './useCourses';

globalThis.fetch = vi.fn();

describe('useCourses hook', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default GET mock
    (globalThis.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => []
    });
  });

  it('initializes with empty array', async () => {
    const { result } = renderHook(() => useCourses());

    // Should be loading initially
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.courses).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/courses');
  });

  it('adds and reads a course', async () => {
    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const mockCourse = {
      id: '123',
      code: 'CS101',
      title: 'Intro to CS',
      instructor: 'Dr. Smith',
      credits: 3,
      attendedClasses: 0,
      totalClasses: 0,
      attendanceThreshold: 75
    };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCourse
    });

    await act(async () => {
      await result.current.addCourse({
        code: 'CS101',
        title: 'Intro to CS',
        instructor: 'Dr. Smith',
        credits: 3,
        attendedClasses: 0,
        totalClasses: 0,
        attendanceThreshold: 75
      });
    });

    expect(result.current.courses.length).toBe(1);
    expect(result.current.courses[0]).toEqual(mockCourse);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/courses', expect.objectContaining({
      method: 'POST'
    }));
  });

  it('updates a course', async () => {
    const mockCourse = {
      id: '123', code: 'CS101', title: 'Intro', instructor: 'Dr. Smith',
      credits: 3, attendedClasses: 0, totalClasses: 0, attendanceThreshold: 75
    };

    // First load returns the course
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockCourse]
    });

    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.courses.length).toBe(1);

    const updatedCourse = { ...mockCourse, title: 'Advanced CS' };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => updatedCourse
    });

    await act(async () => {
      await result.current.updateCourse('123', { title: 'Advanced CS' });
    });

    expect(result.current.courses[0].title).toBe('Advanced CS');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/courses/123', expect.objectContaining({
      method: 'PUT'
    }));
  });

  it('deletes a course', async () => {
    const mockCourse = {
      id: '123', code: 'CS101', title: 'Intro', instructor: 'Dr. Smith',
      credits: 3, attendedClasses: 0, totalClasses: 0, attendanceThreshold: 75
    };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockCourse]
    });

    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true
    });

    await act(async () => {
      await result.current.deleteCourse('123');
    });

    expect(result.current.courses.length).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/courses/123', expect.objectContaining({
      method: 'DELETE'
    }));
  });

  it('records attendance correctly', async () => {
    const mockCourse = {
      id: '123', code: 'CS101', title: 'Intro', instructor: 'Dr. Smith',
      credits: 3, attendedClasses: 5, totalClasses: 10, attendanceThreshold: 75
    };

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockCourse]
    });

    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // True attendance
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...mockCourse, attendedClasses: 6, totalClasses: 11 })
    });

    await act(async () => {
      await result.current.recordAttendance('123', true);
    });

    expect(result.current.courses[0].attendedClasses).toBe(6);
    expect(result.current.courses[0].totalClasses).toBe(11);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/courses/123/attendance', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ attendedClasses: 6, totalClasses: 11 })
    }));

    // False attendance
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...mockCourse, attendedClasses: 6, totalClasses: 12 })
    });

    await act(async () => {
      await result.current.recordAttendance('123', false);
    });

    expect(result.current.courses[0].attendedClasses).toBe(6);
    expect(result.current.courses[0].totalClasses).toBe(12);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/courses/123/attendance', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ attendedClasses: 6, totalClasses: 12 })
    }));
  });
});
