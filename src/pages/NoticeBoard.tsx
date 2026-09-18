import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  Search,
  X,
  AlertCircle,
  RefreshCw,
  Inbox,
  ShieldCheck,
  Building2,
  Mail,
  AlertTriangle,
  Calendar,
  CheckSquare,
  ArrowUpDown,
  RotateCcw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Notice, NoticeCategory, NoticePriority, NoticeStatus } from '../lib/types';
import { useNotices } from '../hooks/useNotices';
import { useTasks } from '../hooks/useAssignments';
import { useCourses } from '../hooks/useCourses';
import { proposeTaskFromNotice, type ProposedTask } from '../lib/deadlineIntelligence';
import {
  isValidDateString,
  daysUntil,
  getCurrentMonthKey,
  formatMonthDisplay,
  getAdjacentMonthKey,
  extractMonthKey,
} from '../lib/dateUtils';
import NoticeCard from '../components/NoticeCard';
import NoticeEditModal from '../components/NoticeEditModal';
import AddToTaskModal from '../components/AddToTaskModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { NoticeCardSkeleton } from '../components/ui/Skeleton';

const CATEGORIES: { value: NoticeCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'academic', label: 'Academic' },
  { value: 'exam', label: 'Exams' },
  { value: 'assignment', label: 'Assignments' },
  { value: 'placement', label: 'Placements' },
  { value: 'event', label: 'Events' },
  { value: 'scholarship', label: 'Scholarships' },
  { value: 'alert', label: 'Alerts' },
  { value: 'fee', label: 'Fees' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'administrative', label: 'Admin' },
  { value: 'general', label: 'General' },
];

