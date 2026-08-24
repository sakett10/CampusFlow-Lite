import { useState } from 'react';
import { useCampusFeed } from '../hooks/useCampusFeed';
import { Sparkles, Radio } from 'lucide-react';
import type { ItemType } from '../lib/types';
import CampusItemCard from '../components/CampusItemCard';
import AnalyzeNoticeModal from '../components/AnalyzeNoticeModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

type FilterValue = 'ALL' | ItemType;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'HACKATHON', label: 'Hackathon' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'EVENT', label: 'Event' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'DEADLINE', label: 'Deadline' },
];

function FeedSkeletonCard() {
  return (
    <div
      className="animate-pulse rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-5"
      aria-hidden
    >
      <div className="mb-3 h-6 w-24 rounded-[var(--cf-radius-sm)] bg-[var(--cf-surface-muted)]" />
      <div className="mb-3 h-5 w-4/5 max-w-[85%] rounded bg-[var(--cf-surface-muted)]" />
      <div className="mb-3 h-12 w-full rounded-[var(--cf-radius-md)] bg-[var(--cf-surface-muted)]" />
      <div className="mb-2 h-4 w-2/3 max-w-[66%] rounded bg-[var(--cf-surface-muted)]" />
      <div className="mb-4 h-4 w-1/2 max-w-[50%] rounded bg-[var(--cf-surface-muted)]" />
      <div className="mb-4 space-y-2">
        <div className="h-3.5 w-full rounded bg-[var(--cf-surface-muted)]" />
        <div className="h-3.5 w-[90%] rounded bg-[var(--cf-surface-muted)]" />
      </div>
      <div className="flex justify-end border-t border-[var(--cf-border)] pt-3">
        <div className="h-9 w-9 rounded-[var(--cf-radius-md)] bg-[var(--cf-surface-muted)]" />
      </div>
    </div>
  );
}

export default function CampusFeed() {
  const { items, isLoading, error, addItem, deleteItem, refresh } = useCampusFeed();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<FilterValue>('ALL');

  const filteredItems =
    filterType === 'ALL' ? items : items.filter((item) => item.type === filterType);

  const activeFilterLabel =
    FILTERS.find((f) => f.value === filterType)?.label ?? 'All';

  const openAnalyze = () => setIsModalOpen(true);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-2">
        <div className="min-w-0">
          <h1 className="text-[length:var(--cf-text-display-size)] leading-tight font-bold tracking-tight text-[var(--cf-text)]">
            Campus Feed
          </h1>
          <p className="mt-1 text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)]">
            Structured campus opportunities
          </p>
        </div>
        <Button
          variant="ai"
          onClick={openAnalyze}
          leftIcon={<Sparkles className="h-5 w-5" aria-hidden />}
        >
          Analyze notice
        </Button>
      </div>

      {/* Filters */}
      <div
        className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="group"
        aria-label="Filter campus items by type"
      >
        {FILTERS.map(({ value, label }) => {
          const pressed = filterType === value;
          const chipLabel =
            value === 'ALL' ? `All (${items.length})` : label;

          return (
            <button
              key={value}
              type="button"
              aria-pressed={pressed}
              onClick={() => setFilterType(value)}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-[var(--cf-radius-full)] px-4 text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] font-[number:var(--cf-text-body-strong-weight)] whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-brand)] ${
                pressed
                  ? 'bg-[var(--cf-brand)] text-[var(--cf-brand-fg)]'
                  : 'border border-[var(--cf-border)] bg-[var(--cf-surface)] text-[var(--cf-text-secondary)] hover:bg-[var(--cf-surface-muted)]'
              }`}
            >
              {chipLabel}
            </button>
          );
        })}
      </div>

      {/* Error — keep header/CTA; friendly message + retry */}
      {error && !isLoading && (
        <div
          className="rounded-[var(--cf-radius-lg)] border border-[var(--cf-danger)]/25 bg-[var(--cf-danger-subtle)] px-5 py-4"
          role="alert"
        >
          <p className="text-[length:var(--cf-text-body-strong-size)] leading-[var(--cf-text-body-strong-line)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-danger)]">
            Couldn&apos;t load your campus feed
          </p>
          <Button
            variant="outline"
            onClick={() => refresh()}
            className="mt-3"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Loading campus feed"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <FeedSkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Content states */}
      {!isLoading && !error && items.length === 0 && (
        <div className="flex flex-col items-center rounded-[var(--cf-radius-lg)] border border-dashed border-[var(--cf-border-strong)] bg-[var(--cf-surface)] px-6 py-14 text-center">
          <EmptyState
            icon={<Radio className="h-7 w-7" aria-hidden />}
            title="Your campus feed is empty"
            description="Turn campus notices, emails, and WhatsApp messages into structured opportunities and deadlines."
            action={
              <Button
                variant="ai"
                onClick={openAnalyze}
                leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}
              >
                Analyze notice
              </Button>
            }
          />
        </div>
      )}

      {!isLoading && !error && items.length > 0 && filteredItems.length === 0 && (
        <div className="flex flex-col items-center rounded-[var(--cf-radius-lg)] border border-dashed border-[var(--cf-border-strong)] bg-[var(--cf-surface)] px-6 py-14 text-center">
          <EmptyState
            icon={<Radio className="h-7 w-7" aria-hidden />}
            title={`No ${activeFilterLabel} items`}
            description="Try another filter or clear the current filter."
            action={
              <Button
                variant="outline"
                onClick={() => setFilterType('ALL')}
              >
                Clear filter
              </Button>
            }
          />
        </div>
      )}

      {!isLoading && !error && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <CampusItemCard key={item.id} item={item} onDelete={deleteItem} />
          ))}
        </div>
      )}

      <AnalyzeNoticeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(item) => addItem(item)}
      />
    </div>
  );
}
