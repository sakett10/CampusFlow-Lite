import { Edit2, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { Course } from '../lib/types';
import { calculateAttendancePercentage, calculateClassesNeeded } from '../lib/attendance';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

type CourseCardProps = {
  course: Course;
  onEdit: (course: Course) => void;
  onDelete: (id: string) => void;
  onRecordAttendance: (id: string, attended: boolean) => void;
};

export default function CourseCard({ course, onEdit, onDelete, onRecordAttendance }: CourseCardProps) {
  const percentage = calculateAttendancePercentage(course.attendedClasses, course.totalClasses);
  const needed = calculateClassesNeeded(course.attendedClasses, course.totalClasses, course.attendanceThreshold);
  const isBelowThreshold = percentage < course.attendanceThreshold;

  return (
    <Card padding="md" className="flex flex-col hover:border-[var(--cf-border-strong)] transition-all hover:shadow-[var(--cf-elev-2)] h-full">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0 pr-2">
          <Badge variant="brand" className="mb-2 font-mono-meta">{course.code}</Badge>
          <h3 className="font-sans-display text-base font-bold text-[var(--cf-text)] line-clamp-1" title={course.title}>
            {course.title}
          </h3>
          <p className="font-reading text-xs text-[var(--cf-text-secondary)] mt-0.5 truncate">{course.instructor} • {course.credits} Credits</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button 
            onClick={() => onEdit(course)} 
            className="p-2 text-[var(--cf-text-tertiary)] hover:text-[var(--cf-brand)] hover:bg-[var(--cf-surface-muted)] rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)]" 
            title="Edit course" 
            aria-label="Edit course"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(course.id)} 
            className="p-2 text-[var(--cf-text-tertiary)] hover:text-[var(--cf-danger)] hover:bg-[var(--cf-danger-subtle)] rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[var(--cf-danger)]" 
            title="Delete course" 
            aria-label="Delete course"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-[var(--cf-border-subtle)]">
        <div className="flex justify-between items-end mb-2">
          <div>
            <p className="text-[11px] font-semibold text-[var(--cf-text-secondary)] uppercase tracking-wider mb-0.5">Attendance</p>
            <div className="flex items-center gap-1.5 font-mono-meta">
              <span className={`text-xl font-bold ${isBelowThreshold ? 'text-[var(--cf-danger)]' : 'text-[var(--cf-success)]'}`}>
                {percentage.toFixed(1)}%
              </span>
              <span className="text-xs text-[var(--cf-text-secondary)]">/ {course.attendanceThreshold}%</span>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono-meta text-xs font-semibold text-[var(--cf-text-secondary)]">{course.attendedClasses} / {course.totalClasses}</p>
            <p className="text-[11px] text-[var(--cf-text-secondary)] font-medium">Classes</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-[var(--cf-surface-muted)] rounded-full h-1.5 mb-3 overflow-hidden border border-[var(--cf-border-subtle)]">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${isBelowThreshold ? 'bg-[var(--cf-danger)]' : 'bg-[var(--cf-success)]'}`} 
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>

        {/* Warnings */}
        {isBelowThreshold && needed > 0 && (
          <div className="flex items-start gap-2 mb-3 text-[var(--cf-danger)] bg-[var(--cf-danger-subtle)] border border-[var(--cf-danger-border)] p-2.5 rounded-xl text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Attend <strong>{needed}</strong> more consecutive classes to reach {course.attendanceThreshold}%.</p>
          </div>
        )}
        {isBelowThreshold && needed === -1 && (
          <div className="flex items-start gap-2 mb-3 text-[var(--cf-danger)] bg-[var(--cf-danger-subtle)] border border-[var(--cf-danger-border)] p-2.5 rounded-xl text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Attendance threshold cannot mathematically be reached.</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2.5 mt-2">
          <button 
            type="button"
            onClick={() => onRecordAttendance(course.id, true)} 
            className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-[var(--cf-success-subtle)] text-[var(--cf-success)] border border-[var(--cf-success-border)] hover:bg-[var(--cf-success)] hover:text-white rounded-xl font-semibold text-xs transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-success)]"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Attended
          </button>
          <button 
            type="button"
            onClick={() => onRecordAttendance(course.id, false)} 
            className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-[var(--cf-danger-subtle)] text-[var(--cf-danger)] border border-[var(--cf-danger-border)] hover:bg-[var(--cf-danger)] hover:text-white rounded-xl font-semibold text-xs transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-danger)]"
          >
            <XCircle className="w-3.5 h-3.5" /> Missed
          </button>
        </div>
      </div>
    </Card>
  );
}
