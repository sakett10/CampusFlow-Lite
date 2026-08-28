import { useState } from 'react';
import type { CampusItem, ItemType } from '../lib/types';
import { MapPin, Calendar, Trash2, Clock, AlertCircle } from 'lucide-react';
import { formatDueDate, isOverdue, isValidDateString, formatTime } from '../lib/dateUtils';
import { getEventStatus, type EventStatus } from '../lib/eventStatus';
import DeleteConfirmModal from './DeleteConfirmModal';
import { Link } from 'react-router-dom';
import { Card } from './ui/Card';
import { Badge, type BadgeVariant } from './ui/Badge';
import { Button } from './ui/Button';

type CampusItemCardProps = {
  item: CampusItem;
  onDelete: (id: string) => void;
};

const TYPE_LABELS: Record<ItemType, string> = {
  HACKATHON: 'Hackathon',
  WORKSHOP: 'Workshop',
  EVENT: 'Event',
  ANNOUNCEMENT: 'Announcement',
  DEADLINE: 'Deadline',
};

function humanizeType(type: ItemType | null): string {
  if (!type) return 'Item';
  return TYPE_LABELS[type] ?? 'Item';
}

type DeadlineTone = 'overdue' | 'soon' | 'normal';

function getDeadlineTone(dateStr: string): DeadlineTone | null {
  if (!isValidDateString(dateStr)) return null;
  if (isOverdue(dateStr, 'PENDING')) return 'overdue';

  const [year, month, day] = dateStr.split('-').map(Number);
  const dueEnd = new Date(year, month - 1, day, 23, 59, 59, 999);
  const msLeft = dueEnd.getTime() - Date.now();
  const daysLeft = msLeft / (24 * 60 * 60 * 1000);

  // Within ~3 days counts as very soon
  if (daysLeft <= 3) return 'soon';
  return 'normal';
}

const DEADLINE_STYLES: Record<DeadlineTone, string> = {
  overdue:
    'bg-[var(--cf-danger-subtle)] text-[var(--cf-danger)] border-[var(--cf-danger)]/20',
  soon:
    'bg-[var(--cf-warning-subtle)] text-[var(--cf-warning)] border-[var(--cf-warning)]/20',
  normal:
    'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] border-[var(--cf-border)]',
};

export default function CampusItemCard({ item, onDelete }: CampusItemCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const displayTitle = item.title?.trim() || 'Untitled item';
  const typeLabel = humanizeType(item.type);
  const deadlineTone = item.registrationDeadline
    ? getDeadlineTone(item.registrationDeadline)
    : null;

  const eventStatus = getEventStatus(
    item.date,
    item.startTime,
    item.endTime,
    item.registrationDeadline
  );

  const STATUS_BADGE_CONFIG: Record<EventStatus, { label: string | null; variant: BadgeVariant }> = {
    UNKNOWN: { label: null, variant: 'neutral' },
    EVENT_ENDED: { label: 'Event Ended', variant: 'neutral' },
    UPCOMING: { label: 'Upcoming', variant: 'neutral' },
    REGISTRATION_OPEN: { label: 'Registration Open', variant: 'success' },
    REGISTRATION_CLOSING_SOON: { label: 'Closing Soon', variant: 'warning' },
  };

  const statusConfig = STATUS_BADGE_CONFIG[eventStatus];



  return (
    <>
      <Card padding="lg" className="group flex flex-col transition-all duration-200 hover:shadow-[var(--cf-elev-2)] hover:-translate-y-0.5 hover:border-[var(--cf-border-strong)] focus-within:shadow-[var(--cf-elev-2)] focus-within:-translate-y-0.5 focus-within:border-[var(--cf-border-strong)] h-full">

        {/* Type and Status badges */}
        <div className="mb-3.5 flex items-start justify-between gap-2">
          <Badge variant="brand" className="text-xs font-semibold">{typeLabel}</Badge>
          {statusConfig.label && (
            <Badge variant={statusConfig.variant} className="text-xs font-semibold">{statusConfig.label}</Badge>
          )}
        </div>

        <h3 className="mb-2 font-sans-display text-base leading-snug font-bold tracking-tight text-[var(--cf-text)] group-hover:text-[var(--cf-brand)] transition-colors line-clamp-2">
          {displayTitle}
        </h3>

        {/* Description */}
        {item.description && (
          <p className="mb-4 line-clamp-2 font-reading text-sm leading-relaxed text-[var(--cf-text-secondary)]">
            {item.description}
          </p>
        )}

        {/* Event date / venue */}
        {(item.date || item.venue || item.startTime) && (
          <div className="mb-5 flex flex-col gap-2 text-xs font-medium text-[var(--cf-text-secondary)]">
            {item.date && (
              <div className="flex min-w-0 items-start gap-2.5">
                <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden />
                <span className="truncate font-mono-meta">{formatDueDate(item.date)}</span>
              </div>
            )}
            {item.startTime && (
              <div className="flex min-w-0 items-start gap-2.5">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden />
                <span className="truncate font-mono-meta">
                  {formatTime(item.startTime)}
                  {item.endTime ? ` – ${formatTime(item.endTime)}` : ''}
                </span>
              </div>
            )}
            {item.venue && (
              <div className="flex min-w-0 items-start gap-2.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden />
                <span className="truncate font-sans">{item.venue}</span>
              </div>
            )}
          </div>
        )}

        {/* Registration deadline */}
        {item.registrationDeadline && deadlineTone && (
          <div
            className={`mb-5 flex items-start gap-3 rounded-xl border p-3 text-xs font-semibold ${DEADLINE_STYLES[deadlineTone]}`}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider opacity-80 mb-0.5">
                Registration Deadline
              </span>
              <span className="flex items-center flex-wrap gap-x-2 gap-y-1 font-mono-meta">
                {formatDueDate(item.registrationDeadline)}
                {deadlineTone === 'overdue' && (
                  <Badge variant="danger" className="text-[9px] py-0 px-1.5 h-4 font-bold tracking-wider">OVERDUE</Badge>
                )}
                {deadlineTone === 'soon' && (
                  <Badge variant="warning" className="text-[9px] py-0 px-1.5 h-4 font-bold tracking-wider">SOON</Badge>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-auto flex items-center gap-2.5 border-t border-[var(--cf-border-subtle)] pt-3.5">
          <Link
            to={`/campus-feed/${item.id}`}
            className="flex-1 inline-flex h-10 items-center justify-center rounded-xl bg-[var(--cf-brand)] text-xs font-semibold text-white shadow-sm transition-all hover:bg-[var(--cf-brand-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cf-surface)]"
          >
            View Notice
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Delete ${displayTitle}`}
            title={`Delete ${displayTitle}`}
            className="h-10 w-10 shrink-0 p-0 text-[var(--cf-text-tertiary)] hover:bg-[var(--cf-danger-subtle)] hover:text-[var(--cf-danger)] focus-visible:ring-2 focus-visible:ring-[var(--cf-danger)] rounded-xl"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </Card>

      <DeleteConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => onDelete(item.id)}
        title={displayTitle}
        description={`This will permanently remove “${displayTitle}” from your campus feed. This cannot be undone.`}
      />
    </>
  );
}
