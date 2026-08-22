import { useState } from 'react';
import { useCampusFeed } from '../hooks/useCampusFeed';
import { Sparkles, Radio } from 'lucide-react';
import type { ItemType } from '../lib/types';
import CampusItemCard from '../components/CampusItemCard';
import AnalyzeNoticeModal from '../components/AnalyzeNoticeModal';

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[length:var(--cf-text-display-size)] leading-[var(--cf-text-display-line)] font-[number:var(--cf-text-display-weight)] text-[var(--cf-text)]">
            Campus Feed
          </h1>
          <p className="mt-1 text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
            Structured campus opportunities
          </p>
        </div>
        <button
          type="button"
          onClick={openAnalyze}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--cf-radius-md)] bg-[var(--cf-brand)] px-5 py-2.5 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-brand-fg)] transition-colors hover:bg-[var(--cf-brand-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-brand)]"
        >
          <Sparkles className="h-5 w-5" aria-hidden />
          Analyze notice
        </button>
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
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-3 inline-flex min-h-11 items-center rounded-[var(--cf-radius-md)] border border-[var(--cf-border)] bg-[var(--cf-surface)] px-4 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text)] transition-colors hover:bg-[var(--cf-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-brand)]"
          >
            Retry
          </button>
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
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--cf-surface-muted)]">
            <Radio className="h-7 w-7 text-[var(--cf-text-tertiary)]" aria-hidden />
          </div>
          <h2 className="mb-2 text-[length:var(--cf-text-title-size)] leading-[var(--cf-text-title-line)] font-[number:var(--cf-text-title-weight)] text-[var(--cf-text)]">
            Your campus feed is empty
          </h2>
          <p className="mb-6 max-w-md text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
            Turn campus notices, emails, and WhatsApp messages into structured
            opportunities and deadlines.
          </p>
          <button
            type="button"
            onClick={openAnalyze}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--cf-radius-md)] bg-[var(--cf-brand)] px-5 py-2.5 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-brand-fg)] transition-colors hover:bg-[var(--cf-brand-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-brand)]"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Analyze notice
          </button>
        </div>
      )}

      {!isLoading && !error && items.length > 0 && filteredItems.length === 0 && (
        <div className="flex flex-col items-center rounded-[var(--cf-radius-lg)] border border-dashed border-[var(--cf-border-strong)] bg-[var(--cf-surface)] px-6 py-14 text-center">
          <h2 className="mb-2 text-[length:var(--cf-text-title-size)] leading-[var(--cf-text-title-line)] font-[number:var(--cf-text-title-weight)] text-[var(--cf-text)]">
            No {activeFilterLabel} items
          </h2>
          <p className="mb-6 max-w-sm text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
            Try another filter or clear the current filter.
          </p>
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className="inline-flex min-h-11 items-center rounded-[var(--cf-radius-md)] border border-[var(--cf-border)] bg-[var(--cf-surface)] px-5 py-2.5 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text)] transition-colors hover:bg-[var(--cf-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-brand)]"
          >
            Clear filter
          </button>
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
