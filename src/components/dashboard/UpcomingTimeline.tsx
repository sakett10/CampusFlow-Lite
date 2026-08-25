import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, CheckSquare, Sparkles } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import type { TimelineItem } from '../../lib/dashboardUtils';

export default function UpcomingTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <Card padding="lg" className="flex flex-col h-full cf-animate-enter transition-shadow hover:shadow-[var(--cf-elev-2)] hover:border-[var(--cf-border-strong)]">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-[length:var(--cf-text-subtitle-size)] font-[number:var(--cf-text-subtitle-weight)] text-[var(--cf-text)]">
          Upcoming Schedule
        </h2>
        <Link to="/campus-feed" className="flex items-center gap-1 text-[length:var(--cf-text-caption-size)] font-[number:var(--cf-text-caption-weight)] text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-brand)]">
          Full schedule <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6">
          <EmptyState
            icon={<CalendarClock className="h-7 w-7" />}
            title="Clear Schedule"
            description="Nothing upcoming in the next few days."
          />
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          {items.map((item) => (
            <Link
              key={item.id}
              to={item.navPath}
              className="group flex items-start gap-4 rounded-[var(--cf-radius-md)] border border-[var(--cf-border)] p-4 transition-colors hover:bg-[var(--cf-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)]"
            >
              <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[var(--cf-radius-sm)] bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] group-hover:bg-[var(--cf-surface)] group-hover:shadow-sm transition-all">
                <span className="text-[10px] font-bold uppercase">{new Date(item.dateStr).toLocaleDateString('en-US', { month: 'short' })}</span>
                <span className="text-sm font-bold leading-none">{new Date(item.dateStr).getDate()}</span>
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="truncate text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text)] group-hover:text-[var(--cf-brand)] transition-colors">
                    {item.title}
                  </h4>
                  {getTypeBadge(item.type)}
                </div>
                <p className="truncate text-[length:var(--cf-text-caption-size)] text-[var(--cf-text-secondary)]">
                  {item.subtitle}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function getTypeBadge(type: TimelineItem['type']) {
  switch (type) {
    case 'ASSIGNMENT':
      return <Badge variant="neutral" className="shrink-0"><CheckSquare className="mr-1 h-3 w-3 inline" /> Task</Badge>;
    case 'REGISTRATION':
      return <Badge variant="warning" className="shrink-0"><Sparkles className="mr-1 h-3 w-3 inline" /> Deadline</Badge>;
    case 'EVENT':
      return <Badge variant="brand" className="shrink-0">Event</Badge>;
  }
}
