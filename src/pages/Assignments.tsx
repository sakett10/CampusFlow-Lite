import { useState, useMemo } from 'react';
import { Plus, CheckSquare, Calendar, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useTasks } from '../hooks/useAssignments';
import { useCourses } from '../hooks/useCourses';
import { daysUntil } from '../lib/dateUtils';
import AssignmentCard from '../components/AssignmentCard';
import AssignmentModal from '../components/AssignmentModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import type { Assignment } from '../lib/types';

type TaskTab = 'today' | 'upcoming' | 'completed';

export default function Assignments() {
  const { tasks, isLoading, error, refresh, addTask, updateTask, deleteTask, toggleTask } = useTasks();
  const { courses } = useCourses();

  const [activeTab, setActiveTab] = useState<TaskTab>('today');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Assignment | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  // Optional course filter
  const [filterCourseId, setFilterCourseId] = useState<string>('ALL');

  const handleAddClick = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (task: Assignment) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteTaskId(id);
  };

  const handleSave = (data: Omit<Assignment, 'id'>) => {
    if (editingTask) {
      updateTask(editingTask.id, data);
    } else {
      addTask(data);
    }
  };

  const confirmDelete = () => {
    if (deleteTaskId) {
      deleteTask(deleteTaskId);
      setDeleteTaskId(null);
    }
  };

  const getTitleForDelete = () => {
    return tasks.find((t) => t.id === deleteTaskId)?.title || 'this task';
  };

  // Grouped tasks
  const todayTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (filterCourseId !== 'ALL' && t.courseId !== filterCourseId) return false;
        return t.status !== 'COMPLETED' && daysUntil(t.dueDate) <= 0;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [tasks, filterCourseId]);

  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (filterCourseId !== 'ALL' && t.courseId !== filterCourseId) return false;
        return t.status !== 'COMPLETED' && daysUntil(t.dueDate) > 0;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [tasks, filterCourseId]);

  const completedTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (filterCourseId !== 'ALL' && t.courseId !== filterCourseId) return false;
        return t.status === 'COMPLETED';
      })
      .sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      });
  }, [tasks, filterCourseId]);

  const currentTasks =
    activeTab === 'today' ? todayTasks : activeTab === 'upcoming' ? upcomingTasks : completedTasks;

  const totalActiveCount = todayTasks.length + upcomingTasks.length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--cf-border-subtle)] pb-4 pt-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-sans-display text-[length:var(--cf-text-display-size)] leading-tight font-bold text-[var(--cf-text)]">
              Tasks
            </h1>
            {!isLoading && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20">
                {totalActiveCount} {totalActiveCount === 1 ? 'task' : 'tasks'} due
              </span>
            )}
          </div>
          <p className="text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)] mt-1">
            Focus on what needs to be done today, track upcoming deadlines, and keep organized.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {courses.length > 0 && (
            <select
              value={filterCourseId}
              onChange={(e) => setFilterCourseId(e.target.value)}
              className="h-10 px-3 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-xl text-xs font-medium text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none cursor-pointer"
              aria-label="Filter by course"
            >
              <option value="ALL">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="primary"
            size="md"
            onClick={handleAddClick}
            leftIcon={<Plus className="w-4 h-4" />}
            className="shrink-0"
          >
            Add Task
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-[var(--cf-danger-border)] bg-[var(--cf-danger-subtle)] p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--cf-danger)]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={refresh} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Retry
          </Button>
        </div>
      )}

      {/* View Tabs: Today | Upcoming | Completed */}
      <div className="flex items-center gap-1.5 border-b border-[var(--cf-border-subtle)] pb-2 overflow-x-auto hide-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'today'
              ? 'bg-[var(--cf-brand)] text-white shadow-sm'
              : 'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] border border-[var(--cf-border-subtle)]'
          }`}
        >
          <span>Today</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'today' ? 'bg-white/25 text-white' : 'bg-[var(--cf-surface)] text-[var(--cf-text-tertiary)]'
            }`}
          >
            {todayTasks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'upcoming'
              ? 'bg-[var(--cf-brand)] text-white shadow-sm'
              : 'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] border border-[var(--cf-border-subtle)]'
          }`}
        >
          <span>Upcoming</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'upcoming' ? 'bg-white/25 text-white' : 'bg-[var(--cf-surface)] text-[var(--cf-text-tertiary)]'
            }`}
          >
            {upcomingTasks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'completed'
              ? 'bg-[var(--cf-brand)] text-white shadow-sm'
              : 'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] border border-[var(--cf-border-subtle)]'
          }`}
        >
          <span>Completed</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'completed' ? 'bg-white/25 text-white' : 'bg-[var(--cf-surface)] text-[var(--cf-text-tertiary)]'
            }`}
          >
            {completedTasks.length}
          </span>
        </button>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-3" aria-label="Loading tasks">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4 flex items-center gap-4 animate-pulse"
            >
              <div className="w-5 h-5 rounded-full bg-[var(--cf-surface-muted)] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 bg-[var(--cf-surface-muted)] rounded" />
                <div className="h-3 w-1/2 bg-[var(--cf-surface-muted)] rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        /* Entire Task System Empty State */
        <Card padding="lg" className="border-dashed border-[var(--cf-border)] bg-[var(--cf-surface-muted)]/30 p-12 text-center flex flex-col items-center">
          <EmptyState
            icon={<CheckSquare className="w-8 h-8 text-[var(--cf-brand)]" />}
            title="No tasks logged yet"
            description="Turn academic assignments, problem sets, and campus circulars into a structured daily plan."
            action={
              <Button variant="primary" onClick={handleAddClick} leftIcon={<Plus className="w-4 h-4" />}>
                Add Your First Task
              </Button>
            }
          />
        </Card>
      ) : currentTasks.length === 0 ? (
        /* Tab-specific Empty States */
        <Card padding="lg" className="border border-[var(--cf-border)] bg-[var(--cf-surface)] p-10 text-center flex flex-col items-center">
          {activeTab === 'today' ? (
            <div className="space-y-3 max-w-sm">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                <Check className="w-5 h-5 stroke-[2.5]" />
              </div>
              <h3 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                No tasks due today
              </h3>
              <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
                You are all caught up for today! Review upcoming tasks or enjoy your free time.
              </p>
              {upcomingTasks.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setActiveTab('upcoming')}>
                  View Upcoming ({upcomingTasks.length})
                </Button>
              )}
            </div>
          ) : activeTab === 'upcoming' ? (
            <div className="space-y-3 max-w-sm">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 mx-auto flex items-center justify-center border border-slate-200">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                No upcoming deadlines
              </h3>
              <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
                No future tasks or deadlines currently scheduled.
              </p>
              <Button variant="primary" size="sm" onClick={handleAddClick} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Schedule a Task
              </Button>
            </div>
          ) : (
            <div className="space-y-3 max-w-sm">
              <div className="w-10 h-10 rounded-full bg-zinc-500/10 text-[var(--cf-text-tertiary)] mx-auto flex items-center justify-center">
                <CheckSquare className="w-5 h-5" />
              </div>
              <h3 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                No completed tasks yet
              </h3>
              <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
                Check off tasks as you finish them to track your productivity.
              </p>
            </div>
          )}
        </Card>
      ) : (
        /* Task Cards List */
        <div className="space-y-3">
          {currentTasks.map((task) => (
            <AssignmentCard
              key={task.id}
              assignment={task}
              course={courses.find((c) => c.id === task.courseId)}
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
              onToggleComplete={toggleTask}
            />
          ))}
        </div>
      )}

      {/* Task Create / Edit Modal */}
      <AssignmentModal
        key={isModalOpen ? editingTask?.id || 'new' : 'closed'}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingTask}
        courses={courses}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTaskId}
        onClose={() => setDeleteTaskId(null)}
        onConfirm={confirmDelete}
        title={getTitleForDelete()}
      />
    </div>
  );
}
