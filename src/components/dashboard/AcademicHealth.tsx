import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle, ChevronRight } from 'lucide-react';
import { Card } from '../ui/Card';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import type { Course } from '../../lib/types';
import type { AssignmentStats } from '../../lib/dashboardUtils';

export default function AcademicHealth({
  courses,
  assignmentStats,
  attendanceWarningsCount
}: {
  courses: Course[];
  assignmentStats: AssignmentStats;
  attendanceWarningsCount: number;
}) {
  let totalAttended = 0;
  let totalClasses = 0;
  courses.forEach(c => {
    totalAttended += c.attendedClasses;
    totalClasses += c.totalClasses;
  });
  
  const hasAttendanceData = totalClasses > 0;
  const overallAttendance = hasAttendanceData ? Math.round((totalAttended / totalClasses) * 100) : 0;
  
  const hasAssignmentData = assignmentStats.total > 0;
  const assignmentProgress = hasAssignmentData
    ? Math.round((assignmentStats.completed / assignmentStats.total) * 100)
    : 0;

  return (
    <Card padding="lg" className="flex flex-col h-full group transition-all duration-[var(--cf-transition-normal)] hover:shadow-[var(--cf-elev-2)] hover:border-[var(--cf-border-strong)]">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-sans-display text-[length:var(--cf-text-subtitle-size)] font-[number:var(--cf-text-subtitle-weight)] text-[var(--cf-text)]">
          Academic Health
        </h2>
        <Link to="/courses" className="flex items-center gap-1 text-[length:var(--cf-text-caption-size)] font-[number:var(--cf-text-caption-weight)] text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-brand)]">
          All courses <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-6 flex-1">
        {/* Overall Attendance */}
        <div>
          <div className="mb-2 flex items-end justify-between">
            <span className="flex items-center gap-2 text-[length:var(--cf-text-body-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)]">
              <BookOpen className="h-4 w-4 text-[var(--cf-brand)]" />
              Overall Attendance
            </span>
            <span className="font-mono-meta text-[length:var(--cf-text-title-size)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-text)]">
              {hasAttendanceData ? (
                <AnimatedNumber value={overallAttendance} formatValue={(v) => `${Math.round(v)}%`} />
              ) : (
                '—'
              )}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--cf-surface-muted)] border border-[var(--cf-border-subtle)]">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                !hasAttendanceData
                  ? 'bg-transparent'
                  : overallAttendance < 75
                  ? 'bg-[var(--cf-danger)]'
                  : 'bg-[var(--cf-success)]'
              }`}
              style={{ width: `${hasAttendanceData ? overallAttendance : 0}%` }}
            />
          </div>
          {!hasAttendanceData && (
            <p className="mt-1.5 text-[length:var(--cf-text-caption-size)] text-[var(--cf-text-tertiary)]">
              No class attendance logged yet.
            </p>
          )}
        </div>

        {/* Assignment Progress */}
        <div>
          <div className="mb-2 flex items-end justify-between">
            <span className="flex items-center gap-2 text-[length:var(--cf-text-body-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)]">
              <CheckCircle className="h-4 w-4 text-[var(--cf-brand)]" />
              Tasks Completed
            </span>
            <span className="font-mono-meta text-[length:var(--cf-text-title-size)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-text)]">
              {hasAssignmentData ? (
                <AnimatedNumber value={assignmentProgress} formatValue={(v) => `${Math.round(v)}%`} />
              ) : (
                '—'
              )}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--cf-surface-muted)] border border-[var(--cf-border-subtle)]">
            <div 
              className="h-full rounded-full bg-[var(--cf-brand)] transition-all duration-500"
              style={{ width: `${hasAssignmentData ? assignmentProgress : 0}%` }}
            />
          </div>
          {!hasAssignmentData && (
            <p className="mt-1.5 text-[length:var(--cf-text-caption-size)] text-[var(--cf-text-tertiary)]">
              No coursework tasks logged yet.
            </p>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-8 grid grid-cols-2 gap-3 pt-6 border-t border-[var(--cf-border)]">
        <div className="flex flex-col gap-1 rounded-[var(--cf-radius-md)] bg-[var(--cf-surface-muted)] p-3 border border-transparent transition-colors group-hover:bg-[var(--cf-surface)] group-hover:border-[var(--cf-border)]">
          <span className="text-[length:var(--cf-text-micro-size)] font-[number:var(--cf-text-micro-weight)] uppercase tracking-wider text-[var(--cf-text-secondary)]">Courses at risk</span>
          <span className={`font-mono-meta text-[length:var(--cf-text-title-size)] font-bold ${attendanceWarningsCount > 0 ? 'text-[var(--cf-danger)]' : 'text-[var(--cf-text)]'}`}>
            <AnimatedNumber value={attendanceWarningsCount} />
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-[var(--cf-radius-md)] bg-[var(--cf-surface-muted)] p-3 border border-transparent transition-colors group-hover:bg-[var(--cf-surface)] group-hover:border-[var(--cf-border)]">
          <span className="text-[length:var(--cf-text-micro-size)] font-[number:var(--cf-text-micro-weight)] uppercase tracking-wider text-[var(--cf-text-secondary)]">Pending Tasks</span>
          <span className="font-mono-meta text-[length:var(--cf-text-title-size)] font-bold text-[var(--cf-text)]">
            <AnimatedNumber value={assignmentStats.pending + assignmentStats.inProgress} />
          </span>
        </div>
      </div>
    </Card>
  );
}
