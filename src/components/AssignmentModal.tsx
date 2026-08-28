import { useState, useEffect } from 'react';
import type { Assignment, Course } from '../lib/types';
import { isValidDateString } from '../lib/dateUtils';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type AssignmentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assignment: Omit<Assignment, 'id'>) => void;
  initialData?: Assignment | null;
  courses: Course[];
};

export default function AssignmentModal({ isOpen, onClose, onSave, initialData, courses }: AssignmentModalProps) {
  const [formData, setFormData] = useState({
    courseId: initialData?.courseId || (courses.length > 0 ? courses[0].id : ''),
    title: initialData?.title || '',
    description: initialData?.description || '',
    dueDate: initialData?.dueDate || new Date().toISOString().split('T')[0],
    status: initialData?.status || 'PENDING',
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
    if (!formData.courseId.trim()) {
      setError('A valid course must be selected.');
      return;
    }
    if (!isValidDateString(formData.dueDate)) {
      setError('A valid due date is required.');
      return;
    }
    if (!['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(formData.status)) {
      setError('Invalid status.');
      return;
    }

    onSave({
      ...formData,
      status: formData.status as Assignment['status']
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
        aria-labelledby="assignment-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-2xl shadow-[var(--cf-elev-3)] w-full max-w-md p-6 max-h-[90vh] overflow-y-auto relative"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="assignment-modal-title" className="font-sans-display text-lg font-bold text-[var(--cf-text)]">
            {initialData ? 'Edit Assignment' : 'Add Assignment'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)] rounded-lg p-1.5 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {courses.length === 0 && !initialData ? (
          <div className="p-3 bg-[var(--cf-warning-subtle)] border border-[var(--cf-warning-border)] text-[var(--cf-warning)] rounded-xl text-xs font-medium mb-4">
            You need to create a course first before adding an assignment.
          </div>
        ) : null}

        {error && <div className="mb-4 p-3 bg-[var(--cf-danger-subtle)] border border-[var(--cf-danger-border)] text-[var(--cf-danger)] rounded-xl text-xs font-medium">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="courseId" className="block text-sm font-medium text-[var(--cf-text)] mb-1.5">Course *</label>
            <select 
              id="courseId"
              required 
              value={formData.courseId} 
              onChange={e => setFormData({ ...formData, courseId: e.target.value })}
              className="w-full h-11 px-3.5 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] text-sm focus:ring-2 focus:ring-[var(--cf-brand)] outline-none"
            >
              <option value="" disabled>Select a course</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.title}</option>
              ))}
              {initialData && !courses.find(c => c.id === initialData.courseId) && (
                 <option value={initialData.courseId}>Unknown Course (Orphaned)</option>
              )}
            </select>
          </div>
          
          <div>
            <Input id="title" label="Title *" type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Problem Set 4" />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-[var(--cf-text)] mb-1.5">Description (Optional)</label>
            <textarea id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-3 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] font-reading text-sm focus:ring-2 focus:ring-[var(--cf-brand)] outline-none h-20 resize-none placeholder:text-[var(--cf-text-tertiary)]" placeholder="Details about the assignment..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input id="dueDate" label="Due Date *" type="date" required value={formData.dueDate} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} />
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-[var(--cf-text)] mb-1.5">Status</label>
              <select 
                id="status"
                value={formData.status} 
                onChange={e => setFormData({ ...formData, status: e.target.value as Assignment['status'] })}
                className="w-full h-11 px-3.5 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] text-sm focus:ring-2 focus:ring-[var(--cf-brand)] outline-none"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--cf-border-subtle)]">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={courses.length === 0 && !initialData}>Save Assignment</Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
