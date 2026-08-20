import { useState } from 'react';
import { Plus, CheckSquare } from 'lucide-react';
import { useAssignments } from '../hooks/useAssignments';
import { useCourses } from '../hooks/useCourses';
import AssignmentCard from '../components/AssignmentCard';
import AssignmentModal from '../components/AssignmentModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import type { Assignment } from '../lib/types';

export default function Assignments() {
  const { assignments, addAssignment, updateAssignment, deleteAssignment, updateStatus } = useAssignments();
  const { courses } = useCourses();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [deleteAssignmentId, setDeleteAssignmentId] = useState<string | null>(null);

  // Filters
  const [filterCourseId, setFilterCourseId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const handleAddClick = () => {
    setEditingAssignment(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteAssignmentId(id);
  };

  const handleSave = (data: Omit<Assignment, 'id'>) => {
    if (editingAssignment) {
      updateAssignment(editingAssignment.id, data);
    } else {
      addAssignment(data);
    }
  };

  const confirmDelete = () => {
    if (deleteAssignmentId) {
      deleteAssignment(deleteAssignmentId);
      setDeleteAssignmentId(null);
    }
  };

  const getTitleForDelete = () => {
    return assignments.find(a => a.id === deleteAssignmentId)?.title || 'this assignment';
  };

  const filteredAssignments = assignments.filter(a => {
    if (filterCourseId !== 'ALL' && a.courseId !== filterCourseId) return false;
    if (filterStatus !== 'ALL' && a.status !== filterStatus) return false;
    return true;
  });

  // Sort by due date (closest first)
  filteredAssignments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Assignments</h1>
          <p className="text-gray-500 mt-1">Track your tasks, homework, and exams.</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={filterCourseId}
            onChange={(e) => setFilterCourseId(e.target.value)}
            className="p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="ALL">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <button 
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm shrink-0"
          >
            <Plus className="w-5 h-5" />
            Add Assignment
          </button>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <CheckSquare className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No assignments yet</h2>
          <p className="text-gray-500 mb-6 max-w-sm">Stay on top of your work by tracking your assignments here.</p>
          <button 
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Assignment
          </button>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500">No assignments match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredAssignments.map(assignment => (
            <AssignmentCard 
              key={assignment.id} 
              assignment={assignment} 
              course={courses.find(c => c.id === assignment.courseId)}
              onEdit={handleEditClick} 
              onDelete={handleDeleteClick}
              onStatusChange={updateStatus}
            />
          ))}
        </div>
      )}

      <AssignmentModal 
        key={isModalOpen ? (editingAssignment?.id || 'new') : 'closed'}
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        initialData={editingAssignment}
        courses={courses}
      />

      <DeleteConfirmModal
        isOpen={!!deleteAssignmentId}
        onClose={() => setDeleteAssignmentId(null)}
        onConfirm={confirmDelete}
        title={getTitleForDelete()}
      />
    </div>
  );
}
