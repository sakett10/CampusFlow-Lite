import { Edit2, Trash2, CalendarX, Clock, Loader2, CheckCircle } from 'lucide-react';
import type { Assignment, Course } from '../lib/types';
import { isOverdue, formatDueDate } from '../lib/dateUtils';

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
    PENDING: { label: 'Pending', icon: Clock, color: 'text-gray-500 bg-gray-100', next: 'IN_PROGRESS' },
    IN_PROGRESS: { label: 'In Progress', icon: Loader2, color: 'text-blue-700 bg-blue-50 border-blue-200', next: 'COMPLETED' },
    COMPLETED: { label: 'Completed', icon: CheckCircle, color: 'text-green-700 bg-green-50 border-green-200', next: 'PENDING' }
  } as const;

  const currentStatus = statusConfig[assignment.status];
  const StatusIcon = currentStatus.icon;

  const cycleStatus = () => {
    onStatusChange(assignment.id, currentStatus.next as Assignment['status']);
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 flex flex-col transition-all hover:shadow-md ${overdue ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 pr-4">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold mb-2 ${course ? 'bg-indigo-50 text-indigo-700' : 'bg-red-50 text-red-700'}`}>
            {course ? `${course.code}` : 'Unknown Course'}
          </span>
          <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1">{assignment.title}</h3>
          {course && <p className="text-xs text-gray-500 line-clamp-1">{course.title}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onEdit(assignment)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Edit assignment" aria-label="Edit assignment">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(assignment.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete assignment" aria-label="Delete assignment">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {assignment.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{assignment.description}</p>
      )}

      <div className="mt-auto pt-4 flex items-center justify-between border-t border-gray-100">
        <div className="flex flex-col">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">Due Date</span>
          <div className={`flex items-center gap-1.5 text-sm font-medium ${overdue ? 'text-red-600' : 'text-gray-700'}`}>
            {overdue && <CalendarX className="w-4 h-4" />}
            {formatDueDate(assignment.dueDate)}
          </div>
        </div>

        <button 
          onClick={cycleStatus}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors hover:opacity-80 ${currentStatus.color}`}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {currentStatus.label}
        </button>
      </div>
    </div>
  );
}
