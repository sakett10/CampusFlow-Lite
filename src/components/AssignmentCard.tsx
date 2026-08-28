import { Edit2, Trash2, CalendarX, Clock, Loader2, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import type { Assignment, Course } from '../lib/types';
import { isOverdue, formatDueDate } from '../lib/dateUtils';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

type AssignmentCardProps = {
  assignment: Assignment;
  course?: Course;
  onEdit: (assignment: Assignment) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, newStatus: Assignment['status']) => void;
};

export default function AssignmentCard({ assignment, course, onEdit, onDelete, onStatusChange }: AssignmentCardProps) {
  const overdue = isOverdue(assignment.dueDate, assignment.status);
  
  const statusConfig = {
    PENDING: { 
      label: 'Pending', 
      icon: Clock, 
      color: 'text-[var(--cf-text-secondary)] bg-[var(--cf-surface-muted)] border-[var(--cf-border)] hover:border-[var(--cf-border-strong)]', 
      next: 'IN_PROGRESS' 
    },
    IN_PROGRESS: { 
      label: 'In Progress', 
      icon: Loader2, 
      color: 'text-[var(--cf-brand)] bg-[var(--cf-brand-subtle)] border-[var(--cf-brand)]/30 hover:border-[var(--cf-brand)]/50', 
      next: 'COMPLETED' 
    },
    COMPLETED: { 
      label: 'Completed', 
      icon: CheckCircle, 
      color: 'text-[var(--cf-success)] bg-[var(--cf-success-subtle)] border-[var(--cf-success-border)] hover:bg-[var(--cf-success-subtle)]/80', 
      next: 'PENDING' 
    }
  } as const;

  const currentStatus = statusConfig[assignment.status];
  const StatusIcon = currentStatus.icon;

  const cycleStatus = () => {
    onStatusChange(assignment.id, currentStatus.next as Assignment['status']);
  };

  return (
    <Card padding="md" className={`flex flex-col hover:border-[var(--cf-border-strong)] transition-all hover:shadow-[var(--cf-elev-2)] h-full ${overdue ? 'border-l-4 border-l-[var(--cf-danger)] border-[var(--cf-danger-border)] bg-[var(--cf-danger-subtle)]/10' : ''}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="brand" className="font-mono-meta">
              {course ? `${course.code}` : 'General Task'}
            </Badge>
            {overdue && (
              <Badge variant="danger" className="font-mono-meta font-bold">
                OVERDUE
              </Badge>
            )}
          </div>
          <h3 className="font-sans-display text-base font-bold text-[var(--cf-text)] leading-snug mb-1">
            {assignment.title}
          </h3>
          {course && <p className="font-reading text-xs text-[var(--cf-text-secondary)] line-clamp-1">{course.title}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button 
            onClick={() => onEdit(assignment)} 
            className="p-2 text-[var(--cf-text-tertiary)] hover:text-[var(--cf-brand)] hover:bg-[var(--cf-surface-muted)] rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)]" 
            title="Edit assignment" 
            aria-label="Edit assignment"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(assignment.id)} 
            className="p-2 text-[var(--cf-text-tertiary)] hover:text-[var(--cf-danger)] hover:bg-[var(--cf-danger-subtle)] rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[var(--cf-danger)]" 
            title="Delete assignment" 
            aria-label="Delete assignment"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {assignment.description && (
        <p className="font-reading text-sm text-[var(--cf-text-secondary)] mb-4 line-clamp-2 leading-relaxed">{assignment.description}</p>
      )}

      <div className="mt-auto pt-3 flex items-center justify-between border-t border-[var(--cf-border-subtle)]">
        <div className="flex flex-col">
          <span className="text-[11px] text-[var(--cf-text-secondary)] font-semibold uppercase tracking-wider mb-0.5">Due Date</span>
          <div className={`flex items-center gap-1.5 font-mono-meta text-xs font-semibold ${overdue ? 'text-[var(--cf-danger)]' : 'text-[var(--cf-text)]'}`}>
            {overdue && <CalendarX className="w-3.5 h-3.5" />}
            {formatDueDate(assignment.dueDate)}
          </div>
        </div>

        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={cycleStatus}
          aria-label={`Status: ${currentStatus.label}. Click to advance status.`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] ${currentStatus.color}`}
        >
          <StatusIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{currentStatus.label}</span>
        </motion.button>
      </div>
    </Card>
  );
}
