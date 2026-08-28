import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCampusFeed } from '../hooks/useCampusFeed';
import { motion } from 'motion/react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { ArrowLeft, MapPin, Calendar, Clock, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatDueDate, formatTime } from '../lib/dateUtils';
import { getEventStatus, type EventStatus } from '../lib/eventStatus';

export default function CampusItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { items, isLoading, error } = useCampusFeed();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 animate-pulse">
        <div className="h-10 w-24 rounded bg-[var(--cf-surface-muted)]" />
        <div className="h-64 w-full rounded-[var(--cf-radius-lg)] bg-[var(--cf-surface-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-[var(--cf-radius-lg)] border border-[var(--cf-danger)]/25 bg-[var(--cf-danger-subtle)] px-5 py-4 text-[var(--cf-danger)] font-medium">
          Failed to load event details.
        </div>
      </div>
    );
  }

  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Button variant="ghost" onClick={() => navigate('/campus-feed')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back to Feed
        </Button>
        <Card padding="lg" className="text-center">
          <h2 className="font-sans-display text-[length:var(--cf-text-title-size)] font-semibold text-[var(--cf-text)]">Event not found</h2>
          <p className="mt-2 font-reading text-[var(--cf-text-secondary)]">The event you are looking for does not exist or has been deleted.</p>
        </Card>
      </div>
    );
  }

  const eventStatus = getEventStatus(item.date, item.startTime, item.endTime, item.registrationDeadline);
  const STATUS_BADGE_CONFIG: Record<EventStatus, { label: string | null; variant: BadgeVariant }> = {
    UNKNOWN: { label: null, variant: 'neutral' },
    EVENT_ENDED: { label: 'Event Ended', variant: 'neutral' },
    UPCOMING: { label: 'Upcoming', variant: 'neutral' },
    REGISTRATION_OPEN: { label: 'Registration Open', variant: 'success' },
    REGISTRATION_CLOSING_SOON: { label: 'Closing Soon', variant: 'warning' },
  };
  const statusConfig = STATUS_BADGE_CONFIG[eventStatus];

  const typeLabel = item.type ? item.type.charAt(0) + item.type.slice(1).toLowerCase() : 'Item';
  const actions = item.importantActions ?? [];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="mx-auto w-full max-w-4xl space-y-6 pb-12"
    >
      <nav aria-label="Back navigation">
        <Link 
          to="/campus-feed"
          className="inline-flex items-center gap-2 text-[length:var(--cf-text-body-size)] font-medium text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] rounded-md px-2 py-1 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Feed
        </Link>
      </nav>

      <Card padding="lg" className="flex flex-col border border-[var(--cf-border)] bg-[var(--cf-surface)] shadow-sm">
        {/* Header */}
        <header className="mb-8 border-b border-[var(--cf-border-subtle)] pb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="brand" className="text-xs font-semibold">{typeLabel}</Badge>
            {statusConfig.label && (
              <Badge variant={statusConfig.variant} className="text-xs font-semibold">{statusConfig.label}</Badge>
            )}
          </div>
          <h1 className="font-sans-display text-[length:var(--cf-text-display-size)] leading-[1.25] font-bold text-[var(--cf-text)]">
            {item.title || 'Untitled Notice'}
          </h1>
          {item.organizer && (
            <p className="mt-2 text-sm text-[var(--cf-text-secondary)]">
              Issued by <span className="font-semibold text-[var(--cf-text)]">{item.organizer}</span>
            </p>
          )}
        </header>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Main Reading Column (Source Sans 3, Calm Hierarchy) */}
          <div className="md:col-span-2 space-y-8 cf-reading-container">
            {actions.length > 0 && (
              <section className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-5">
                <h2 className="mb-3 font-sans-display text-sm font-semibold uppercase tracking-wider text-[var(--cf-text)]">
                  Key Action Items
                </h2>
                <ul className="space-y-2.5">
                  {actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-success)]" aria-hidden="true" />
                      <span className="font-sans text-sm text-[var(--cf-text)]">{action}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {item.description && (
              <section>
                <h2 className="mb-3 font-sans-display text-base font-semibold text-[var(--cf-text)]">
                  Notice Details
                </h2>
                <div className="font-reading text-[16px] leading-[1.65] text-[var(--cf-text)] whitespace-pre-wrap">
                  {item.description}
                </div>
              </section>
            )}
            
            {item.eligibility && (
              <section className="rounded-xl border border-[var(--cf-border-subtle)] bg-[var(--cf-surface-muted)]/50 p-4">
                <h2 className="mb-2 font-sans-display text-sm font-semibold text-[var(--cf-text)]">
                  Eligibility & Criteria
                </h2>
                <p className="font-reading text-[15px] leading-relaxed text-[var(--cf-text-secondary)]">
                  {item.eligibility}
                </p>
              </section>
            )}
          </div>

          {/* Sticky Metadata Sidebar */}
          <aside className="space-y-6">
            <section className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-4 space-y-4">
              <h2 className="font-sans-display text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-tertiary)] border-b border-[var(--cf-border-subtle)] pb-2 mb-3">
                Notice Metadata
              </h2>
              
              {item.date && (
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--cf-text-tertiary)]">Date</span>
                    <span className="font-mono-meta text-sm font-medium text-[var(--cf-text)]">{formatDueDate(item.date)}</span>
                  </div>
                </div>
              )}

              {(item.startTime || item.endTime) && (
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--cf-text-tertiary)]">Time</span>
                    <span className="font-mono-meta text-sm font-medium text-[var(--cf-text)]">
                      {item.startTime ? formatTime(item.startTime) : ''}
                      {item.startTime && item.endTime ? ' – ' : ''}
                      {item.endTime ? formatTime(item.endTime) : ''}
                    </span>
                  </div>
                </div>
              )}

              {item.venue && (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--cf-text-tertiary)]">Venue</span>
                    <span className="font-sans text-sm text-[var(--cf-text)]">{item.venue}</span>
                  </div>
                </div>
              )}

              {item.registrationDeadline && (
                <div className="flex items-start gap-3 rounded-lg bg-[var(--cf-warning-subtle)] border border-[var(--cf-warning-border)] p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-warning)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cf-warning)]">Registration Deadline</span>
                    <span className="font-mono-meta text-sm font-bold text-[var(--cf-text)]">{formatDueDate(item.registrationDeadline)}</span>
                  </div>
                </div>
              )}

              {item.organizer && (
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--cf-text-tertiary)]">Organizer</span>
                    <span className="font-sans text-sm text-[var(--cf-text)]">{item.organizer}</span>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </Card>
    </motion.div>
  );
}
