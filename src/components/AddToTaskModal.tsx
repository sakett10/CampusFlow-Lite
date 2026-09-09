import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Bell, CheckSquare, AlertCircle, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import type { Assignment, Course } from '../lib/types';
import type { ProposedTask } from '../lib/deadlineIntelligence';

interface AddToTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: ProposedTask | null;
  onConfirm: (task: Omit<Assignment, 'id'>) => Promise<void>;
  courses?: Course[];
}

export default function AddToTaskModal({
  isOpen,
  onClose,
  proposal,
  onConfirm,
  courses = [],
}: AddToTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('17:00');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [reminder, setReminder] = useState<string>('1d_before');
  const [courseId, setCourseId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (proposal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(proposal.title || '');
      setDescription(proposal.description || '');
      setDueDate(proposal.dueDate || '');
      setDueTime(proposal.dueTime || '17:00');
      setPriority(proposal.priority || 'medium');
      setReminder(proposal.reminder || '1d_before');
      setCourseId(proposal.courseId || '');
      setError(null);
    }
  }, [proposal]);

  if (!isOpen || !proposal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    if (!dueDate) {
      setError('Due date is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        title: title.trim(),
        description: description.trim(),
        dueDate,
        dueTime: dueTime || null,
        reminder: reminder === 'none' ? null : reminder,
        priority,
        courseId: courseId || null,
        status: 'PENDING',
        source: proposal.source || 'notice',
        sourceId: proposal.sourceId || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cf-overlay)] backdrop-blur-xs"
      role="presentation"
      onClick={onClose}
    >
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-full max-w-lg rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 shadow-[var(--cf-elev-3)]"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[var(--cf-border-subtle)] pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20">
                <CheckSquare className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                  Add to Tasks
                </h2>
                <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
                  Review and confirm academic deadline details.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Source Provenance Banner */}
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-[var(--cf-surface-muted)] px-3 py-2 border border-[var(--cf-border-subtle)] text-xs text-[var(--cf-text-secondary)]">
            <Bookmark className="h-3.5 w-3.5 text-[var(--cf-brand)] shrink-0" />
            <span className="truncate">
              Source: <strong className="text-[var(--cf-text)] font-semibold">{proposal.sourceTitle || proposal.source}</strong>
            </span>
            <Badge variant="neutral" className="ml-auto text-[10px] uppercase font-bold shrink-0">
              {proposal.source}
            </Badge>
          </div>

          {/* Ambiguous date alert */}
          {proposal.isAmbiguousDate && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-500">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {proposal.confidenceReason || 'Due date was not explicitly stated. Please confirm the deadline date below.'}
              </span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                Task Title *
              </label>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Submit Physics assignment"
                required
                className="w-full text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[var(--cf-text-tertiary)]" />
                    Due Date *
                  </span>
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[var(--cf-text-tertiary)]" />
                    Time (Optional)
                  </span>
                </label>
                <Input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high' | 'urgent')}
                  className="h-10 w-full px-3 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-xl text-xs font-medium text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-[var(--cf-text-tertiary)]" />
                    Reminder
                  </span>
                </label>
                <select
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                  className="h-10 w-full px-3 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-xl text-xs font-medium text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
                >
                  <option value="none">No reminder</option>
                  <option value="2h_before">2 hours before</option>
                  <option value="morning_of">Morning of (9:00 AM)</option>
                  <option value="1d_before">1 day before</option>
                  <option value="2d_before">2 days before</option>
                </select>
              </div>
            </div>

            {courses.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                  Attach to Course (Optional)
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="h-10 w-full px-3 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-xl text-xs font-medium text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
                >
                  <option value="">No course attached</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                Notes & Context
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Additional notes, venue, or submission requirements..."
                className="w-full px-3 py-2 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-xl text-xs text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--cf-border-subtle)]">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                className="gap-1.5"
              >
                <CheckSquare className="w-4 h-4" />
                {isSubmitting ? 'Adding...' : 'Confirm & Add Task'}
              </Button>
            </div>
          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
