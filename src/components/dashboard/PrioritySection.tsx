import { Link } from 'react-router-dom';
import { AlertCircle, CalendarClock, Clock, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge } from '../ui/Badge';
import type { PriorityItem } from '../../lib/dashboardUtils';
import { formatDueDate } from '../../lib/dateUtils';

export default function PrioritySection({ items }: { items: PriorityItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[length:var(--cf-text-title-size)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-text)] font-sans-display">
          Needs Attention
        </h2>
        <Badge variant="danger" className="animate-pulse">ACTION REQUIRED</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
          >
            <Link
              to={item.navPath}
              className="group flex flex-col h-full rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-5 transition-all duration-[var(--cf-transition-normal)] hover:-translate-y-0.5 hover:border-[var(--cf-border-strong)] hover:shadow-[var(--cf-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)]"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--cf-radius-md)] ${getIconBg(item.priority)}`}>
                  {getIcon(item.type, item.priority)}
                </div>
                {item.priority === 'HIGH' && <Badge variant="danger">HIGH</Badge>}
                {item.priority === 'MEDIUM' && <Badge variant="warning">MED</Badge>}
              </div>
              
              <h3 className="mb-1.5 font-sans-display text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text)] line-clamp-1 group-hover:text-[var(--cf-brand)] transition-colors">
                {item.title}
              </h3>
              <p className="mb-4 font-reading text-[length:var(--cf-text-caption-size)] text-[var(--cf-text-secondary)] line-clamp-1">
                {item.subtitle}
              </p>
              
              <div className="mt-auto flex items-center justify-between text-[length:var(--cf-text-micro-size)] font-[number:var(--cf-text-micro-weight)] uppercase tracking-wider text-[var(--cf-text-secondary)] pt-3 border-t border-[var(--cf-border)]">
                <span className="font-mono-meta text-xs">{item.dateStr ? formatDueDate(item.dateStr) : 'View Details'}</span>
                <ChevronRight className="h-4 w-4 text-[var(--cf-text-tertiary)] group-hover:text-[var(--cf-brand)] group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function getIcon(type: PriorityItem['type'], priority: PriorityItem['priority']) {
  const className = `h-5 w-5 ${getIconColor(priority)}`;
  switch (type) {
    case 'ATTENDANCE': return <AlertCircle className={className} />;
    case 'ASSIGNMENT': return <Clock className={className} />;
    case 'REGISTRATION': return <CalendarClock className={className} />;
    case 'EVENT': return <CalendarClock className={className} />;
    default: return <AlertCircle className={className} />;
  }
}

function getIconBg(priority: PriorityItem['priority']) {
  switch (priority) {
    case 'HIGH': return 'bg-[var(--cf-danger-subtle)]';
    case 'MEDIUM': return 'bg-[var(--cf-warning-subtle)]';
    case 'LOW': return 'bg-[var(--cf-surface-muted)]';
  }
}

function getIconColor(priority: PriorityItem['priority']) {
  switch (priority) {
    case 'HIGH': return 'text-[var(--cf-danger)]';
    case 'MEDIUM': return 'text-[var(--cf-warning)]';
    case 'LOW': return 'text-[var(--cf-text-secondary)]';
  }
}
