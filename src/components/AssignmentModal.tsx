import { useState, useEffect } from 'react';
import type { Assignment, Course } from '../lib/types';
import { isValidDateString } from '../lib/dateUtils';
import { X, Calendar, Clock, Bell, CheckSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type AssignmentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assignment: Omit<Assignment, 'id'>) => void;
  initialData?: Assignment | null;
  courses?: Course[];
};

export default function AssignmentModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  courses = [],
}: AssignmentModalProps) {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    dueDate: initialData?.dueDate || new Date().toISOString().split('T')[0],
    dueTime: initialData?.dueTime || '',
    priority: initialData?.priority || ('medium' as 'low' | 'medium' | 'high' | 'urgent'),
    reminder: initialData?.reminder || 'none',
    courseId: initialData?.courseId || '',
    status: initialData?.status || ('PENDING' as Assignment['status']),
  });
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.title.trim()) {
      setError('Title cannot be empty.');
      return;
    }
    if (!isValidDateString(formData.dueDate)) {
      setError('A valid due date is required.');
      return;
    }

    onSave({
      title: formData.title.trim(),
      description: formData.description.trim(),
      dueDate: formData.dueDate,
      dueTime: formData.dueTime || null,
      priority: formData.priority,
      reminder: formData.reminder === 'none' ? null : formData.reminder,
      courseId: formData.courseId || null,
      status: formData.status,
      source: initialData?.source || 'manual',
      sourceId: initialData?.sourceId || null,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-[var(--cf-overlay)] flex items-center justify-center p-4 z-50 transition-opacity backdrop-blur-xs"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-2xl shadow-[var(--cf-elev-3)] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto relative"
      >
        <div className="flex items-center justify-between mb-4 border-b border-[var(--cf-border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 id="task-modal-title" className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                {initialData ? 'Edit Task' : 'Add Task'}
              </h2>
              <p className="text-xs text-[var(--cf-text-secondary)]">
                {initialData ? 'Update your deadline or notes.' : 'Log an assignment, study goal, or project milestone.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)] rounded-lg p-1.5 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--cf-danger-subtle)] border border-[var(--cf-danger-border)] text-[var(--cf-danger)] rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
              Task Title *
            </label>
            <Input
              id="title"
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Complete Machine Learning Lab 3"
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="dueDate" className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[var(--cf-text-tertiary)]" />
                  Due Date *
                </span>
              </label>
              <Input
                id="dueDate"
                type="date"
                required
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="text-xs"
              />
            </div>
            <div>
              <label htmlFor="dueTime" className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--cf-text-tertiary)]" />
                  Due Time (Optional)
                </span>
              </label>
              <Input
                id="dueTime"
                type="time"
                value={formData.dueTime}
                onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="priority" className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                Priority
              </label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent',
                  })
                }
                className="w-full h-10 px-3 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] text-xs focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label htmlFor="reminder" className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-[var(--cf-text-tertiary)]" />
                  Reminder
                </span>
              </label>
              <select
                id="reminder"
                value={formData.reminder}
                onChange={(e) => setFormData({ ...formData, reminder: e.target.value })}
                className="w-full h-10 px-3 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] text-xs focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
              >
                <option value="none">No reminder</option>
                <option value="2h_before">2 hours before</option>
                <option value="morning_of">Morning of (9:00 AM)</option>
                <option value="1d_before">1 day before</option>
                <option value="2d_before">2 days before</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="courseId" className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                Course (Optional)
              </label>
              <select
                id="courseId"
                value={formData.courseId}
                onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                className="w-full h-10 px-3 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] text-xs focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
              >
                <option value="">No Course / General Task</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="status" className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
                Status
              </label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as Assignment['status'],
                  })
                }
                className="w-full h-10 px-3 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] text-xs focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-xs font-semibold text-[var(--cf-text)] mb-1.5">
              Description & Notes (Optional)
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full p-3 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] font-reading text-xs focus:ring-2 focus:ring-[var(--cf-brand)] outline-none resize-none placeholder:text-[var(--cf-text-tertiary)]"
              placeholder="Key deliverables, submission link, reading materials..."
            />
          </div>

          <div className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-[var(--cf-border-subtle)]">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {initialData ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
