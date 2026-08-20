import { useState } from 'react';
import type { Assignment, Course } from '../lib/types';
import { isValidDateString } from '../lib/dateUtils';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{initialData ? 'Edit Assignment' : 'Add Assignment'}</h2>
        
        {courses.length === 0 && !initialData ? (
          <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm mb-4">
            You need to create a course first before adding an assignment.
          </div>
        ) : null}

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="courseId" className="block text-sm font-medium text-gray-700 mb-1">Course</label>
            <select 
              required 
              value={formData.courseId} 
              onChange={e => setFormData({ ...formData, courseId: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
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
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input id="title" type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Midterm Essay" />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <textarea id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none" placeholder="Details about the assignment..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input id="dueDate" type="date" required value={formData.dueDate} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select 
                value={formData.status} 
                onChange={e => setFormData({ ...formData, status: e.target.value as Assignment['status'] })}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium transition-colors">Cancel</button>
            <button type="submit" disabled={courses.length === 0 && !initialData} className="disabled:opacity-50 px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md font-medium transition-colors">Save Assignment</button>
          </div>
        </form>
      </div>
    </div>
  );
}
