import { useState, useEffect } from 'react';
import type { Course } from '../lib/types';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type CourseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (course: Omit<Course, 'id'>) => void;
  initialData?: Course | null;
};

export default function CourseModal({ isOpen, onClose, onSave, initialData }: CourseModalProps) {
  const [formData, setFormData] = useState({
    code: initialData?.code || '',
    title: initialData?.title || '',
    instructor: initialData?.instructor || '',
    credits: initialData?.credits ?? 3,
    attendedClasses: initialData?.attendedClasses ?? 0,
    totalClasses: initialData?.totalClasses ?? 0,
    attendanceThreshold: initialData?.attendanceThreshold ?? 75,
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

    // Validation
    if (!formData.code || !formData.title || !formData.instructor) {
      setError('Code, Title, and Instructor are required.');
      return;
    }
    if (formData.credits < 0 || formData.attendedClasses < 0 || formData.totalClasses < 0) {
      setError('Credits and classes cannot be negative.');
      return;
    }
    if (formData.attendedClasses > formData.totalClasses) {
      setError('Attended classes cannot exceed total classes.');
      return;
    }
    if (formData.attendanceThreshold < 1 || formData.attendanceThreshold > 100) {
      setError('Attendance threshold must be between 1 and 100.');
      return;
    }

    onSave(formData);
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
        aria-labelledby="course-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-2xl shadow-[var(--cf-elev-3)] w-full max-w-md p-6 max-h-[90vh] overflow-y-auto relative"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="course-modal-title" className="font-sans-display text-lg font-bold text-[var(--cf-text)]">
            {initialData ? 'Edit Course' : 'Add Course'}
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

        {error && <div className="mb-4 p-3 bg-[var(--cf-danger-subtle)] border border-[var(--cf-danger-border)] text-[var(--cf-danger)] rounded-xl text-xs font-medium">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input id="courseCode" label="Course Code *" required value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. CS101" />
          </div>
          <div>
            <Input id="courseTitle" label="Course Title *" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Introduction to Computer Science" />
          </div>
          <div>
            <Input id="instructor" label="Instructor *" required value={formData.instructor} onChange={e => setFormData({ ...formData, instructor: e.target.value })} placeholder="Dr. Smith" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input id="credits" label="Credits" type="number" min="0" required value={formData.credits} onChange={e => setFormData({ ...formData, credits: Number(e.target.value) })} />
            </div>
            <div>
              <Input id="threshold" label="Threshold (%)" type="number" min="1" max="100" required value={formData.attendanceThreshold} onChange={e => setFormData({ ...formData, attendanceThreshold: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input id="attendedClasses" label="Attended" type="number" min="0" required value={formData.attendedClasses} onChange={e => setFormData({ ...formData, attendedClasses: Number(e.target.value) })} />
            </div>
            <div>
              <Input id="totalClasses" label="Total Classes" type="number" min="0" required value={formData.totalClasses} onChange={e => setFormData({ ...formData, totalClasses: Number(e.target.value) })} />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--cf-border-subtle)]">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">Save Course</Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
