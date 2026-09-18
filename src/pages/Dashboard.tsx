import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckSquare,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  RefreshCw,
  Sparkles,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { useTasks } from '../hooks/useAssignments';
import { useNotices } from '../hooks/useNotices';
import { useCourses } from '../hooks/useCourses';
import { useGmailAutoSync } from '../hooks/useGmailAutoSync';
import { daysUntil, formatDueDate, formatTime, formatNoticeDate } from '../lib/dateUtils';
import { proposeTaskFromNotice, type ProposedTask } from '../lib/deadlineIntelligence';
import type { Assignment, Notice } from '../lib/types';

import { Button } from '../components/ui/Button';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { TaskSkeleton } from '../components/ui/Skeleton';
import AssignmentModal from '../components/AssignmentModal';
import AddToTaskModal from '../components/AddToTaskModal';

export default function Dashboard() {
  const { tasks, isLoading: tasksLoading, toggleTask, addTask } = useTasks();
  const { notices, isLoading: noticesLoading, convertToTask } = useNotices({ status: 'published' });
  const { courses } = useCourses();
  const { isConnected, isSyncing, lastSyncTime, syncStats, triggerSync } = useGmailAutoSync(300000, true);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskProposal, setTaskProposal] = useState<ProposedTask | null>(null);
  const [isAddToTaskModalOpen, setIsAddToTaskModalOpen] = useState(false);

  // 1. Pending & Overdue Tasks
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status !== 'COMPLETED'), [tasks]);

  const overdueTasks = useMemo(() => {
    return pendingTasks
      .filter((t) => daysUntil(t.dueDate) < 0)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [pendingTasks]);

  // 2. Today's Tasks
  const todayTasks = useMemo(() => {
    return pendingTasks
      .filter((t) => daysUntil(t.dueDate) === 0)
      .sort((a, b) => (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59'));
  }, [pendingTasks]);

  // 3. Upcoming Deadlines (Next 7 Days)
  const upcomingTasks = useMemo(() => {
    return pendingTasks
      .filter((t) => daysUntil(t.dueDate) > 0)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  }, [pendingTasks]);

  // Most critical urgent item
  const urgentTask: Assignment | null = overdueTasks[0] || todayTasks[0] || null;

  // 4. Important Campus Notices (Exams, Academic, Urgent Alerts)
  const importantNotices = useMemo(() => {
    return (notices || [])
      .filter((n) => n.priority === 'urgent' || n.priority === 'important' || n.category === 'exam' || n.category === 'academic')
      .slice(0, 3);
  }, [notices]);

  // 5. Recent Opportunities (Hackathons, Competitions, Workshops, Placements, Scholarships)
  const opportunityNotices = useMemo(() => {
    return (notices || [])
      .filter((n) => {
        const cat = (n.category || '').toLowerCase();
        const title = (n.title || '').toLowerCase();
        return (
          cat === 'event' ||
          cat === 'placement' ||
          cat === 'scholarship' ||
          title.includes('hackathon') ||
          title.includes('contest') ||
          title.includes('workshop') ||
          title.includes('competition') ||
          title.includes('internship')
        );
      })
      .slice(0, 3);
  }, [notices]);

  // 6. Recent Activity (Real completed tasks and conversions)
  const recentCompletedTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'COMPLETED')
      .sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 4);
  }, [tasks]);

  const todayDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
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
        customDate: taskData.customDate,
        customTime: taskData.customTime,
        timezone: taskData.timezone,
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
    <div className="mx-auto max-w-7xl space-y-6 pb-14">
      {/* -------------------------------------------------------------------------- */}
      {/* TOP COMMAND BAR (Swiss Typography & Clean Metrics)                         */}
      {/* -------------------------------------------------------------------------- */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>{todayDateString}</span>
            <span>&bull;</span>
            <span className="text-slate-700 font-semibold">ACADEMIC HUB</span>
          </div>
          <h1 className="mt-1 font-sans text-[32px] sm:text-[36px] font-extrabold tracking-tight text-slate-900 leading-tight">
            Command Center
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-mono">
            {overdueTasks.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                <AnimatedNumber value={overdueTasks.length} /> OVERDUE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                0 OVERDUE
              </span>
            )}

            <span className="text-slate-300">|</span>

            <span className="text-slate-600 font-medium">
              <AnimatedNumber value={todayTasks.length} /> DUE TODAY
            </span>

            <span className="text-slate-300">|</span>

            <span className="text-slate-500">
              <AnimatedNumber value={upcomingTasks.length} /> UPCOMING THIS WEEK
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsTaskModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
            className="shadow-sm font-semibold text-xs uppercase tracking-wider"
          >
            Add Task
          </Button>
        </div>
      </header>

      {/* -------------------------------------------------------------------------- */}
      {/* RESPONSIVE BENTO GRID                                                      */}
      {/* -------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ======================================================================== */}
        {/* BENTO CELL 1: TODAY'S IMPORTANT ITEMS (Primary Focus, 8 Cols)             */}
        {/* ======================================================================== */}
        <div className="lg:col-span-8 flex flex-col justify-between rounded-xl border-2 border-slate-900 bg-white p-5 sm:p-6 shadow-[3px_3px_0px_#0f172a]">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900">
                  // 01 TODAY&apos;S IMPORTANT ITEMS
                </span>
                <span className="flex h-5 items-center justify-center rounded bg-slate-100 px-2 font-mono text-xs font-bold text-slate-800 border border-slate-200">
                  <AnimatedNumber value={todayTasks.length + overdueTasks.length} />
                </span>
              </div>
              <Link
                to="/assignments"
                className="text-xs sm:text-sm font-mono font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 transition-colors"
              >
                OPEN TASKS &rarr;
              </Link>
            </div>

            {/* Overdue Urgent Alert Banner */}
            {urgentTask && daysUntil(urgentTask.dueDate) < 0 && (
              <div className="mb-4 rounded-lg border-2 border-rose-300 bg-rose-50/80 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-rose-900 uppercase">ACTION REQUIRED: OVERDUE COMMITMENT</span>
                    <p className="text-slate-900 font-sans font-semibold text-sm mt-0.5">{urgentTask.title}</p>
                    <p className="text-rose-800 text-xs mt-0.5">
                      Due: {formatDueDate(urgentTask.dueDate)}{urgentTask.dueTime ? ` at ${formatTime(urgentTask.dueTime)}` : ''}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleTask(urgentTask.id)}
                  leftIcon={<CheckSquare className="w-3.5 h-3.5 text-rose-700" />}
                  className="bg-white border-rose-300 hover:bg-rose-100 text-rose-900 shrink-0 self-start sm:self-center font-bold text-xs"
                >
                  Mark Complete
                </Button>
              </div>
            )}

            {/* Task Checklist */}
            {tasksLoading ? (
              <TaskSkeleton count={3} />
            ) : todayTasks.length === 0 && overdueTasks.length === 0 ? (
              <div className="py-10 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-900">All clear for today</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No pending deadlines scheduled for today. Check upcoming deadlines or explore notices.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Overdue tasks first */}
                {overdueTasks.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3 transition-all hover:bg-rose-50 hover:border-rose-300"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-rose-400 bg-white hover:border-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer transition-colors"
                        aria-label={`Mark "${task.title}" as completed`}
                      >
                        <CheckSquare className="h-3.5 w-3.5 text-transparent group-hover:text-rose-400" />
                      </button>

                      <div className="min-w-0">
                        <p className="text-[15px] sm:text-base font-semibold text-slate-900 truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs font-mono">
                          <span className="text-rose-700 font-bold">OVERDUE</span>
                          {task.courseId && (
                            <span className="text-slate-600 px-1.5 py-0.2 rounded bg-white border border-slate-200">
                              {task.courseId}
                            </span>
                          )}
                          {task.dueTime && <span>{formatTime(task.dueTime)}</span>}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleTask(task.id)}
                      className="text-xs text-rose-700 hover:text-rose-900 shrink-0"
                    >
                      Done
                    </Button>
                  </div>
                ))}

                {/* Today tasks */}
                {todayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-all hover:border-slate-900 hover:shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-slate-300 hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 cursor-pointer transition-colors"
                        aria-label={`Mark "${task.title}" as completed`}
                      >
                        <CheckSquare className="h-3.5 w-3.5 text-transparent group-hover:text-slate-400" />
                      </button>

                      <div className="min-w-0">
                        <p className="text-[15px] sm:text-base font-semibold text-slate-900 truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs font-mono text-slate-600">
                          {task.dueTime ? (
                            <span className="text-amber-800 font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              {formatTime(task.dueTime)}
                            </span>
                          ) : (
                            <span>TODAY</span>
                          )}
                          {task.courseId && (
                            <span className="text-slate-700 px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 font-bold">
                              {task.courseId}
                            </span>
                          )}
                          {task.source && task.source !== 'manual' && (
                            <span className="text-slate-400">&bull; via {task.source}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleTask(task.id)}
                      className="text-xs text-slate-500 hover:text-slate-900 shrink-0"
                    >
                      Done
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-500">
            <span>PRIORITY: REAL-TIME SORT</span>
            <span>CLICK CHECKBOX TO COMPLETE</span>
          </div>
        </div>

        {/* ======================================================================== */}
        {/* BENTO CELL 2: GMAIL SYNC STATUS & TELEMETRY (Cybercore Detail, 4 Cols)    */}
        {/* ======================================================================== */}
        <div className="lg:col-span-4 rounded-xl border-2 border-slate-900 bg-slate-900 text-white p-5 sm:p-6 shadow-[3px_3px_0px_#0f172a] flex flex-col justify-between font-mono">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300">
                // 02 GMAIL TELEMETRY
              </span>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                {isSyncing ? (
                  <span className="flex items-center gap-1 text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    SYNCING
                  </span>
                ) : isConnected ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    ONLINE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                    STANDBY
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-xs uppercase text-slate-400 block mb-0.5">Connection State</span>
                <p className="font-bold text-sm text-white">
                  {isConnected ? 'University Gmail Linked' : 'No Gmail Connected'}
                </p>
              </div>

              <div>
                <span className="text-xs uppercase text-slate-400 block mb-0.5">Last Sync Timestamp</span>
                <p className="text-slate-200 font-mono text-xs">
                  {lastSyncTime ? (
                    lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  ) : (
                    <span className="text-slate-500">Not Synced in Session</span>
                  )}
                </p>
              </div>

              {syncStats && (
                <div className="rounded border border-slate-800 bg-slate-950/60 p-2.5 space-y-1 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Messages Scanned:</span>
                    <span className="font-bold text-white">{syncStats.checked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">New Detected:</span>
                    <span className="font-bold text-emerald-400">{syncStats.newMessages}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Notices Extracted:</span>
                    <span className="font-bold text-white">{syncStats.noticesCreated ?? 0}</span>
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-400 pt-1">
                PROTOCOL: <span className="text-slate-200">gmail.readonly</span> (Auto-Sync: 5m)
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={triggerSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
              {isSyncing ? 'Scanning...' : 'Sync Now'}
            </button>

            <Link
              to="/settings"
              className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              Settings &rarr;
            </Link>
          </div>
        </div>

        {/* ======================================================================== */}
        {/* BENTO CELL 3: UPCOMING DEADLINES (4 Cols)                                 */}
        {/* ======================================================================== */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-100">
              <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900">
                // 03 UPCOMING DEADLINES
              </span>
              <span className="font-mono text-xs font-bold text-slate-500">
                <AnimatedNumber value={upcomingTasks.length} />
              </span>
            </div>

            {tasksLoading ? (
              <TaskSkeleton count={2} />
            ) : upcomingTasks.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center font-mono">
                No upcoming deadlines in the next 7 days.
              </p>
            ) : (
              <div className="space-y-2.5">
                {upcomingTasks.map((task) => {
                  const days = daysUntil(task.dueDate);
                  return (
                    <div
                      key={task.id}
                      className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm sm:text-base font-semibold text-slate-900 truncate flex-1">{task.title}</p>
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 shrink-0">
                          {days === 1 ? 'Tomorrow' : `In ${days}d`}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs font-mono text-slate-500">
                        <span>{formatDueDate(task.dueDate)}{task.dueTime ? ` · ${formatTime(task.dueTime)}` : ''}</span>
                        {task.courseId && <span className="font-bold text-slate-700">{task.courseId}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-right">
            <Link to="/assignments" className="text-xs sm:text-sm font-mono font-bold text-slate-700 hover:text-slate-900">
              View Calendar &rarr;
            </Link>
          </div>
        </div>

        {/* ======================================================================== */}
        {/* BENTO CELL 4: IMPORTANT NOTICES (4 Cols)                                  */}
        {/* ======================================================================== */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-100">
              <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900">
                // 04 IMPORTANT NOTICES
              </span>
              <Link to="/notices" className="text-xs sm:text-sm font-mono font-bold text-slate-700 hover:text-slate-900">
                All &rarr;
              </Link>
            </div>

            {noticesLoading ? (
              <TaskSkeleton count={2} />
            ) : importantNotices.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center font-mono">
                No urgent institutional notices posted.
              </p>
            ) : (
              <div className="space-y-3">
                {importantNotices.map((notice) => (
                  <div
                    key={notice.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold uppercase text-slate-700 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                        {notice.category}
                      </span>
                      <span className="text-slate-400">
                        {formatNoticeDate(notice.sourceReceivedAt || notice.publishedAt || notice.createdAt)}
                      </span>
                    </div>

                    <h4 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2 leading-snug">
                      {notice.title}
                    </h4>

                    {notice.actionRequired && (
                      <p className="text-xs sm:text-sm text-amber-900 bg-amber-50 p-1.5 rounded border border-amber-200/60 line-clamp-1">
                        <strong>Action:</strong> {notice.actionRequired}
                      </p>
                    )}

                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-500">
                        {notice.sourceProvider === 'gmail' ? 'Univ Gmail' : 'Circular'}
                      </span>
                      {notice.isConverted ? (
                        <span className="text-xs font-mono font-bold text-emerald-700">
                          &check; Converted
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenNoticeToTask(notice)}
                          className="text-xs sm:text-sm font-mono font-bold text-slate-900 hover:underline cursor-pointer"
                        >
                          + Add to Task
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-right">
            <Link to="/notices" className="text-xs sm:text-sm font-mono font-bold text-slate-700 hover:text-slate-900">
              Notice Board &rarr;
            </Link>
          </div>
        </div>

        {/* ======================================================================== */}
        {/* BENTO CELL 5: RECENT OPPORTUNITIES (4 Cols)                               */}
        {/* ======================================================================== */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-100">
              <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900">
                // 05 OPPORTUNITY RADAR
              </span>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </div>

            {noticesLoading ? (
              <TaskSkeleton count={2} />
            ) : opportunityNotices.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center font-mono">
                No active contest or hackathon circulars detected in current feed.
              </p>
            ) : (
              <div className="space-y-3">
                {opportunityNotices.map((opp) => (
                  <div
                    key={opp.id}
                    className="p-3 rounded-lg border border-slate-200 bg-white space-y-1.5 hover:border-slate-900 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold uppercase text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {opp.category}
                      </span>
                      <span className="text-slate-500">
                        {opp.venue ? opp.venue : 'Campus'}
                      </span>
                    </div>

                    <h4 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2 leading-snug">
                      {opp.title}
                    </h4>

                    {opp.links && opp.links.length > 0 ? (
                      <div className="pt-1">
                        <a
                          href={opp.links[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs sm:text-sm font-mono font-bold text-slate-900 hover:underline"
                        >
                          <span>{opp.links[0].label || 'Register Portal'}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenNoticeToTask(opp)}
                        className="text-xs sm:text-sm font-mono font-bold text-slate-700 hover:text-slate-900 pt-1 block cursor-pointer"
                      >
                        Track as Task &rarr;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-mono text-slate-500 flex items-center justify-between">
            <span>FILTER: HACKATHONS &bull; EVENTS</span>
            <span>VERIFIED FEED</span>
          </div>
        </div>

        {/* ======================================================================== */}
        {/* BENTO CELL 6: RECENT ACTIVITY & AUDIT LOG (12 Cols)                       */}
        {/* ======================================================================== */}
        <div className="lg:col-span-12 rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 text-xs sm:text-sm font-mono">
            <span className="font-extrabold uppercase tracking-wider text-slate-800">
              // 06 RECENT ACTIVITY &amp; COMPLETED ACTIONS
            </span>
            <span className="text-slate-500">AUDITED USER ISOLATION: STRICT</span>
          </div>

          {recentCompletedTasks.length === 0 ? (
            <p className="text-xs font-mono text-slate-500 py-3 text-center">
              No tasks marked completed in recent session.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recentCompletedTasks.map((t) => (
                <div
                  key={t.id}
                  className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate line-through">{t.title}</p>
                      <p className="font-mono text-xs text-slate-400">
                        {t.completedAt ? new Date(t.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Completed'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleTask(t.id)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Undo completion"
                    aria-label={`Undo completion of "${t.title}"`}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manual Task Creation Modal */}
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