const PRIORITIES: { value: NoticePriority | 'all'; label: string }[] = [
  { value: 'all', label: 'All Priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'important', label: 'Important' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const STATUS_TABS: { value: NoticeStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
];

export const NoticeBoard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Month-based notice browsing state: selectedMonth is the single source of truth
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);
  const initialMonth = useMemo(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('month');
      if (param && /^\d{4}-\d{2}$/.test(param)) {
        return param;
      }
    }
    return currentMonthKey;
  }, [currentMonthKey]);

  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);

  const {
    notices,
    isLoading,
    error,
    isReviewer,
    filters,
    setFilters,
    refresh,
    approveNotice,
    publishNotice,
    rejectNotice,
    archiveNotice,
    updateNotice,
    deleteNotice,
    ingestFromGmail,
    convertToTask,
  } = useNotices({ status: 'all', category: 'all', priority: 'all', search: '', month: initialMonth });

  const { addTask } = useTasks();
  const { courses } = useCourses();
  const [taskProposal, setTaskProposal] = useState<ProposedTask | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskSuccessBanner, setTaskSuccessBanner] = useState<string | null>(null);

  // Synchronize selectedMonth to useNotices filters (single fetch per month change, deduplicated)
  useEffect(() => {
    setFilters((prev) => {
      if (prev.month === selectedMonth) return prev;
      return { ...prev, month: selectedMonth };
    });
  }, [selectedMonth, setFilters]);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  // Close month dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setIsMonthDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMonthDropdownOpen(false);
      }
    };

    if (isMonthDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMonthDropdownOpen]);

  // Sync selectedMonth with ?month= query param
  useEffect(() => {
    const currentParam = searchParams.get('month');
    if (selectedMonth === currentMonthKey) {
      if (currentParam) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('month');
        setSearchParams(nextParams, { replace: true });
      }
    } else {
      if (currentParam !== selectedMonth) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('month', selectedMonth);
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [selectedMonth, currentMonthKey, searchParams, setSearchParams]);

  // Helper to extract a notice's month key
  const getNoticeMonth = useCallback(
    (n: Notice): string => {
      return extractMonthKey(n.sourceReceivedAt || n.publishedAt || n.createdAt) || currentMonthKey;
    },
    [currentMonthKey],
  );

  // Rolling 12 months list + any historical months present in loaded notices
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < 12; i++) {
      set.add(getAdjacentMonthKey(currentMonthKey, -i));
    }
    notices.forEach((n) => {
      const key = extractMonthKey(n.sourceReceivedAt || n.publishedAt || n.createdAt);
      if (key && key <= currentMonthKey) {
        set.add(key);
      }
    });
    if (selectedMonth <= currentMonthKey) {
      set.add(selectedMonth);
    }
    return Array.from(set).sort().reverse();
  }, [currentMonthKey, notices, selectedMonth]);

  // Notice counts per month across all loaded notices
  const noticeCountByMonth = useMemo(() => {
    const counts: Record<string, number> = {};
    notices.forEach((n) => {
      const key = getNoticeMonth(n);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [notices, getNoticeMonth]);

  // Notices belonging specifically to the selected month
  const monthNotices = useMemo(() => {
    return notices.filter((n) => getNoticeMonth(n) === selectedMonth);
  }, [notices, selectedMonth, getNoticeMonth]);

  const isCurrentMonth = selectedMonth === currentMonthKey;
  const canGoNext = selectedMonth < currentMonthKey;

  const handlePrevMonth = () => {
    setSelectedMonth((prev) => getAdjacentMonthKey(prev, -1));
  };

  const handleNextMonth = () => {
    if (canGoNext) {
      setSelectedMonth((prev) => getAdjacentMonthKey(prev, 1));
    }
  };

  // Client-side scanning and decision-making filters
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'all' | 'institutional' | 'gmail_personal'>('all');
  const [actionFilter, setActionFilter] = useState<'all' | 'action_required' | 'has_deadline' | 'unconverted'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'deadline'>('newest');

  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [gmailMessageIdInput, setGmailMessageIdInput] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<{ success?: string; error?: string } | null>(null);

  // Sync ?tab= query parameter with reviewer status filter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['pending', 'approved', 'published', 'rejected', 'archived', 'all'].includes(tabParam)) {
      setFilters((prev) => ({ ...prev, status: tabParam as NoticeStatus | 'all' }));
    }
  }, [searchParams, setFilters]);

  // Real summary metrics for quick scanning in selected month
  const monthStats = useMemo(() => {
    const total = monthNotices.length;
    let actionCount = 0;
    let deadlineCount = 0;
    let gmailCount = 0;
    let institutionalCount = 0;

    monthNotices.forEach((n) => {
      if (n.actionRequired && n.actionRequired.trim()) actionCount++;
      if (n.importantDates && n.importantDates.length > 0) deadlineCount++;
      if (n.sourceType === 'gmail_personal' || n.sourceProvider === 'gmail') {
        gmailCount++;
      } else {
        institutionalCount++;
      }
    });

    return { total, actionCount, deadlineCount, gmailCount, institutionalCount };
  }, [monthNotices]);

  // Dynamic notice count per category for selected month
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: monthNotices.length };
    monthNotices.forEach((n) => {
      counts[n.category] = (counts[n.category] || 0) + 1;
    });
    return counts;
  }, [monthNotices]);

  // Status counts for reviewer tabs in selected month
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: monthNotices.length };
    monthNotices.forEach((n) => {
      counts[n.status] = (counts[n.status] || 0) + 1;
    });
    return counts;
  }, [monthNotices]);

  // Filtered & sorted notices for scannability in selected month
  const displayNotices = useMemo(() => {
    let result = [...monthNotices];

    // Source type filter
    if (sourceTypeFilter === 'institutional') {
      result = result.filter(
        (n) => n.sourceType === 'institutional' || (!n.sourceType && n.sourceProvider !== 'gmail'),
      );
    } else if (sourceTypeFilter === 'gmail_personal') {
      result = result.filter((n) => n.sourceType === 'gmail_personal' || n.sourceProvider === 'gmail');
    }

    // Action / Deadline quick filter
    if (actionFilter === 'action_required') {
      result = result.filter((n) => Boolean(n.actionRequired && n.actionRequired.trim()));
    } else if (actionFilter === 'has_deadline') {
      result = result.filter((n) => Boolean(n.importantDates && n.importantDates.length > 0));
    } else if (actionFilter === 'unconverted') {
      result = result.filter((n) => !n.isConverted);
    }

    // Sort order
    if (sortBy === 'deadline') {
      result.sort((a, b) => {
        const getFirstDeadlineDays = (n: Notice) => {
          const dateObj = n.importantDates?.find((d) => isValidDateString(d.date));
          if (dateObj) return daysUntil(dateObj.date);
          return Infinity;
        };
        return getFirstDeadlineDays(a) - getFirstDeadlineDays(b);
      });
    } else {
      // Newest first by default
      result.sort((a, b) => {
        const dateA = new Date(a.sourceReceivedAt || a.publishedAt || a.createdAt).getTime() || 0;
        const dateB = new Date(b.sourceReceivedAt || b.publishedAt || b.createdAt).getTime() || 0;
        return dateB - dateA;
      });
    }

    return result;
  }, [monthNotices, sourceTypeFilter, actionFilter, sortBy]);

  const handleAddToTask = (notice: Notice) => {
    const proposal = proposeTaskFromNotice(notice);
    setTaskProposal(proposal);
    setIsTaskModalOpen(true);
  };

  const handleEditClick = (notice: Notice) => {
    setEditingNotice(notice);
    setIsEditOpen(true);
  };

  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gmailMessageIdInput.trim()) return;
    setIsIngesting(true);
    setIngestStatus(null);
    try {
      const created = await ingestFromGmail(gmailMessageIdInput.trim());
      setIngestStatus({ success: `Imported as pending notice: "${created.title}"` });
      setGmailMessageIdInput('');
    } catch (err: unknown) {
      setIngestStatus({ error: err instanceof Error ? err.message : 'Ingestion failed' });
    } finally {
      setIsIngesting(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedMonth(currentMonthKey);
    setFilters({ status: 'all', category: 'all', priority: 'all', search: '', month: currentMonthKey });
    setSourceTypeFilter('all');
    setActionFilter('all');
    setSortBy('newest');
  };

  const isAnyFilterActive =
    (filters.search && filters.search.trim() !== '') ||
    (filters.category && filters.category !== 'all') ||
    (filters.priority && filters.priority !== 'all') ||
    sourceTypeFilter !== 'all' ||
    actionFilter !== 'all' ||
    sortBy !== 'newest' ||
    !isCurrentMonth;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden pb-12">
      {/* 1. Header & Telemetry Strip */}
      <header className="space-y-4 pt-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-sans-display text-[32px] sm:text-[36px] font-bold tracking-tight text-slate-900 leading-tight">
                Notice Board
              </h1>
              {!isLoading && !error && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-900 text-white">
                  {monthStats.total} {monthStats.total === 1 ? 'Notice' : 'Notices'}
                </span>
              )}
              {isReviewer && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/15 text-amber-800 border border-amber-500/30">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Reviewer Mode
                </span>
              )}
            </div>
            <p className="mt-1 font-reading text-sm text-slate-600 max-w-2xl">
              Official university circulars, academic notices, exam announcements, and synced Gmail bulletins.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="secondary"
              size="md"
              onClick={() => refresh()}
              leftIcon={<RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />}
              className="cf-neumorph-control"
            >
              Refresh Feed
            </Button>
          </div>
        </div>

        {/* Month Selector & Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200/70">
          {/* Month Stepper & Dropdown */}
          <div className="flex items-center gap-1.5" ref={monthDropdownRef}>
            {/* Previous Month Button */}
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
              aria-label="Previous month"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Dropdown Menu Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMonthDropdownOpen((prev) => !prev)}
                className="flex h-9 items-center gap-2 rounded-xl border-2 border-slate-900 bg-white px-3.5 text-sm font-bold text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                aria-expanded={isMonthDropdownOpen}
                aria-haspopup="listbox"
                aria-label={`Select month, currently ${formatMonthDisplay(selectedMonth)}`}
              >
                <Calendar className="h-4 w-4 text-slate-700" />
                <span className="font-sans">{formatMonthDisplay(selectedMonth)}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-150 ${isMonthDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Popover */}
              <AnimatePresence>
                {isMonthDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border-2 border-slate-900 bg-white p-1.5 shadow-[4px_4px_0px_#0f172a] cf-glass-panel"
                    role="listbox"
                    aria-label="Selectable months"
                  >
                    <div className="px-2.5 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                      Browse Notice Archive
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                      {availableMonths.map((m) => {
                        const isSelected = m === selectedMonth;
                        const isCurrent = m === currentMonthKey;
                        const count = noticeCountByMonth[m] || 0;

                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setSelectedMonth(m);
                              setIsMonthDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 text-white font-bold'
                                : 'text-slate-800 hover:bg-slate-100'
                            }`}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-sans">{formatMonthDisplay(m)}</span>
                              {isCurrent && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold uppercase ${
                                    isSelected
                                      ? 'bg-white/20 text-white'
                                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  Current
                                </span>
                              )}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : count > 0
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Next Month Button (Disabled on Current Month) */}
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={!canGoNext}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-all ${
                canGoNext
                  ? 'border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer'
                  : 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed shadow-none opacity-60'
              }`}
              aria-label="Next month"
              title={canGoNext ? 'Next month' : 'Cannot navigate into future months'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Month Status Badge or Return to Current Month Action */}
          <div className="flex items-center gap-2">
            {isCurrentMonth ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-50/80 text-xs font-mono font-semibold text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>CURRENT MONTH // LIVE FEED</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-mono text-amber-800">
                  <span>ARCHIVE // {formatMonthDisplay(selectedMonth).toUpperCase()}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(currentMonthKey)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-slate-900 bg-slate-900 text-white text-xs font-bold font-mono shadow-[2px_2px_0px_#64748b] hover:bg-slate-800 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Return to {formatMonthDisplay(currentMonthKey)}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cybercore Decision-Making Telemetry Bar */}
        {!isLoading && !error && monthStats.total > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>FEED // ONLINE</span>
            </div>

            {monthStats.actionCount > 0 && (
              <button
                type="button"
                onClick={() => setActionFilter(actionFilter === 'action_required' ? 'all' : 'action_required')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  actionFilter === 'action_required'
                    ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold shadow-inner'
                    : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>{monthStats.actionCount} ACTION REQUIRED</span>
              </button>
            )}

            {monthStats.deadlineCount > 0 && (
              <button
                type="button"
                onClick={() => setActionFilter(actionFilter === 'has_deadline' ? 'all' : 'has_deadline')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  actionFilter === 'has_deadline'
                    ? 'bg-blue-100 border-blue-300 text-blue-900 font-bold shadow-inner'
                    : 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>{monthStats.deadlineCount} WITH DEADLINES</span>
              </button>
            )}

            <div className="ml-auto text-slate-500 text-xs hidden sm:inline-flex items-center gap-3">
              <span>INSTITUTIONAL: <strong className="text-slate-800">{monthStats.institutionalCount}</strong></span>
              <span>•</span>
              <span>GMAIL SYNC: <strong className="text-slate-800">{monthStats.gmailCount}</strong></span>
            </div>
          </div>
        )}
      </header>

      {/* 2. Task Conversion Notification Banner */}
      {taskSuccessBanner && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center justify-between shadow-xs">
          <span className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-emerald-600" />
            {taskSuccessBanner}
          </span>
          <button
            type="button"
            onClick={() => setTaskSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold p-1 cursor-pointer"
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Reviewer Quick Ingest Bar (Only for Reviewers) */}
      {isReviewer && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono text-amber-800 uppercase tracking-wider flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              Reviewer Ingest: Gmail → Pending Notice
            </span>
          </div>

          <form onSubmit={handleIngestSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={gmailMessageIdInput}
              onChange={(e) => setGmailMessageIdInput(e.target.value)}
              placeholder="Paste Gmail Message ID (e.g. 18f...)"
              className="flex-1 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
              disabled={isIngesting}
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isIngesting || !gmailMessageIdInput.trim()}
              leftIcon={<Inbox className="w-4 h-4" />}
            >
              {isIngesting ? 'Ingesting...' : 'Import Notice'}
            </Button>
          </form>

          {ingestStatus?.success && (
            <p className="text-xs font-mono text-emerald-700 font-semibold">{ingestStatus.success}</p>
          )}
          {ingestStatus?.error && (
            <p className="text-xs font-mono text-rose-700 font-semibold">{ingestStatus.error}</p>
          )}
        </div>
      )}

      {/* 4. Glassmorphic Filter & Scanning Toolbar */}
      <section
        className="cf-glass-panel rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs border border-slate-200/80"
        aria-label="Notice filter and search controls"
      >
        {/* Row 1: Search Bar & Source Type Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-900 transition-colors pointer-events-none" />
            <input
              type="text"
              placeholder="Search notices by title, keywords, course, venue, audience..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="h-10 w-full rounded-xl pl-10 pr-10 text-sm border border-slate-200 bg-white/90 text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:border-slate-900 outline-none transition-all"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => setFilters({ ...filters, search: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Source Type Filter (Subtle Neumorphic Segmented Control) */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 border border-slate-200/80 shrink-0 self-start sm:self-auto"
            role="radiogroup"
            aria-label="Filter by notice source"
          >
            <button
              type="button"
              onClick={() => setSourceTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                sourceTypeFilter === 'all'
                  ? 'cf-neumorph-pill-active'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              role="radio"
              aria-checked={sourceTypeFilter === 'all'}
            >
              ALL SOURCES
            </button>

            <button
              type="button"
              onClick={() => setSourceTypeFilter('institutional')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                sourceTypeFilter === 'institutional'
                  ? 'cf-neumorph-pill-active'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              role="radio"
              aria-checked={sourceTypeFilter === 'institutional'}
            >
              <Building2 className="w-3 h-3" />
              INSTITUTIONAL
            </button>

            <button
              type="button"
              onClick={() => setSourceTypeFilter('gmail_personal')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                sourceTypeFilter === 'gmail_personal'
                  ? 'cf-neumorph-pill-active'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              role="radio"
              aria-checked={sourceTypeFilter === 'gmail_personal'}
            >
              <Mail className="w-3 h-3" />
              GMAIL SYNC
            </button>
          </div>
        </div>

        {/* Row 2: Reviewer Status Tabs (Only when Reviewer) */}
        {isReviewer && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar pt-1 border-t border-slate-200/60">
            <span className="text-xs font-mono font-bold text-amber-800 uppercase tracking-wider shrink-0 mr-1">
              STATUS:
            </span>
            {STATUS_TABS.map((tab) => {
              const active = (filters.status || 'all') === tab.value;
              const count = statusCounts[tab.value] ?? 0;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setFilters({ ...filters, status: tab.value });
                    setSearchParams(tab.value === 'all' ? {} : { tab: tab.value });
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-all cursor-pointer border ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900 font-bold shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-xs ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Row 3: Category Hierarchy Pills */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
              CATEGORIES // FILTER
            </span>

            {isAnyFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-slate-900 transition-colors cursor-pointer underline"
              >
                <RotateCcw className="w-3 h-3" />
                Reset filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 hide-scrollbar -mx-1 px-1">
            {CATEGORIES.map((cat) => {
              const active = (filters.category || 'all') === cat.value;
              const count = categoryCounts[cat.value] || 0;

              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setFilters({ ...filters, category: cat.value })}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm whitespace-nowrap cursor-pointer transition-all ${
                    active
                      ? 'cf-neumorph-pill-active'
                      : 'cf-neumorph-pill text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <span>{cat.label}</span>
                  {count > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-xs font-mono font-semibold ${
                        active ? 'bg-slate-900 text-white' : 'bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 4: Priority & Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60 text-xs sm:text-sm">
          {/* Action Quick Toggles */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider mr-1">
              FOCUS:
            </span>
            <button
              type="button"
              onClick={() => setActionFilter('all')}
              className={`px-2.5 py-1 rounded-md font-mono transition-all cursor-pointer ${
                actionFilter === 'all'
                  ? 'bg-slate-200 text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ALL
            </button>
            <button
              type="button"
              onClick={() => setActionFilter(actionFilter === 'action_required' ? 'all' : 'action_required')}
              className={`px-2.5 py-1 rounded-md font-mono transition-all cursor-pointer ${
                actionFilter === 'action_required'
                  ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ACTION REQUIRED
            </button>
            <button
              type="button"
              onClick={() => setActionFilter(actionFilter === 'has_deadline' ? 'all' : 'has_deadline')}
              className={`px-2.5 py-1 rounded-md font-mono transition-all cursor-pointer ${
                actionFilter === 'has_deadline'
                  ? 'bg-blue-100 text-blue-900 font-bold border border-blue-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              WITH DEADLINES
            </button>
            <button
              type="button"
              onClick={() => setActionFilter(actionFilter === 'unconverted' ? 'all' : 'unconverted')}
              className={`px-2.5 py-1 rounded-md font-mono transition-all cursor-pointer ${
                actionFilter === 'unconverted'
                  ? 'bg-slate-200 text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              PENDING TASK
            </button>
          </div>

          {/* Priority & Sort Selector */}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            {/* Priority Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                PRIORITY:
              </span>
              <select
                value={filters.priority || 'all'}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value as NoticePriority | 'all' })}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'deadline')}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <option value="newest">Newest Received</option>
                <option value="deadline">Nearest Deadline</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Filter Results Summary Counter */}
      <div className="flex items-center justify-between text-xs sm:text-sm font-mono text-slate-500 px-1">
        <span>
          Showing <strong className="text-slate-900">{displayNotices.length}</strong> of{' '}
          <strong className="text-slate-900">{monthStats.total}</strong> notices for{' '}
          <strong className="text-slate-900">{formatMonthDisplay(selectedMonth)}</strong>
        </span>
        {isAnyFilterActive && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
            Filtered View Active
          </span>
        )}
      </div>

      {/* 6. Error State */}
      {error && !isLoading && (
        <div className="flex flex-col items-center rounded-2xl border border-red-500/20 bg-red-50 p-10 text-center">
          <EmptyState
            icon={<AlertCircle className="h-7 w-7 text-red-600" />}
            title="Couldn't load campus notices"
            description={error}
            action={
              <Button variant="secondary" onClick={() => refresh()} leftIcon={<RefreshCw className="h-4 w-4" />}>
                Retry Loading
              </Button>
            }
          />
        </div>
      )}

      {/* 7. Loading State */}
      {isLoading && <NoticeCardSkeleton count={4} />}

      {/* 8. Empty States */}
      {!isLoading && !error && displayNotices.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-12 text-center cf-glass-panel">
          {monthNotices.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-8 w-8 text-slate-400" />}
              title={`No notices in ${formatMonthDisplay(selectedMonth)}`}
              description={`There are no circulars or notices recorded for this month. Try browsing another month or return to ${formatMonthDisplay(currentMonthKey)}.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => setSelectedMonth(currentMonthKey)}
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                >
                  Return to {formatMonthDisplay(currentMonthKey)}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Bell className="h-8 w-8 text-slate-400" />}
              title="No notices match your criteria"
              description={
                isAnyFilterActive
                  ? `Try adjusting your search terms, clearing selected categories, or resetting filters for ${formatMonthDisplay(selectedMonth)}.`
                  : `The notice board is currently clear for ${formatMonthDisplay(selectedMonth)}.`
              }
              action={
                isAnyFilterActive ? (
                  <Button variant="secondary" onClick={handleResetFilters} leftIcon={<RotateCcw className="h-4 w-4" />}>
                    Reset All Filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      )}

      {/* 9. Notices Responsive Grid */}
      {!isLoading && !error && displayNotices.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" role="feed" aria-label="Campus notices stream">
          {displayNotices.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              isReviewer={isReviewer}
              onApprove={approveNotice}
              onPublish={publishNotice}
              onReject={rejectNotice}
              onArchive={archiveNotice}
              onEdit={handleEditClick}
              onDelete={deleteNotice}
              onAddToTask={handleAddToTask}
            />
          ))}
        </div>
      )}

      {/* 10. Notice -> Task Conversion Modal */}
      <AddToTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskProposal(null);
        }}
        proposal={taskProposal}
        onConfirm={async (taskData) => {
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
          setTaskSuccessBanner(`Converted "${taskData.title}" into a personal task!`);
          setTimeout(() => setTaskSuccessBanner(null), 4500);
        }}
        courses={courses}
      />

      {/* 11. Reviewer Edit Modal */}
      <NoticeEditModal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingNotice(null);
        }}
        notice={editingNotice}
        onSave={async (id, updates) => {
          await updateNotice(id, updates);
        }}
      />
    </div>
  );
};

export default NoticeBoard;
