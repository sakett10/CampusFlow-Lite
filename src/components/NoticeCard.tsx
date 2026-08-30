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
} from 'lucide-react';
import type { Notice, NoticeCategory, NoticePriority, NoticeStatus } from '../lib/types';
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
}

const CATEGORY_STYLES: Record<NoticeCategory, { label: string; bg: string; text: string; border: string }> = {
  academic: { label: 'Academic', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  exam: { label: 'Examination', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
  assignment: { label: 'Assignment', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  administrative: { label: 'Administrative', bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  event: { label: 'Event', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  placement: { label: 'Placement', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  admission: { label: 'Admission', bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  hostel: { label: 'Hostel', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  fee: { label: 'Fee & Payment', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  scholarship: { label: 'Scholarship', bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30' },
  alert: { label: 'Urgent Alert', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/40' },
  general: { label: 'General', bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' },
};

const PRIORITY_BADGES: Record<NoticePriority, { label: string; variant: 'danger' | 'warning' | 'neutral' | 'brand' }> = {
  urgent: { label: 'Urgent', variant: 'danger' },
  important: { label: 'Important', variant: 'warning' },
  normal: { label: 'Normal', variant: 'neutral' },
  low: { label: 'Low', variant: 'neutral' },
};

const STATUS_BADGES: Record<NoticeStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending Review', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  approved: { label: 'Approved', bg: 'bg-sky-500/15', text: 'text-sky-400' },
  published: { label: 'Published', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  rejected: { label: 'Rejected', bg: 'bg-rose-500/15', text: 'text-rose-400' },
  archived: { label: 'Archived', bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
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
}) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const catStyle = CATEGORY_STYLES[notice.category] || CATEGORY_STYLES.general;
  const priBadge = PRIORITY_BADGES[notice.priority] || PRIORITY_BADGES.normal;
  const statBadge = STATUS_BADGES[notice.status] || STATUS_BADGES.published;


  return (
    <Card
      padding="lg"
      className="flex flex-col gap-4 border-[var(--cf-border)] hover:border-[var(--cf-border-strong)] transition-all bg-[var(--cf-surface)] shadow-[var(--cf-elev-1)] hover:shadow-[var(--cf-elev-2)] rounded-2xl relative overflow-hidden"
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
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-400">Action Required</span>
              <p className="text-xs text-[var(--cf-text)] mt-0.5">{notice.actionRequired}</p>
            </div>
          </div>
        )}

        {/* Important Dates */}
        {notice.importantDates && notice.importantDates.length > 0 && (
          <div className="space-y-1.5 rounded-xl bg-[var(--cf-surface-muted)] p-2.5 border border-[var(--cf-border-subtle)]">
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

      {/* Links & Documents Action Area */}
      {((notice.links && notice.links.length > 0) || (notice.documents && notice.documents.length > 0)) && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--cf-border-subtle)]">
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
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>
              {notice.publishedAt
                ? new Date(notice.publishedAt).toLocaleDateString()
                : new Date(notice.createdAt).toLocaleDateString()}
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
