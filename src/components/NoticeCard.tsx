import React from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertTriangle,
  ExternalLink,
  FileText,
  CheckCircle2,
  Send,
  XCircle,
  Archive,
  Edit2,
  Trash2,
  ShieldAlert,
  CheckSquare,
} from 'lucide-react';
import type { Notice, NoticeCategory, NoticePriority, NoticeStatus } from '../lib/types';
import { formatNoticeDate, formatEmailTimestamp } from '../lib/dateUtils';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface NoticeCardProps {
  notice: Notice;
  isReviewer?: boolean;
  onApprove?: (id: string) => void;
  onPublish?: (id: string) => void;
  onReject?: (id: string) => void;
  onArchive?: (id: string) => void;
  onEdit?: (notice: Notice) => void;
  onDelete?: (id: string) => void;
  onAddToTask?: (notice: Notice) => void;
}

const CATEGORY_STYLES: Record<NoticeCategory, { label: string; bg: string; text: string; border: string }> = {
  academic: { label: 'Academic', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  exam: { label: 'Examination', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  assignment: { label: 'Assignment', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  administrative: { label: 'Administrative', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  event: { label: 'Event', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  placement: { label: 'Placement', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  admission: { label: 'Admission', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  hostel: { label: 'Hostel', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  fee: { label: 'Fee & Payment', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  scholarship: { label: 'Scholarship', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  alert: { label: 'Urgent Alert', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
  general: { label: 'General', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
};

const PRIORITY_BADGES: Record<NoticePriority, { label: string; variant: 'danger' | 'warning' | 'neutral' | 'brand' }> = {
  urgent: { label: 'Urgent', variant: 'danger' },
  important: { label: 'Important', variant: 'warning' },
  normal: { label: 'Normal', variant: 'neutral' },
  low: { label: 'Low', variant: 'neutral' },
};

const STATUS_BADGES: Record<NoticeStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending Review', bg: 'bg-amber-50', text: 'text-amber-800' },
  approved: { label: 'Approved', bg: 'bg-slate-100', text: 'text-slate-700' },
  published: { label: 'Published', bg: 'bg-emerald-50', text: 'text-emerald-800' },
  rejected: { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-800' },
  archived: { label: 'Archived', bg: 'bg-slate-100', text: 'text-slate-600' },
};

function getSmartLinkButtonLabel(label: string, url: string): string {
  const lower = (label + ' ' + url).toLowerCase();
  if (lower.includes('vtop')) return 'Open VTOP';
  if (lower.includes('register') || lower.includes('devfolio') || lower.includes('unstop')) return 'Register Now';
  if (lower.includes('apply') || lower.includes('form') || lower.includes('portal')) return 'Apply Online';
  if (label && label !== 'Link' && label.length < 25) return label;
  return 'Open Link';
}

export const NoticeCard: React.FC<NoticeCardProps> = ({
  notice,
  isReviewer = false,
  onApprove,
  onPublish,
  onReject,
  onArchive,
  onEdit,
  onDelete,
  onAddToTask,
}) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const catStyle = CATEGORY_STYLES[notice.category] || CATEGORY_STYLES.general;
  const priBadge = PRIORITY_BADGES[notice.priority] || PRIORITY_BADGES.normal;
  const statBadge = STATUS_BADGES[notice.status] || STATUS_BADGES.published;

  return (
    <Card
      padding="lg"
      className="flex flex-col gap-4 border-[var(--cf-border)] hover:border-[var(--cf-border-strong)] transition-all bg-[var(--cf-surface)] shadow-[var(--cf-elev-1)] hover:shadow-xs rounded-xl relative overflow-hidden"
    >
      {/* Category & Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cf-border-subtle)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono tracking-wider border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
          >
            {catStyle.label}
          </span>
          <Badge variant={priBadge.variant} className="text-[11px] font-semibold">
            {priBadge.label}
          </Badge>
          {notice.isConverted && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckSquare className="w-3 h-3 text-emerald-600" />
              Converted to Task
            </span>
          )}
        </div>

        {isReviewer && (
          <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold ${statBadge.bg} ${statBadge.text}`}>
            {statBadge.label}
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="space-y-2">
        <h3 className="font-sans-display text-base sm:text-lg font-bold text-[var(--cf-text)] leading-snug">
          {notice.title}
        </h3>
        <p className="font-reading text-xs sm:text-sm text-[var(--cf-text-secondary)] leading-relaxed">
          {notice.summary}
        </p>
      </div>

      {/* Conditional Information Sections */}
      <div className="space-y-2.5 pt-1 text-xs">
        {/* Audience */}
        {notice.audience && (
          <div className="flex items-center gap-2 text-[var(--cf-text-secondary)]">
            <Users className="w-3.5 h-3.5 text-[var(--cf-text-tertiary)] shrink-0" />
            <span className="font-medium text-[var(--cf-text)]">Audience:</span>
            <span>{notice.audience}</span>
          </div>
        )}

        {/* Action Required */}
        {notice.actionRequired && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-800">Action Required</span>
              <p className="text-xs text-amber-950 mt-0.5 font-medium">{notice.actionRequired}</p>
            </div>
          </div>
        )}

        {/* Important Dates */}
        {notice.importantDates && notice.importantDates.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-[var(--cf-surface-muted)] p-2.5 border border-[var(--cf-border-subtle)]">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[var(--cf-text-secondary)] uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-[var(--cf-brand)]" />
              Important Dates
            </span>
            <div className="space-y-1 pl-1">
              {notice.importantDates.map((d, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-[var(--cf-text-secondary)]">{d.label}</span>
                  <span className="font-mono font-semibold text-[var(--cf-text)]">{d.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Venue */}
        {notice.venue && (
          <div className="flex items-center gap-2 text-[var(--cf-text-secondary)]">
            <MapPin className="w-3.5 h-3.5 text-[var(--cf-text-tertiary)] shrink-0" />
            <span className="font-medium text-[var(--cf-text)]">Venue:</span>
            <span>{notice.venue}</span>
          </div>
        )}
      </div>

      {/* Links & Documents / Task Action Area */}
      {((notice.links && notice.links.length > 0) || (notice.documents && notice.documents.length > 0) || !!onAddToTask) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--cf-border-subtle)]">
          {onAddToTask && (
            <button
              type="button"
              onClick={() => onAddToTask(notice)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--cf-brand)] text-white hover:bg-[var(--cf-brand-hover)] transition-all text-xs font-semibold cursor-pointer shadow-xs"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Add to Tasks
            </button>
          )}
          {notice.links?.map((link, idx) => (
            <a
              key={`link-${idx}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--cf-brand-subtle)] border border-[var(--cf-brand)]/20 text-[var(--cf-brand)] hover:bg-[var(--cf-brand)] hover:text-white transition-all text-xs font-semibold"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {getSmartLinkButtonLabel(link.label, link.url)}
            </a>
          ))}

          {notice.documents?.map((doc, idx) => (
            <a
              key={`doc-${idx}`}
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--cf-surface-muted)] border border-[var(--cf-border-subtle)] text-[var(--cf-text)] hover:border-[var(--cf-brand)] transition-all text-xs font-semibold"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--cf-brand)]" />
              {doc.label || 'View Document'}
            </a>
          ))}
        </div>
      )}

      {/* Source Metadata & Traceability */}
      <div className="mt-auto pt-3 border-t border-[var(--cf-border-subtle)] flex flex-col gap-1.5 text-[10px] font-mono text-[var(--cf-text-tertiary)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>Source: {notice.sourceProvider === 'gmail' ? 'Verified University Gmail' : notice.sourceProvider}</span>
            {notice.sourceSender && <span className="hidden sm:inline">({notice.sourceSender})</span>}
          </div>
          <div
            className="flex items-center gap-1"
            title={notice.sourceReceivedAt ? `Received: ${formatEmailTimestamp(notice.sourceReceivedAt)}` : undefined}
          >
            <Clock className="w-3 h-3" />
            <span>
              {formatNoticeDate(notice.sourceReceivedAt || notice.publishedAt || notice.createdAt)}
            </span>
          </div>
        </div>

        {/* Extended Provenance for Reviewers */}
        {isReviewer && (
          <div className="rounded-lg bg-[var(--cf-surface-muted)] p-2 border border-[var(--cf-border-subtle)] space-y-0.5 text-[10px]">
            {notice.sourceAccountEmail && (
              <div>
                <span className="text-[var(--cf-text-secondary)] font-semibold">Account:</span> {notice.sourceAccountEmail}
              </div>
            )}
            {notice.sourceMessageId && (
              <div>
                <span className="text-[var(--cf-text-secondary)] font-semibold">Message ID:</span> {notice.sourceMessageId}
              </div>
            )}
            {notice.sourceSubject && (
              <div className="truncate">
                <span className="text-[var(--cf-text-secondary)] font-semibold">Subject:</span> {notice.sourceSubject}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Student Action Bar: Convert to Task */}
      {(onAddToTask || notice.isConverted) && (
        <div className="pt-2 flex items-center justify-between gap-2 border-t border-[var(--cf-border-subtle)]">
          {notice.isConverted ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50/80 px-3 py-1.5 rounded-xl border border-emerald-200/60">
              <CheckSquare className="w-4 h-4 text-emerald-600" />
              <span>Converted to Task</span>
            </div>
          ) : (
            onAddToTask && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAddToTask(notice)}
                leftIcon={<CheckSquare className="w-3.5 h-3.5 text-[var(--cf-brand)]" />}
                className="hover:border-[var(--cf-brand)] hover:text-[var(--cf-brand)] text-xs font-medium"
              >
                Convert to Task
              </Button>
            )
          )}
        </div>
      )}

      {/* Reviewer Action Bar (Only rendered for authorized reviewers) */}
      {isReviewer && (
        <div className="pt-3 border-t border-amber-500/20 bg-amber-500/5 -mx-6 -mb-6 p-4 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-mono font-bold text-amber-400">Review Controls:</span>
          </div>


          <div className="flex flex-wrap items-center gap-1.5">
            {notice.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onApprove?.(notice.id)}
                  leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onReject?.(notice.id)}
                  leftIcon={<XCircle className="w-3.5 h-3.5" />}
                >
                  Reject
                </Button>
              </>
            )}

            {notice.status === 'approved' && (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onPublish?.(notice.id)}
                  leftIcon={<Send className="w-3.5 h-3.5" />}
                >
                  Publish
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onReject?.(notice.id)}
                  leftIcon={<XCircle className="w-3.5 h-3.5" />}
                >
                  Reject
                </Button>
              </>
            )}

            {notice.status === 'published' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onArchive?.(notice.id)}
                leftIcon={<Archive className="w-3.5 h-3.5" />}
              >
                Archive
              </Button>
            )}

            {notice.status === 'rejected' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onArchive?.(notice.id)}
                leftIcon={<Archive className="w-3.5 h-3.5" />}
              >
                Archive
              </Button>
            )}

            {notice.status !== 'archived' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onEdit?.(notice)}
                leftIcon={<Edit2 className="w-3.5 h-3.5" />}
              >
                Edit
              </Button>
            )}

            {isConfirmingDelete ? (
              <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-2 py-1 rounded-lg">
                <span className="text-xs text-rose-300 font-medium mr-1">Delete notice?</span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setIsConfirmingDelete(false);
                    onDelete?.(notice.id);
                  }}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsConfirmingDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setIsConfirmingDelete(true)}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>

  );
};

export default NoticeCard;
