import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCourses } from './useCourses';

describe('useCourses hook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with empty array', () => {
    const { result } = renderHook(() => useCourses());
    expect(result.current.courses).toEqual([]);
  });

  it('adds and reads a course', () => {
    const { result } = renderHook(() => useCourses());
    
    act(() => {
      result.current.addCourse({
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
    expect(result.current.courses[0].code).toBe('CS101');
    expect(result.current.courses[0].id).toBeDefined();
  });

  it('updates a course', () => {
    const { result } = renderHook(() => useCourses());
    
    act(() => {
      result.current.addCourse({
        code: 'CS101', title: 'Intro', instructor: 'Dr. Smith',
        credits: 3, attendedClasses: 0, totalClasses: 0, attendanceThreshold: 75
      });
    });

    const id = result.current.courses[0].id;

    act(() => {
      result.current.updateCourse(id, { title: 'Advanced CS' });
    });

    expect(result.current.courses[0].title).toBe('Advanced CS');
  });

  it('deletes a course', () => {
    const { result } = renderHook(() => useCourses());
    
    act(() => {
      result.current.addCourse({
        code: 'CS101', title: 'Intro', instructor: 'Dr. Smith',
        credits: 3, attendedClasses: 0, totalClasses: 0, attendanceThreshold: 75
      });
    });

    const id = result.current.courses[0].id;

    act(() => {
      result.current.deleteCourse(id);
    });

    expect(result.current.courses.length).toBe(0);
  });

  it('records attendance correctly', () => {
    const { result } = renderHook(() => useCourses());
    
    act(() => {
      result.current.addCourse({
        code: 'CS101', title: 'Intro', instructor: 'Dr. Smith',
        credits: 3, attendedClasses: 5, totalClasses: 10, attendanceThreshold: 75
      });
    });

    const id = result.current.courses[0].id;

    act(() => {
      result.current.recordAttendance(id, true);
    });

    expect(result.current.courses[0].attendedClasses).toBe(6);
    expect(result.current.courses[0].totalClasses).toBe(11);

    act(() => {
      result.current.recordAttendance(id, false);
    });

    expect(result.current.courses[0].attendedClasses).toBe(6);
    expect(result.current.courses[0].totalClasses).toBe(12);
  });
});
