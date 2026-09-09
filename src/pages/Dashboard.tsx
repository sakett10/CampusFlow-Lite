import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckSquare,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  ArrowRight,
  Bookmark,
  Mail,
  FileText,
  Loader2,
} from 'lucide-react';
import { useTasks } from '../hooks/useAssignments';
import { useNotices } from '../hooks/useNotices';
import { useCourses } from '../hooks/useCourses';
import { daysUntil, formatDueDate, formatTime, formatNoticeDate } from '../lib/dateUtils';
import { proposeTaskFromNotice, type ProposedTask } from '../lib/deadlineIntelligence';
import type { Assignment, Notice } from '../lib/types';

import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import AssignmentModal from '../components/AssignmentModal';
import AddToTaskModal from '../components/AddToTaskModal';

export default function Dashboard() {
  const { tasks, isLoading: tasksLoading, toggleTask, addTask } = useTasks();
  const { notices, isLoading: noticesLoading, convertToTask } = useNotices({ status: 'published' });
  const { courses } = useCourses();

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskProposal, setTaskProposal] = useState<ProposedTask | null>(null);
  const [isAddToTaskModalOpen, setIsAddToTaskModalOpen] = useState(false);

  // Filter tasks
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status !== 'COMPLETED'), [tasks]);

  const overdueTasks = useMemo(() => {
    return pendingTasks
      .filter((t) => daysUntil(t.dueDate) < 0)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [pendingTasks]);

  const todayTasks = useMemo(() => {
    return pendingTasks
      .filter((t) => daysUntil(t.dueDate) === 0)
      .sort((a, b) => (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59'));
  }, [pendingTasks]);

  const upcomingTasks = useMemo(() => {
    return pendingTasks
      .filter((t) => daysUntil(t.dueDate) > 0)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  }, [pendingTasks]);

  // Urgent item: oldest overdue task, or earliest task due today
  const urgentTask: Assignment | null = overdueTasks[0] || todayTasks[0] || null;

  // Recent 4 published notices
  const recentNotices = useMemo(() => {
    return (notices || []).slice(0, 4);
  }, [notices]);

  const todayDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  const handleOpenNoticeToTask = (notice: Notice) => {
    const proposal = proposeTaskFromNotice(notice);
    setTaskProposal(proposal);
    setIsAddToTaskModalOpen(true);
  };

  const handleConfirmNoticeToTask = async (taskData: Omit<Assignment, 'id'>) => {
    if (taskProposal?.source === 'notice' && taskProposal.sourceId) {
      await convertToTask(taskProposal.sourceId, {
        title: taskData.title,
        dueDate: taskData.dueDate,
        dueTime: taskData.dueTime,
        reminder: taskData.reminder,
        priority: taskData.priority,
        courseId: taskData.courseId,
      });
    } else {
      await addTask(taskData);
    }
    setIsAddToTaskModalOpen(false);
    setTaskProposal(null);
  };

  const handleSaveManualTask = (taskData: Omit<Assignment, 'id'>) => {
    addTask(taskData);
    setIsTaskModalOpen(false);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* 1. Header & Context */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--cf-border-subtle)] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-medium text-[var(--cf-text-tertiary)] uppercase tracking-wider">
            <span>{todayDateString}</span>
          </div>
          <h1 className="mt-1 font-sans-display text-[length:var(--cf-text-display-size)] leading-[var(--cf-text-display-line)] font-bold text-[var(--cf-text)]">
            Command Center
          </h1>
          <p className="mt-1 text-sm text-[var(--cf-text-secondary)]">
            {overdueTasks.length > 0 ? (
              <span className="text-[var(--cf-danger)] font-medium">
                {overdueTasks.length} overdue task{overdueTasks.length === 1 ? '' : 's'} requiring action ·{' '}
                {todayTasks.length} due today
              </span>
            ) : todayTasks.length > 0 ? (
              <span>
                {todayTasks.length} task{todayTasks.length === 1 ? '' : 's'} scheduled for today
              </span>
            ) : (
              <span>All tasks on schedule · {upcomingTasks.length} upcoming this week</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsTaskModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Task
          </Button>
        </div>
      </header>

      {/* 2. Top Priority Focus / Urgent Banner */}
      {urgentTask ? (
        <Card
          padding="md"
          className={`border transition-all ${
            daysUntil(urgentTask.dueDate) < 0
              ? 'border-[var(--cf-danger-border)] bg-[var(--cf-danger-subtle)]'
              : 'border-[var(--cf-border-strong)] bg-[var(--cf-surface)] shadow-xs'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                  daysUntil(urgentTask.dueDate) < 0
                    ? 'border-[var(--cf-danger-border)] bg-white text-[var(--cf-danger)]'
                    : 'border-[var(--cf-border)] bg-[var(--cf-surface-muted)] text-[var(--cf-text)]'
                }`}
              >
                {daysUntil(urgentTask.dueDate) < 0 ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-mono font-semibold uppercase tracking-wider ${
                      daysUntil(urgentTask.dueDate) < 0
                        ? 'text-[var(--cf-danger)]'
                        : 'text-[var(--cf-text-secondary)]'
                    }`}
                  >
                    {daysUntil(urgentTask.dueDate) < 0 ? 'Urgent · Overdue' : 'Next Up Today'}
                  </span>
                  {urgentTask.priority && urgentTask.priority !== 'medium' && (
                    <Badge variant={urgentTask.priority === 'urgent' ? 'danger' : 'warning'}>
                      {urgentTask.priority}
                    </Badge>
                  )}
                  {urgentTask.source && urgentTask.source !== 'manual' && (
                    <span className="text-[10px] font-mono text-[var(--cf-text-tertiary)] flex items-center gap-1">
                      {urgentTask.source === 'notice' ? <Bookmark className="w-2.5 h-2.5" /> : <Mail className="w-2.5 h-2.5" />}
                      via {urgentTask.source}
                    </span>
                  )}
                </div>

                <h2 className="mt-1 text-base font-semibold text-[var(--cf-text)] truncate">
                  {urgentTask.title}
                </h2>

                <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
                  Due {formatDueDate(urgentTask.dueDate)}
                  {urgentTask.dueTime ? ` at ${formatTime(urgentTask.dueTime)}` : ''}
                  {urgentTask.description ? ` · ${urgentTask.description}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toggleTask(urgentTask.id)}
                leftIcon={<CheckSquare className="w-3.5 h-3.5" />}
              >
                Mark Complete
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card
          padding="md"
          className="border border-[var(--cf-border)] bg-[var(--cf-surface)] shadow-none flex items-center gap-3.5 text-[var(--cf-text-secondary)]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--cf-success-subtle)] text-[var(--cf-success)] border border-[var(--cf-success-border)]">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="text-xs">
            <p className="font-semibold text-[var(--cf-text)]">All clear for today</p>
            <p className="text-[var(--cf-text-secondary)]">
              No overdue tasks. You are ready for upcoming deadlines.
            </p>
          </div>
        </Card>
      )}

      {/* 3. Main Command Grid: Left Tasks & Deadlines (7 cols), Right Notices (5 cols) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* LEFT: Tasks & Deadlines (7 cols) */}
        <div className="space-y-8 lg:col-span-7">
          {/* Today's Tasks */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-sans-display text-sm font-bold uppercase tracking-wider text-[var(--cf-text)]">
                  Today's Tasks
                </h2>
                <span className="flex h-5 items-center justify-center rounded-full bg-[var(--cf-surface-muted)] px-2 font-mono text-[11px] font-semibold text-[var(--cf-text-secondary)] border border-[var(--cf-border-subtle)]">
                  {todayTasks.length}
                </span>
              </div>
              <Link
                to="/assignments"
                className="text-xs font-medium text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] flex items-center gap-1 transition-colors"
              >
                Open Tasks <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {tasksLoading ? (
              <div className="flex h-28 items-center justify-center rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)]">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--cf-brand)]" />
              </div>
            ) : todayTasks.length === 0 ? (
              <Card padding="md" className="border-dashed border-[var(--cf-border)] bg-transparent text-center">
                <p className="text-xs text-[var(--cf-text-secondary)] font-medium">
                  No tasks due today. Everything on schedule.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {todayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-3 transition-all hover:border-[var(--cf-border-strong)] hover:shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--cf-border-strong)] hover:border-[var(--cf-brand)] hover:bg-[var(--cf-brand-subtle)] transition-colors cursor-pointer"
                        aria-label={`Mark ${task.title} as completed`}
                      >
                        <CheckSquare className="h-3.5 w-3.5 text-transparent group-hover:text-[var(--cf-text-tertiary)]" />
                      </button>

                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--cf-text)] truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--cf-text-secondary)]">
                          {task.dueTime && (
                            <span className="font-mono flex items-center gap-1 text-[var(--cf-warning)] font-semibold">
                              <Clock className="w-2.5 h-2.5" />
                              {formatTime(task.dueTime)}
                            </span>
                          )}
                          {task.priority && task.priority !== 'medium' && (
                            <span className="capitalize">{task.priority}</span>
                          )}
                          {task.source && task.source !== 'manual' && (
                            <span className="font-mono text-[var(--cf-text-tertiary)]">· {task.source}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Upcoming Deadlines (Next 7 Days) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-sans-display text-sm font-bold uppercase tracking-wider text-[var(--cf-text)]">
                  Upcoming Deadlines
                </h2>
                <span className="flex h-5 items-center justify-center rounded-full bg-[var(--cf-surface-muted)] px-2 font-mono text-[11px] font-semibold text-[var(--cf-text-secondary)] border border-[var(--cf-border-subtle)]">
                  {upcomingTasks.length}
                </span>
              </div>
            </div>

            {tasksLoading ? (
              <div className="flex h-28 items-center justify-center rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)]">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--cf-brand)]" />
              </div>
            ) : upcomingTasks.length === 0 ? (
              <Card padding="md" className="border-dashed border-[var(--cf-border)] bg-transparent text-center">
                <p className="text-xs text-[var(--cf-text-secondary)] font-medium">
                  No upcoming deadlines in the next 7 days.
                </p>
              </Card>
            ) : (
              <div className="divide-y divide-[var(--cf-border-subtle)] rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] overflow-hidden">
                {upcomingTasks.map((task) => {
                  const days = daysUntil(task.dueDate);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-[var(--cf-surface-muted)]/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--cf-text)] truncate">{task.title}</p>
                        <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
                          {formatDueDate(task.dueDate)}
                          {task.dueTime ? ` · ${formatTime(task.dueTime)}` : ''}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[var(--cf-text-secondary)] bg-[var(--cf-surface-muted)] border border-[var(--cf-border)] rounded-md px-2 py-0.5">
                          {days === 1 ? 'Tomorrow' : `In ${days} days`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT: Important Campus Notices (5 cols) */}
        <div className="space-y-3 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-sans-display text-sm font-bold uppercase tracking-wider text-[var(--cf-text)]">
                Campus Notices
              </h2>
            </div>
            <Link
              to="/notices"
              className="text-xs font-medium text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] flex items-center gap-1 transition-colors"
            >
              All Notices <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {noticesLoading ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--cf-brand)]" />
            </div>
          ) : recentNotices.length === 0 ? (
            <Card padding="md" className="border-dashed border-[var(--cf-border)] bg-transparent text-center">
              <EmptyState
                icon={<FileText className="w-6 h-6 text-[var(--cf-text-tertiary)]" />}
                title="No circulars posted"
                description="Verified institutional notices and circulars will appear here."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {recentNotices.map((notice) => (
                <div
                  key={notice.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-3.5 transition-all hover:border-[var(--cf-border-strong)] hover:shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)]">
                      {notice.category}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--cf-text-tertiary)]">
                      {formatNoticeDate(notice.sourceReceivedAt || notice.publishedAt || notice.createdAt)}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-[var(--cf-text)] leading-snug line-clamp-2">
                    {notice.title}
                  </h3>

                  {notice.actionRequired && (
                    <p className="text-xs text-[var(--cf-text-secondary)] line-clamp-1">
                      <strong className="font-semibold text-[var(--cf-text)]">Action:</strong>{' '}
                      {notice.actionRequired}
                    </p>
                  )}

                  <div className="pt-1 flex items-center justify-between border-t border-[var(--cf-border-subtle)]">
                    <span className="text-[11px] font-mono text-[var(--cf-text-tertiary)]">
                      {notice.sourceProvider === 'gmail' ? 'Via Gmail' : 'Official Circular'}
                    </span>
                    {notice.isConverted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <CheckSquare className="w-3 h-3 text-emerald-600" />
                        Converted
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenNoticeToTask(notice)}
                        leftIcon={<CheckSquare className="w-3.5 h-3.5 text-[var(--cf-text-secondary)]" />}
                        className="text-xs font-semibold px-2 py-1 h-7 text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)]"
                      >
                        Convert to Task
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task Creation Modal */}
      {isTaskModalOpen && (
        <AssignmentModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          onSave={handleSaveManualTask}
          courses={courses}
        />
      )}

      {/* Notice -> Task Conversion Modal */}
      {isAddToTaskModalOpen && taskProposal && (
        <AddToTaskModal
          isOpen={isAddToTaskModalOpen}
          onClose={() => {
            setIsAddToTaskModalOpen(false);
            setTaskProposal(null);
          }}
          proposal={taskProposal}
          onConfirm={handleConfirmNoticeToTask}
          courses={courses}
        />
      )}
    </div>
  );
}
