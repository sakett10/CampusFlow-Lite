import { describe, it, expect } from 'vitest';
import { getAssignmentStats, getUpcomingAssignments, getAttendanceWarnings } from './dashboardUtils';
import type { Assignment, Course } from './types';

describe('dashboardUtils', () => {
  it('calculates assignment stats correctly', () => {
    const assignments: Assignment[] = [
      { id: '1', courseId: 'c1', title: 'A1', description: '', dueDate: '2026-08-20', status: 'PENDING' },
      { id: '2', courseId: 'c1', title: 'A2', description: '', dueDate: '2026-08-20', status: 'IN_PROGRESS' },
      { id: '3', courseId: 'c1', title: 'A3', description: '', dueDate: '2026-08-20', status: 'COMPLETED' },
      { id: '4', courseId: 'c1', title: 'A4', description: '', dueDate: '2026-08-20', status: 'PENDING' },
    ];

    const stats = getAssignmentStats(assignments);
    expect(stats.total).toBe(4);
    expect(stats.pending).toBe(2);
    expect(stats.inProgress).toBe(1);
    expect(stats.completed).toBe(1);
  });

  it('handles empty assignment stats', () => {
    const stats = getAssignmentStats([]);
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
  });

  it('gets upcoming assignments correctly', () => {
    const assignments: Assignment[] = [
      { id: '1', courseId: 'c1', title: 'A1', description: '', dueDate: '2026-10-10', status: 'PENDING' },
      { id: '2', courseId: 'c1', title: 'A2', description: '', dueDate: '2026-09-10', status: 'IN_PROGRESS' }, // Should be first
      { id: '3', courseId: 'c1', title: 'A3', description: '', dueDate: '2026-08-10', status: 'COMPLETED' }, // Excluded
      { id: '4', courseId: 'c1', title: 'A4', description: '', dueDate: '2026-11-10', status: 'PENDING' },
      { id: '5', courseId: 'c1', title: 'A5', description: '', dueDate: '2026-12-10', status: 'PENDING' }, // Excluded (4th)
    ];

    const upcoming = getUpcomingAssignments(assignments);
    expect(upcoming.length).toBe(3);
    expect(upcoming[0].id).toBe('2'); // Earliest incomplete
    expect(upcoming[1].id).toBe('1');
    expect(upcoming[2].id).toBe('4');
  });

  it('gets attendance warnings correctly', () => {
    const courses: Course[] = [
      { id: '1', code: 'C1', title: 'C1', instructor: '', credits: 3, attendedClasses: 5, totalClasses: 10, attendanceThreshold: 75 }, // Warning (50%)
      { id: '2', code: 'C2', title: 'C2', instructor: '', credits: 3, attendedClasses: 8, totalClasses: 10, attendanceThreshold: 75 }, // OK (80%)
      { id: '3', code: 'C3', title: 'C3', instructor: '', credits: 3, attendedClasses: 10, totalClasses: 10, attendanceThreshold: 100 }, // OK (100%)
      { id: '4', code: 'C4', title: 'C4', instructor: '', credits: 3, attendedClasses: 0, totalClasses: 0, attendanceThreshold: 75 }, // OK (100% implicitly)
      { id: '5', code: 'C5', title: 'C5', instructor: '', credits: 3, attendedClasses: 9, totalClasses: 10, attendanceThreshold: 100 }, // Warning (90%)
    ];

    const warnings = getAttendanceWarnings(courses);
    expect(warnings.length).toBe(2);
    expect(warnings[0].id).toBe('1');
    expect(warnings[1].id).toBe('5');
  });
});
