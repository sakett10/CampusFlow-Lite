import type { Assignment, Course } from './types';
import { calculateAttendancePercentage } from './attendance';

export type AssignmentStats = {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
};

export function getAssignmentStats(assignments: Assignment[]): AssignmentStats {
  return assignments.reduce(
    (acc, curr) => {
      acc.total++;
      if (curr.status === 'PENDING') acc.pending++;
      else if (curr.status === 'IN_PROGRESS') acc.inProgress++;
      else if (curr.status === 'COMPLETED') acc.completed++;
      return acc;
    },
    { total: 0, pending: 0, inProgress: 0, completed: 0 }
  );
}

export function getUpcomingAssignments(assignments: Assignment[]): Assignment[] {
  const incomplete = assignments.filter(a => a.status !== 'COMPLETED');
  
  incomplete.sort((a, b) => {
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
  
  return incomplete.slice(0, 3);
}

export function getAttendanceWarnings(courses: Course[]): Course[] {
  return courses.filter(course => {
    const percentage = calculateAttendancePercentage(course.attendedClasses, course.totalClasses);
    return percentage < course.attendanceThreshold;
  });
}

export function getAttendanceStats(courses: Course[]) {
  const warnings = getAttendanceWarnings(courses);
  return {
    total: courses.length,
    belowThreshold: warnings.length,
    ok: courses.length - warnings.length,
  };
}
