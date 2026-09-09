import { Edit2, Trash2, Calendar, Clock, Check, Bell, Bookmark, Mail, AlertTriangle } from 'lucide-react';
import type { Assignment, Course } from '../lib/types';
import { formatDueDate, daysUntil, formatTime } from '../lib/dateUtils';
import { Card } from './ui/Card';

type AssignmentCardProps = {
  assignment: Assignment;
  course?: Course;
  onEdit: (assignment: Assignment) => void;
  onDelete: (id: string) => void;
  onStatusChange?: (id: string, newStatus: Assignment['status']) => void;
  onToggleComplete?: (id: string) => void;
};

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  high: { label: 'High', bg: 'bg-amber-50 text-amber-800 border-amber-200' },
  medium: { label: 'Medium', bg: 'bg-slate-50 text-slate-700 border-slate-200' },
  low: { label: 'Low', bg: 'bg-slate-50 text-slate-500 border-slate-200' },
};

export default function AssignmentCard({
  assignment,
  course,
  onEdit,
  onDelete,
  onStatusChange,
  onToggleComplete,
}: AssignmentCardProps) {
  const isCompleted = assignment.status === 'COMPLETED';
  const hasDueDate = Boolean(assignment.dueDate && assignment.dueDate.trim() !== '');
  const days = hasDueDate ? daysUntil(assignment.dueDate) : Infinity;
  const isOverdue = !isCompleted && hasDueDate && days < 0;
  const isToday = !isCompleted && hasDueDate && days === 0;
  const isTomorrow = !isCompleted && hasDueDate && days === 1;

  const handleToggle = () => {
    if (onToggleComplete) {
      onToggleComplete(assignment.id);
    } else if (onStatusChange) {
      onStatusChange(assignment.id, isCompleted ? 'PENDING' : 'COMPLETED');
    }
  };

  const priority = assignment.priority || 'medium';
  const prioStyle = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;

  // Format date display cleanly
  const renderDateLabel = () => {
    if (isCompleted) {
      return (
        <span className="text-emerald-700 font-medium flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          Completed
        </span>
      );
    }
    if (isOverdue) {
      return (
        <span className="text-rose-700 font-semibold flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          Overdue · {formatDueDate(assignment.dueDate)}
        </span>
      );
    }
    if (isToday) {
      return (
        <span className="text-amber-800 font-semibold flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Today{assignment.dueTime ? ` at ${formatTime(assignment.dueTime)}` : ''}
        </span>
      );
    }
    if (isTomorrow) {
      return (
        <span className="text-slate-800 font-medium flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          Tomorrow{assignment.dueTime ? ` at ${formatTime(assignment.dueTime)}` : ''}
        </span>
      );
    }
    if (!hasDueDate) {
      return (
        <span className="text-[var(--cf-text-tertiary)] font-medium flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-[var(--cf-text-tertiary)]" />
          No due date
        </span>
      );
    }
    return (
      <span className="text-[var(--cf-text-secondary)] font-medium flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-[var(--cf-text-tertiary)]" />
        {formatDueDate(assignment.dueDate)}
        {assignment.dueTime ? ` · ${formatTime(assignment.dueTime)}` : ''}
      </span>
    );
  };

  return (
    <Card
      padding="md"
      className={`group flex items-start gap-3.5 transition-all duration-150 border rounded-xl ${
        isCompleted
          ? 'bg-slate-50/70 border-[var(--cf-border-subtle)] opacity-75'
          : isOverdue
          ? 'bg-rose-50/20 border-rose-200 hover:border-rose-300 shadow-xs'
          : 'bg-[var(--cf-surface)] border-[var(--cf-border)] hover:border-[var(--cf-border-strong)] hover:shadow-xs'
      }`}
    >
      {/* Circle / Square Completion Toggle */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isCompleted}
        aria-label={isCompleted ? `Mark "${assignment.title}" as incomplete` : `Mark "${assignment.title}" as completed`}
        onClick={handleToggle}
        className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center transition-all cursor-pointer ${
          isCompleted
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'border-[var(--cf-border-strong)] hover:border-[var(--cf-brand)] hover:bg-[var(--cf-brand-subtle)] text-transparent hover:text-[var(--cf-brand)]'
        }`}
      >
        <Check className={`w-3.5 h-3.5 stroke-[3] transition-opacity ${isCompleted ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`} />
      </button>

      {/* Task Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Badges Row */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {/* Attached Course (Secondary) */}
          {course && (
            <span className="font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {course.code}
            </span>
          )}

          {/* Priority */}
          <span className={`font-medium px-2 py-0.5 rounded border ${prioStyle.bg}`}>
            {prioStyle.label}
          </span>

          {/* Source Provenance */}
          {assignment.source === 'notice' && (
            <span className="font-mono inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              <Bookmark className="w-2.5 h-2.5 text-slate-500" />
              Notice
            </span>
          )}
          {(assignment.source === 'gmail' || assignment.source === 'email') && (
            <span className="font-mono inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              <Mail className="w-2.5 h-2.5 text-slate-500" />
              Gmail
            </span>
          )}
          {assignment.source === 'manual' && (
            <span className="font-mono px-1.5 py-0.5 rounded text-slate-400">
              Manual
            </span>
          )}

          {/* Reminder indicator */}
          {assignment.reminder && assignment.reminder !== 'none' && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[var(--cf-text-tertiary)] bg-slate-50 border border-slate-200"
              title={`Reminder: ${assignment.reminder}`}
            >
              <Bell className="w-2.5 h-2.5 text-slate-600" />
            </span>
          )}
        </div>

        {/* Task Title */}
        <h3
          className={`font-sans-display text-sm sm:text-base font-semibold leading-snug break-words ${
            isCompleted ? 'line-through text-[var(--cf-text-tertiary)]' : 'text-[var(--cf-text)]'
          }`}
        >
          {assignment.title}
        </h3>

        {/* Description / Notes */}
        {assignment.description && (
          <p
            className={`font-reading text-xs sm:text-sm leading-relaxed line-clamp-2 ${
              isCompleted ? 'text-[var(--cf-text-tertiary)] line-through' : 'text-[var(--cf-text-secondary)]'
            }`}
          >
            {assignment.description}
          </p>
        )}

        {/* Date / Time */}
        <div className="pt-1 text-xs font-mono-meta">
          {renderDateLabel()}
        </div>
      </div>

      {/* Action Buttons (Edit / Delete) */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onEdit(assignment)}
          className="p-1.5 rounded-lg text-[var(--cf-text-tertiary)] hover:text-[var(--cf-brand)] hover:bg-[var(--cf-surface-muted)] transition-colors cursor-pointer"
          title="Edit task"
          aria-label="Edit task"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(assignment.id)}
          className="p-1.5 rounded-lg text-[var(--cf-text-tertiary)] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          title="Delete task"
          aria-label="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );
}
