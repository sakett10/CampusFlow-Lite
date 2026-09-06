import { useState } from 'react';
import { Plus, CheckSquare } from 'lucide-react';
import { useAssignments } from '../hooks/useAssignments';
import { useCourses } from '../hooks/useCourses';
import AssignmentCard from '../components/AssignmentCard';
import AssignmentModal from '../components/AssignmentModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import type { Assignment } from '../lib/types';

export default function Assignments() {
  const { assignments, isLoading, error, refresh, addAssignment, updateAssignment, deleteAssignment, updateStatus } = useAssignments();
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
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-[var(--cf-border-subtle)] pb-4">
        <div>
          <h1 className="font-sans-display text-[length:var(--cf-text-display-size)] leading-tight font-bold text-[var(--cf-text)]">
            Assignments
          </h1>
          <p className="text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)] mt-1">
            Track coursework, deadlines, exams, and project submissions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select 
            value={filterCourseId}
            onChange={(e) => setFilterCourseId(e.target.value)}
            className="h-10 px-3 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-xl text-xs font-medium text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
          >
            <option value="ALL">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-10 px-3 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-xl text-xs font-medium text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <Button 
            variant="primary"
            onClick={handleAddClick}
            leftIcon={<Plus className="w-4 h-4" />}
            className="shrink-0"
          >
            Add Assignment
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--cf-radius-md)] border border-[var(--cf-danger-border)] bg-[var(--cf-danger-subtle)] p-4 flex items-center justify-between">
          <p className="text-sm font-medium text-[var(--cf-danger)]">
            {error}
          </p>
          <Button variant="secondary" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" aria-label="Loading assignments">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 space-y-3 animate-pulse"
            >
              <div className="h-4 w-20 bg-[var(--cf-surface-muted)] rounded" />
              <div className="h-6 w-44 bg-[var(--cf-surface-muted)] rounded" />
              <div className="h-4 w-32 bg-[var(--cf-surface-muted)] rounded" />
              <div className="pt-3 border-t border-[var(--cf-border-subtle)] flex justify-between">
                <div className="h-4 w-24 bg-[var(--cf-surface-muted)] rounded" />
                <div className="h-4 w-16 bg-[var(--cf-surface-muted)] rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <Card padding="lg" className="border-dashed border-[var(--cf-border)] bg-[var(--cf-surface-muted)]/40 p-12 text-center flex flex-col items-center">
          <EmptyState
            icon={<CheckSquare className="w-8 h-8 text-[var(--cf-brand)]" />}
            title="No assignments logged yet"
            description="Keep track of your homework, problem sets, and upcoming deadlines in one place."
            action={
              <Button 
                variant="outline"
                onClick={handleAddClick}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add Your First Assignment
              </Button>
            }
          />
        </Card>
      ) : filteredAssignments.length === 0 ? (
        <Card padding="lg" className="border border-[var(--cf-border)] bg-[var(--cf-surface)] p-12 text-center">
          <p className="text-sm text-[var(--cf-text-secondary)]">No assignments match your active filters.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
