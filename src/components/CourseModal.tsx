import { useState } from 'react';
import type { Course } from '../lib/types';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{initialData ? 'Edit Course' : 'Add Course'}</h2>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="courseCode" className="block text-sm font-medium text-gray-700 mb-1">Course Code</label>
            <input id="courseCode" type="text" required value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. CS101" />
          </div>
          <div>
            <label htmlFor="courseTitle" className="block text-sm font-medium text-gray-700 mb-1">Course Title</label>
            <input id="courseTitle" type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Introduction to Computer Science" />
          </div>
          <div>
            <label htmlFor="instructor" className="block text-sm font-medium text-gray-700 mb-1">Instructor</label>
            <input id="instructor" type="text" required value={formData.instructor} onChange={e => setFormData({ ...formData, instructor: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Dr. Smith" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="credits" className="block text-sm font-medium text-gray-700 mb-1">Credits</label>
              <input id="credits" type="number" min="0" required value={formData.credits} onChange={e => setFormData({ ...formData, credits: Number(e.target.value) })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label htmlFor="threshold" className="block text-sm font-medium text-gray-700 mb-1">Threshold (%)</label>
              <input id="threshold" type="number" min="1" max="100" required value={formData.attendanceThreshold} onChange={e => setFormData({ ...formData, attendanceThreshold: Number(e.target.value) })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="attendedClasses" className="block text-sm font-medium text-gray-700 mb-1">Attended Classes</label>
              <input id="attendedClasses" type="number" min="0" required value={formData.attendedClasses} onChange={e => setFormData({ ...formData, attendedClasses: Number(e.target.value) })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label htmlFor="totalClasses" className="block text-sm font-medium text-gray-700 mb-1">Total Classes</label>
              <input id="totalClasses" type="number" min="0" required value={formData.totalClasses} onChange={e => setFormData({ ...formData, totalClasses: Number(e.target.value) })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md font-medium transition-colors">Save Course</button>
          </div>
        </form>
      </div>
    </div>
  );
}
