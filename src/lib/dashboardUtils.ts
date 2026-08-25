import type { Assignment, Course, CampusItem } from './types';
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

export type PriorityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type PriorityItem = {
  id: string;
  type: 'ASSIGNMENT' | 'ATTENDANCE' | 'REGISTRATION' | 'EVENT';
  priority: PriorityLevel;
  title: string;
  subtitle: string;
  dateStr?: string;
  percentage?: number;
  navPath: string;
  daysDiff?: number;
};

// Dummy import to ensure it works, we will pass daysUntil in or import it
import { daysUntil, isOverdue } from './dateUtils';

export function getPriorityItems(
  courses: Course[],
  assignments: Assignment[],
  feedItems: CampusItem[]
): PriorityItem[] {
  const items: PriorityItem[] = [];

  // Attendance
  courses.forEach((course) => {
    const percentage = calculateAttendancePercentage(course.attendedClasses, course.totalClasses);
    if (percentage < course.attendanceThreshold) {
      items.push({
        id: `att-${course.id}`,
        type: 'ATTENDANCE',
        priority: 'HIGH',
        title: `${course.code} Attendance Alert`,
        subtitle: `Currently at ${percentage}%, requires ${course.attendanceThreshold}%`,
        percentage,
        navPath: '/courses',
      });
    }
  });

  // Assignments
  assignments.filter(a => a.status !== 'COMPLETED').forEach((assignment) => {
    const course = courses.find(c => c.id === assignment.courseId);
    const subtitle = course ? course.title : 'Unknown Course';

    if (isOverdue(assignment.dueDate, assignment.status)) {
      items.push({
        id: `asn-${assignment.id}`,
        type: 'ASSIGNMENT',
        priority: 'HIGH',
        title: assignment.title,
        subtitle: `Overdue: ${subtitle}`,
        dateStr: assignment.dueDate,
        navPath: '/assignments',
      });
    } else {
      const days = daysUntil(assignment.dueDate);
      if (days <= 3 && days >= 0) {
        items.push({
          id: `asn-${assignment.id}`,
          type: 'ASSIGNMENT',
          priority: 'MEDIUM',
          title: assignment.title,
          subtitle: `Due in ${days} day${days === 1 ? '' : 's'}: ${subtitle}`,
          dateStr: assignment.dueDate,
          daysDiff: days,
          navPath: '/assignments',
        });
      }
    }
  });

  // Feed Items
  feedItems.forEach((item) => {
    if (item.registrationDeadline) {
      const days = daysUntil(item.registrationDeadline);
      if (days <= 2 && days >= 0) {
        items.push({
          id: `reg-${item.id}`,
          type: 'REGISTRATION',
          priority: 'HIGH',
          title: item.title || 'Registration Deadline',
          subtitle: `Registration closes in ${days} day${days === 1 ? '' : 's'}`,
          dateStr: item.registrationDeadline,
          daysDiff: days,
          navPath: `/campus-feed/${item.id}`,
        });
      } else if (days <= 7 && days >= 0) {
        items.push({
          id: `reg-${item.id}`,
          type: 'REGISTRATION',
          priority: 'MEDIUM',
          title: item.title || 'Registration Deadline',
          subtitle: `Registration closes in ${days} day${days === 1 ? '' : 's'}`,
          dateStr: item.registrationDeadline,
          daysDiff: days,
          navPath: `/campus-feed/${item.id}`,
        });
      }
    }

    if (item.date) {
      const days = daysUntil(item.date);
      if (days <= 3 && days >= 0) {
        // Prevent duplicate if we already warned about registration
        if (!items.find(i => i.id === `reg-${item.id}`)) {
          items.push({
            id: `evt-${item.id}`,
            type: 'EVENT',
            priority: 'MEDIUM',
            title: item.title || 'Upcoming Event',
            subtitle: `Starts in ${days} day${days === 1 ? '' : 's'}`,
            dateStr: item.date,
            daysDiff: days,
            navPath: `/campus-feed/${item.id}`,
          });
        }
      }
    }
  });

  // Sort: HIGH first, then MEDIUM. Within same priority, lowest daysDiff first (or percentage lowest first).
  const priorityScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  items.sort((a, b) => {
    if (priorityScore[a.priority] !== priorityScore[b.priority]) {
      return priorityScore[b.priority] - priorityScore[a.priority];
    }

    // Both same priority
    const valA = a.type === 'ATTENDANCE' ? a.percentage ?? 0 : a.daysDiff ?? 0;
    const valB = b.type === 'ATTENDANCE' ? b.percentage ?? 0 : b.daysDiff ?? 0;

    return valA - valB;
  });

  return items;
}

export type TimelineItem = {
  id: string;
  title: string;
  subtitle: string;
  dateStr: string;
  type: 'ASSIGNMENT' | 'EVENT' | 'REGISTRATION';
  navPath: string;
};

export function getUpcomingTimeline(
  courses: Course[],
  assignments: Assignment[],
  feedItems: CampusItem[]
): TimelineItem[] {
  const items: TimelineItem[] = [];

  assignments.filter(a => a.status !== 'COMPLETED' && !isOverdue(a.dueDate, a.status)).forEach(a => {
    const course = courses.find(c => c.id === a.courseId);
    items.push({
      id: `tl-asn-${a.id}`,
      title: a.title,
      subtitle: course?.title || 'Assignment',
      dateStr: a.dueDate,
      type: 'ASSIGNMENT',
      navPath: '/assignments'
    });
  });

  feedItems.forEach(f => {
    if (f.registrationDeadline && daysUntil(f.registrationDeadline) >= 0) {
      items.push({
        id: `tl-reg-${f.id}`,
        title: f.title || 'Registration',
        subtitle: 'Deadline',
        dateStr: f.registrationDeadline,
        type: 'REGISTRATION',
        navPath: `/campus-feed/${f.id}`
      });
    }
    if (f.date && daysUntil(f.date) >= 0 && (!f.registrationDeadline || f.date !== f.registrationDeadline)) {
      items.push({
        id: `tl-evt-${f.id}`,
        title: f.title || 'Event',
        subtitle: f.type || 'Event',
        dateStr: f.date,
        type: 'EVENT',
        navPath: `/campus-feed/${f.id}`
      });
    }
  });

  items.sort((a, b) => new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime());
  return items.slice(0, 5); // Return next 5 upcoming items
}
