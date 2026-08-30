import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  Search,
  X,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Inbox,
  ShieldCheck,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { Notice, NoticeCategory, NoticePriority, NoticeStatus } from '../lib/types';
import { useNotices } from '../hooks/useNotices';
import NoticeCard from '../components/NoticeCard';
import NoticeEditModal from '../components/NoticeEditModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

const CATEGORIES: { value: NoticeCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'academic', label: 'Academic' },
  { value: 'exam', label: 'Exams' },
  { value: 'assignment', label: 'Assignments' },
  { value: 'placement', label: 'Placements' },
  { value: 'event', label: 'Events' },
  { value: 'administrative', label: 'Admin' },
  { value: 'fee', label: 'Fees' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'scholarship', label: 'Scholarships' },
  { value: 'alert', label: 'Alerts' },
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
  } = useNotices();

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

  // Status counts for reviewer tabs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: notices.length };
    notices.forEach((n) => {
      counts[n.status] = (counts[n.status] || 0) + 1;
    });
    return counts;
  }, [notices]);


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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden pb-12"
    >
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-sans-display text-[length:var(--cf-text-display-size)] leading-tight font-bold tracking-tight text-[var(--cf-text)]">
              Campus Bulletin
            </h1>
            {!isLoading && !error && (
              <Badge variant="brand" className="px-2.5 py-0.5 text-[length:var(--cf-text-micro-size)] font-mono-meta font-semibold">
                {notices.length} {notices.length === 1 ? 'Notice' : 'Notices'}
              </Badge>
            )}
            {isReviewer && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Reviewer Mode
              </span>
            )}
          </div>
          <p className="mt-1 font-reading text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)] max-w-2xl">
            Official university notices, examination schedules, placement drives, and administrative circulars.
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          onClick={() => refresh()}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Refresh
        </Button>
      </header>

      {/* Reviewer Quick Ingest Bar (Only for Reviewers) */}
      {isReviewer && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Reviewer Ingest: Gmail → Pending Notice
            </span>
          </div>

          <form onSubmit={handleIngestSubmit} className="flex flex-col sm:flex-row gap-2">
            <Input
              value={gmailMessageIdInput}
              onChange={(e) => setGmailMessageIdInput(e.target.value)}
              placeholder="Paste Gmail Message ID (e.g. 18f...)"
              className="flex-1 text-xs"
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
            <p className="text-xs font-mono text-emerald-400">{ingestStatus.success}</p>
          )}
          {ingestStatus?.error && (
            <p className="text-xs font-mono text-rose-400">{ingestStatus.error}</p>
          )}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative group max-w-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cf-text-tertiary)] group-focus-within:text-[var(--cf-brand)] transition-colors pointer-events-none" />
          <Input
            type="text"
            placeholder="Search notices, audience, venue, keywords..."
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="h-11 w-full rounded-xl pl-10 pr-10 text-sm shadow-sm border border-[var(--cf-border)] bg-[var(--cf-surface)] transition-all"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters({ ...filters, search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--cf-surface-muted)] text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Reviewer Status Tabs */}
        {isReviewer && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
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
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all border ${

                    active
                      ? 'bg-[var(--cf-brand)] text-white border-[var(--cf-brand)] shadow-sm'
                      : 'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] border-[var(--cf-border-subtle)] hover:text-[var(--cf-text)]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-[var(--cf-surface)] text-[var(--cf-text-tertiary)]'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Category & Priority Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cf-border-subtle)] pb-3">
          {/* Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar -mx-1 px-1">
            {CATEGORIES.map((cat) => {
              const active = (filters.category || 'all') === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setFilters({ ...filters, category: cat.value })}
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                    active
                      ? 'bg-[var(--cf-brand)] text-white border-[var(--cf-brand)]'
                      : 'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] border-[var(--cf-border-subtle)] hover:text-[var(--cf-text)]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Priority dropdown */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <span className="text-xs font-semibold text-[var(--cf-text-tertiary)] uppercase tracking-wider font-mono">
              Priority:
            </span>
            <select
              value={filters.priority || 'all'}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value as NoticePriority | 'all' })}
              className="h-8 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] px-2.5 text-xs font-medium text-[var(--cf-text)] focus:border-[var(--cf-brand)] focus:outline-none"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex flex-col items-center rounded-2xl border border-red-500/20 bg-red-500/10 p-10 text-center">
          <EmptyState
            icon={<AlertCircle className="h-7 w-7 text-red-400" />}
            title="Couldn't load campus notices"
            description={error}
            action={
              <Button variant="secondary" onClick={() => refresh()} leftIcon={<RefreshCw className="h-4 w-4" />}>
                Retry
              </Button>
            }
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty states */}
      {!isLoading && !error && notices.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--cf-border-strong)] bg-[var(--cf-surface)] p-12 text-center">
          <EmptyState
            icon={<Bell className="h-8 w-8 text-[var(--cf-brand)]" />}
            title="No notices found"
            description={
              filters.search || (filters.category && filters.category !== 'all')
                ? 'Try adjusting your filters or search terms.'
                : 'The campus bulletin is currently clear. New official circulars and updates will appear here.'
            }
            action={
              (filters.search || (filters.category && filters.category !== 'all')) ? (
                <Button
                  variant="secondary"
                  onClick={() => setFilters({ status: 'all', category: 'all', priority: 'all', search: '' })}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Notices Grid */}
      {!isLoading && !error && notices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notices.map((notice) => (
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
            />
          ))}
        </div>
      )}

      {/* Reviewer Edit Modal */}
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
    </motion.div>
  );
};

export default NoticeBoard;
