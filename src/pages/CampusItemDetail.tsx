import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCampusFeed } from '../hooks/useCampusFeed';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
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
        <div className="rounded-[var(--cf-radius-lg)] border border-[var(--cf-danger)]/25 bg-[var(--cf-danger-subtle)] px-5 py-4 text-[var(--cf-danger)]">
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
          <h2 className="text-[length:var(--cf-text-title-size)] font-semibold text-[var(--cf-text)]">Event not found</h2>
          <p className="mt-2 text-[var(--cf-text-secondary)]">The event you are looking for does not exist or has been deleted.</p>
        </Card>
      </div>
    );
  }

  const eventStatus = getEventStatus(item.date, item.startTime, item.endTime, item.registrationDeadline);
  const STATUS_BADGE_CONFIG: Record<EventStatus, { label: string | null; variant: any }> = {
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
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
      <nav aria-label="Back navigation">
        <Link 
          to="/campus-feed"
          className="inline-flex items-center gap-2 text-[length:var(--cf-text-body-size)] font-medium text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] rounded-md px-2 py-1 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Feed
        </Link>
      </nav>

      <Card padding="lg" className="flex flex-col">
        <header className="mb-8">
          <div className="mb-4 flex flex-wrap items-start gap-2">
            <Badge variant="brand">{typeLabel}</Badge>
            {statusConfig.label && (
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            )}
          </div>
          <h1 className="text-[length:var(--cf-text-display-size)] leading-tight font-bold text-[var(--cf-text)]">
            {item.title || 'Untitled Event'}
          </h1>
        </header>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="md:col-span-2 space-y-8">
            {item.description && (
              <section>
                <h2 className="mb-3 text-[length:var(--cf-text-title-size)] font-semibold text-[var(--cf-text)]">About</h2>
                <p className="whitespace-pre-wrap text-[length:var(--cf-text-body-size)] leading-relaxed text-[var(--cf-text-secondary)]">
                  {item.description}
                </p>
              </section>
            )}

            {actions.length > 0 && (
              <section>
                <h2 className="mb-3 text-[length:var(--cf-text-title-size)] font-semibold text-[var(--cf-text)]">Important Actions</h2>
                <ul className="space-y-3">
                  {actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-[var(--cf-radius-md)] border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cf-success)]" aria-hidden="true" />
                      <span className="text-[length:var(--cf-text-body-size)] text-[var(--cf-text)]">{action}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            
            {item.eligibility && (
              <section>
                <h2 className="mb-3 text-[length:var(--cf-text-title-size)] font-semibold text-[var(--cf-text)]">Eligibility</h2>
                <p className="text-[length:var(--cf-text-body-size)] leading-relaxed text-[var(--cf-text-secondary)]">
                  {item.eligibility}
                </p>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="rounded-[var(--cf-radius-md)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4 space-y-4">
              <h2 className="text-[length:var(--cf-text-body-strong-size)] font-semibold text-[var(--cf-text)] border-b border-[var(--cf-border)] pb-2 mb-3">
                Event Details
              </h2>
              
              {item.date && (
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[length:var(--cf-text-micro-size)] font-medium uppercase tracking-wider text-[var(--cf-text-tertiary)]">Date</span>
                    <span className="text-[length:var(--cf-text-body-size)] text-[var(--cf-text-secondary)]">{formatDueDate(item.date)}</span>
                  </div>
                </div>
              )}

              {(item.startTime || item.endTime) && (
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[length:var(--cf-text-micro-size)] font-medium uppercase tracking-wider text-[var(--cf-text-tertiary)]">Time</span>
                    <span className="text-[length:var(--cf-text-body-size)] text-[var(--cf-text-secondary)]">
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
                    <span className="block text-[length:var(--cf-text-micro-size)] font-medium uppercase tracking-wider text-[var(--cf-text-tertiary)]">Venue</span>
                    <span className="text-[length:var(--cf-text-body-size)] text-[var(--cf-text-secondary)]">{item.venue}</span>
                  </div>
                </div>
              )}

              {item.registrationDeadline && (
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-warning)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[length:var(--cf-text-micro-size)] font-medium uppercase tracking-wider text-[var(--cf-text-tertiary)]">Registration Deadline</span>
                    <span className="text-[length:var(--cf-text-body-size)] text-[var(--cf-text-secondary)]">{formatDueDate(item.registrationDeadline)}</span>
                  </div>
                </div>
              )}

              {item.organizer && (
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
                  <div>
                    <span className="block text-[length:var(--cf-text-micro-size)] font-medium uppercase tracking-wider text-[var(--cf-text-tertiary)]">Organizer</span>
                    <span className="text-[length:var(--cf-text-body-size)] text-[var(--cf-text-secondary)]">{item.organizer}</span>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </Card>
    </div>
  );
}
