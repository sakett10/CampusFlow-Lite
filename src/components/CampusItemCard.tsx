import { useState } from 'react';
import type { CampusItem, ItemType } from '../lib/types';
import { MapPin, Calendar, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { formatDueDate, isOverdue, isValidDateString, formatTime } from '../lib/dateUtils';
import DeleteConfirmModal from './DeleteConfirmModal';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
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

  const actions = item.importantActions ?? [];
  const visibleActions = actions.slice(0, 3);
  const extraActionCount = actions.length - visibleActions.length;

  return (
    <>
      <Card padding="md" className="flex flex-col transition-shadow hover:shadow-[var(--cf-elev-1)] focus-within:shadow-[var(--cf-elev-1)] h-full">
        {/* Type badge */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <Badge variant="brand">{typeLabel}</Badge>
        </div>

        <h3 className="mb-3 text-[length:var(--cf-text-title-size)] leading-[var(--cf-text-title-line)] font-[number:var(--cf-text-title-weight)] text-[var(--cf-text)]">
          {displayTitle}
        </h3>

        {/* Registration deadline — prominent when present */}
        {item.registrationDeadline && deadlineTone && (
          <div
            className={`mb-3 rounded-[var(--cf-radius-md)] border px-3 py-2 text-[length:var(--cf-text-body-strong-size)] leading-[var(--cf-text-body-strong-line)] font-[number:var(--cf-text-body-strong-weight)] ${DEADLINE_STYLES[deadlineTone]}`}
          >
            <span className="block text-[length:var(--cf-text-micro-size)] leading-[var(--cf-text-micro-line)] font-[number:var(--cf-text-micro-weight)] uppercase tracking-wide opacity-80">
              Registration deadline
            </span>
            {formatDueDate(item.registrationDeadline)}
            {deadlineTone === 'overdue' && (
              <span className="ml-1.5 text-[length:var(--cf-text-caption-size)]">(overdue)</span>
            )}
            {deadlineTone === 'soon' && (
              <span className="ml-1.5 text-[length:var(--cf-text-caption-size)]">(soon)</span>
            )}
          </div>
        )}

        {/* Event date / venue */}
        {(item.date || item.venue || item.startTime) && (
          <div className="mb-3 flex flex-col gap-1.5 text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
            {item.date && (
              <div className="flex min-w-0 items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-[var(--cf-brand)]" aria-hidden />
                <span className="truncate">{formatDueDate(item.date)}</span>
              </div>
            )}
            {item.startTime && (
              <div className="flex min-w-0 items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-[var(--cf-brand)]" aria-hidden />
                <span className="truncate">
                  {formatTime(item.startTime)}
                  {item.endTime ? ` – ${formatTime(item.endTime)}` : ''}
                </span>
              </div>
            )}
            {item.venue && (
              <div className="flex min-w-0 items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-[var(--cf-brand)]" aria-hidden />
                <span className="truncate">{item.venue}</span>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p className="mb-3 line-clamp-3 text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
            {item.description}
          </p>
        )}

        {/* Important actions — max 3 + overflow hint */}
        {actions.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <p className="text-[length:var(--cf-text-label-size)] leading-[var(--cf-text-label-line)] font-[number:var(--cf-text-label-weight)] text-[var(--cf-text-tertiary)]">
              Important actions
            </p>
            <ul className="space-y-1.5">
              {visibleActions.map((action, i) => (
                <li
                  key={`${i}-${action}`}
                  className="flex items-start gap-1.5 text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text)]"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-success)]"
                    aria-hidden
                  />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
            {extraActionCount > 0 && (
              <p className="pl-6 text-[length:var(--cf-text-caption-size)] leading-[var(--cf-text-caption-line)] text-[var(--cf-text-tertiary)]">
                +{extraActionCount} more
              </p>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-auto flex items-center justify-end border-t border-[var(--cf-border)] pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Delete ${displayTitle}`}
            title={`Delete ${displayTitle}`}
            className="hover:bg-[var(--cf-danger-subtle)] hover:text-[var(--cf-danger)]"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
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
