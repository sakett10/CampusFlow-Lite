import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
  Building2,
  Mail,
  ArrowRight,
  Image as ImageIcon,
  Loader2,
  Eye,
} from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import type { Notice, NoticeCategory, NoticePriority, NoticeStatus, NoticeAttachment } from '../lib/types';
import { ImagePreviewModal } from './ImagePreviewModal';
import { formatFileSize } from '../lib/attachmentUtils';
import {
  formatNoticeDate,
  formatEmailTimestamp,
  formatDueDate,
  daysUntil,
  isValidDateString,
} from '../lib/dateUtils';
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

const CATEGORY_CONFIG: Record<NoticeCategory, { label: string; badge: string }> = {
  academic: { label: 'ACADEMIC', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  exam: { label: 'EXAMINATION', badge: 'bg-rose-50 text-rose-800 border-rose-200' },
  assignment: { label: 'ASSIGNMENT', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  administrative: { label: 'ADMIN', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  event: { label: 'EVENT', badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  placement: { label: 'PLACEMENT', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  admission: { label: 'ADMISSION', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  hostel: { label: 'HOSTEL', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  fee: { label: 'FEES', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  scholarship: { label: 'SCHOLARSHIP', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  alert: { label: 'URGENT ALERT', badge: 'bg-rose-100 text-rose-900 border-rose-300 font-bold' },
  general: { label: 'GENERAL', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const PRIORITY_CONFIG: Record<
  NoticePriority,
  { label: string; dot: string; text: string; bg: string; border: string }
> = {
  urgent: {
    label: 'URGENT',
    dot: 'bg-rose-600 animate-pulse',
    text: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
  important: {
    label: 'IMPORTANT',
    dot: 'bg-amber-500',
    text: 'text-amber-800',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  normal: {
    label: 'NORMAL',
    dot: 'bg-slate-400',
    text: 'text-slate-700',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
  },
  low: {
    label: 'LOW',
    dot: 'bg-slate-300',
    text: 'text-slate-500',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
  },
};

const STATUS_CONFIG: Record<NoticeStatus, { label: string; bg: string; text: string; border: string }> = {
  pending: { label: 'PENDING REVIEW', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  approved: { label: 'APPROVED', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  published: { label: 'PUBLISHED', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  rejected: { label: 'REJECTED', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
  archived: { label: 'ARCHIVED', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
};

function getSmartLinkButtonLabel(label: string, url: string): string {
  const lower = `${label} ${url}`.toLowerCase();
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
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [showExtendedProvenance, setShowExtendedProvenance] = useState(false);

  const { getToken } = useAuth();
  const [previewImage, setPreviewImage] = useState<{ url: string; filename: string; sizeBytes?: number } | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const handleOpenPdf = async (att: NoticeAttachment) => {
    setAttachmentError(null);
    setLoadingAttachmentId(att.id);

    // Synchronously open a blank window within user gesture context to prevent popup blockers
    const popupWindow = window.open('about:blank', '_blank');

    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/notices/${notice.id}/attachments/${att.id}`, { headers });
      if (!res.ok) {
        if (popupWindow) popupWindow.close();
        setAttachmentError('Unable to open attachment. Please try again.');
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (popupWindow) {
        popupWindow.location.href = blobUrl;
      } else {
        window.open(blobUrl, '_blank');
      }
    } catch {
      if (popupWindow) popupWindow.close();
      setAttachmentError('Failed to load attachment. Please check your connection.');
    } finally {
      setLoadingAttachmentId(null);
    }
  };

  const handlePreviewImage = async (att: NoticeAttachment) => {
    setAttachmentError(null);
    setLoadingAttachmentId(att.id);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/notices/${notice.id}/attachments/${att.id}`, { headers });
      if (!res.ok) {
        setAttachmentError('Unable to preview image. Please try again.');
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setPreviewImage({ url: blobUrl, filename: att.filename, sizeBytes: att.sizeBytes });
    } catch {
      setAttachmentError('Failed to load image preview. Please check your connection.');
    } finally {
      setLoadingAttachmentId(null);
    }
  };

  const handleClosePreview = () => {
    if (previewImage?.url) {
      URL.revokeObjectURL(previewImage.url);
    }
    setPreviewImage(null);
  };

  const catStyle = CATEGORY_CONFIG[notice.category] || CATEGORY_CONFIG.general;
  const priStyle = PRIORITY_CONFIG[notice.priority] || PRIORITY_CONFIG.normal;
  const statStyle = STATUS_CONFIG[notice.status] || STATUS_CONFIG.published;

  // Identify first upcoming deadline if present
  const firstDeadline = notice.importantDates?.find((d) => isValidDateString(d.date)) || notice.importantDates?.[0];
  const deadlineDays = firstDeadline && isValidDateString(firstDeadline.date) ? daysUntil(firstDeadline.date) : null;
  const isApproaching = deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 3;
  const isExpired = deadlineDays !== null && deadlineDays < 0;

  const isPersonalGmail = notice.sourceType === 'gmail_personal' || notice.sourceProvider === 'gmail';

  return (
    <article
      className="cf-glass-card rounded-2xl p-5 flex flex-col justify-between gap-4 relative overflow-hidden transition-all duration-150 focus-within:ring-2 focus-within:ring-slate-900 border border-slate-200/90"
      aria-labelledby={`notice-title-${notice.id}`}
    >
      {/* 1. Header Metadata Strip: Category, Importance, Source Telemetry */}
      <div className="space-y-2.5 border-b border-slate-200/80 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Category & Priority Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-bold tracking-wider border ${catStyle.badge}`}
            >
              {catStyle.label}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono font-semibold border ${priStyle.bg} ${priStyle.text} ${priStyle.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${priStyle.dot}`} aria-hidden="true" />
              {priStyle.label}
            </span>

            {notice.isConverted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckSquare className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                CONVERTED
              </span>
            )}
          </div>

          {/* Source Provenance Telemetry Chip */}
          <div className="flex items-center gap-2 shrink-0">
            {isPersonalGmail ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold bg-sky-50 text-sky-800 border border-sky-200"
                title={notice.sourceAccountEmail ? `Synced from ${notice.sourceAccountEmail}` : 'Gmail Personal'}
              >
                <Mail className="w-3 h-3 text-sky-600" aria-hidden="true" />
                SRC // GMAIL.PERSONAL
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                title="Institutional Broadcast"
              >
                <Building2 className="w-3 h-3 text-slate-500" aria-hidden="true" />
                SRC // INSTITUTIONAL
              </span>
            )}

            {isReviewer && (
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${statStyle.bg} ${statStyle.text} ${statStyle.border}`}
              >
                {statStyle.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Title & Description */}
      <div className="space-y-2">
        <h3 id={`notice-title-${notice.id}`} className="font-sans-display text-[17px] sm:text-[18px] font-bold text-slate-900 leading-snug">
          <Link
            to={`/notices/${notice.id}`}
            className="hover:text-blue-900 hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
          >
            {notice.title}
          </Link>
        </h3>

        <p className="font-reading text-[15px] sm:text-[15.5px] text-slate-700 leading-relaxed line-clamp-3">
          {notice.summary}
        </p>
      </div>

      {/* 3. Decision-Making Matrices: Action Required & Deadlines */}
      <div className="space-y-2.5">
        {/* High-Visibility Action Required Banner */}
        {notice.actionRequired && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-amber-950 flex items-start gap-2.5 shadow-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-900 block">
                ACTION REQUIRED
              </span>
              <p className="text-sm text-amber-950 font-medium leading-normal">
                {notice.actionRequired}
              </p>
            </div>
          </div>
        )}

        {/* Deadlines / Important Dates */}
        {firstDeadline && (
          <div
            className={`rounded-xl p-3 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm ${
              isApproaching
                ? 'bg-rose-50 border-rose-200 text-rose-950'
                : 'bg-slate-50 border-slate-200/80 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar
                className={`w-4 h-4 shrink-0 ${isApproaching ? 'text-rose-600' : 'text-slate-600'}`}
                aria-hidden="true"
              />
              <span className="font-medium text-slate-600">
                {firstDeadline.label || 'Deadline'}:
              </span>
              <span className="font-mono font-bold text-slate-900">
                {isValidDateString(firstDeadline.date) ? formatDueDate(firstDeadline.date) : firstDeadline.date}
              </span>
            </div>

            {deadlineDays !== null && (
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold whitespace-nowrap self-start sm:self-auto ${
                  isExpired
                    ? 'bg-slate-200 text-slate-600'
                    : isApproaching
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {deadlineDays === 0
                  ? 'TODAY'
                  : deadlineDays === 1
                  ? 'TOMORROW'
                  : isExpired
                  ? 'EXPIRED'
                  : `IN ${deadlineDays} DAYS`}
              </span>
            )}
          </div>
        )}

        {/* Multi-date list if multiple dates exist */}
        {notice.importantDates && notice.importantDates.length > 1 && (
          <div className="pl-2 space-y-1 text-xs sm:text-sm text-slate-600">
            {notice.importantDates.slice(1).map((d, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{d.label}:</span>
                <span className="font-mono font-medium text-slate-800">
                  {isValidDateString(d.date) ? formatDueDate(d.date) : d.date}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Audience & Venue Metadata */}
        {(notice.audience || notice.venue) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600 pt-0.5">
            {notice.audience && (
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                <span className="font-medium text-slate-500">Audience:</span>
                <span className="text-slate-800">{notice.audience}</span>
              </div>
            )}
            {notice.venue && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                <span className="font-medium text-slate-500">Venue:</span>
                <span className="text-slate-800">{notice.venue}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. External Portal Links & Attached Documents */}
      {((notice.links && notice.links.length > 0) || (notice.documents && notice.documents.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {notice.links?.map((link, idx) => (
            <a
              key={`link-${idx}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 outline-none"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              {getSmartLinkButtonLabel(link.label, link.url)}
            </a>
          ))}

          {notice.documents?.map((doc, idx) => (
            <a
              key={`doc-${idx}`}
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:border-slate-400 transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 outline-none"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              {doc.label || 'View Attachment'}
            </a>
          ))}
        </div>
      )}

      {/* 4.5 Attachments Section */}
      {notice.attachments && notice.attachments.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-200/60" data-testid="notice-attachments-section">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">
            <span>Attachments ({notice.attachments.length})</span>
          </div>

          {attachmentError && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg">
              {attachmentError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {notice.attachments.map((att) => {
              const isPdf = att.attachmentType === 'pdf' || att.mimeType === 'application/pdf';
              const isLoadingThis = loadingAttachmentId === att.id;

              return (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50/90 border border-slate-200 text-slate-800 text-xs font-medium hover:border-slate-300 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-1.5 truncate max-w-[180px] sm:max-w-[220px]">
                    {isPdf ? (
                      <FileText className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate font-semibold text-slate-800" title={att.filename}>
                      {att.filename}
                    </span>
                    <span className="text-slate-400 text-[11px] shrink-0 font-mono">
                      ({formatFileSize(att.sizeBytes)})
                    </span>
                  </div>

                  {isPdf ? (
                    <button
                      type="button"
                      onClick={() => handleOpenPdf(att)}
                      disabled={isLoadingThis}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 cursor-pointer"
                    >
                      {isLoadingThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                      )}
                      <span>Open PDF</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePreviewImage(att)}
                      disabled={isLoadingThis}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-semibold text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 cursor-pointer"
                    >
                      {isLoadingThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                      )}
                      <span>Preview</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Provenance & Telemetry Metadata */}
      <div className="mt-auto pt-3 border-t border-slate-200/80 flex flex-col gap-1.5 text-xs font-mono text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate max-w-[70%]">
            <span className="text-slate-400">SRC:</span>
            <span className="text-slate-700 truncate font-semibold">
              {notice.sourceSender || (notice.sourceProvider === 'gmail' ? 'Campus Gmail' : notice.sourceProvider)}
            </span>
          </div>

          <div
            className="flex items-center gap-1 shrink-0 text-slate-500"
            title={notice.sourceReceivedAt ? `Received: ${formatEmailTimestamp(notice.sourceReceivedAt)}` : undefined}
          >
            <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
            <span>
              {formatNoticeDate(notice.sourceReceivedAt || notice.publishedAt || notice.createdAt)}
            </span>
          </div>
        </div>

        {/* Extended Reviewer / Provenance Details Toggle */}
        {isReviewer && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowExtendedProvenance(!showExtendedProvenance)}
              className="text-xs font-mono text-slate-400 hover:text-slate-600 underline"
            >
              {showExtendedProvenance ? 'Hide Technical Metadata' : 'View Message Telemetry'}
            </button>

            {showExtendedProvenance && (
              <div className="mt-1.5 rounded-lg bg-slate-100 p-2 border border-slate-200 text-xs space-y-1 text-slate-700">
                {notice.sourceAccountEmail && (
                  <div>
                    <span className="font-bold text-slate-900">Account:</span> {notice.sourceAccountEmail}
                  </div>
                )}
                {notice.sourceMessageId && (
                  <div>
                    <span className="font-bold text-slate-900">Msg ID:</span> {notice.sourceMessageId}
                  </div>
                )}
                {notice.sourceSubject && (
                  <div className="truncate">
                    <span className="font-bold text-slate-900">Subject:</span> {notice.sourceSubject}
                  </div>
                )}
                {notice.createdByUserId && (
                  <div>
                    <span className="font-bold text-slate-900">Owner ID:</span> {notice.createdByUserId}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Action Bar: Student Convert to Task + Details Link */}
      <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
        <div>
          {notice.isConverted ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span>Converted to Task</span>
            </div>
          ) : (
            onAddToTask && (
              <button
                type="button"
                onClick={() => onAddToTask(notice)}
                className="cf-neumorph-pill inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-bold text-slate-900 hover:text-blue-900 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-900 outline-none"
              >
                <CheckSquare className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <span>Convert to Task</span>
              </button>
            )
          )}
        </div>

        <Link
          to={`/notices/${notice.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:underline px-2 py-1 rounded transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 outline-none"
        >
          <span>View Details</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        </Link>
      </div>

      {/* 7. Reviewer Action Bar (Rendered only for authorized reviewers) */}
      {isReviewer && (
        <div className="pt-3 border-t border-amber-200 bg-amber-500/5 -mx-5 -mb-5 p-4 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
            <span className="text-xs font-mono font-bold text-amber-900">REVIEW CONTROLS:</span>
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
              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 px-2 py-1 rounded-lg">
                <span className="text-xs text-rose-800 font-medium mr-1">Delete notice?</span>
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

      <ImagePreviewModal
        isOpen={Boolean(previewImage)}
        onClose={handleClosePreview}
        imageUrl={previewImage?.url || null}
        filename={previewImage?.filename || ''}
        sizeBytes={previewImage?.sizeBytes}
      />
    </article>
  );
};

export default NoticeCard;
