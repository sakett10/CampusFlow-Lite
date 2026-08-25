import { useState } from 'react';
import { useCampusFeed } from '../hooks/useCampusFeed';
import { Sparkles, Radio, Search, X, AlertCircle, RefreshCw } from 'lucide-react';
import type { ItemType } from '../lib/types';
import { sortCampusItems, type SortOption } from '../lib/eventSorting';
import { searchCampusItems } from '../lib/eventSearch';
import CampusItemCard from '../components/CampusItemCard';
import AnalyzeNoticeModal from '../components/AnalyzeNoticeModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
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
      className="flex h-full flex-col animate-pulse rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-8 shadow-[var(--cf-elev-1)]"
      aria-hidden
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="h-5 w-20 rounded-[var(--cf-radius-sm)] bg-[var(--cf-surface-muted)]" />
        <div className="h-5 w-24 rounded-[var(--cf-radius-sm)] bg-[var(--cf-surface-muted)]" />
      </div>
      <div className="mb-5 h-6 w-3/4 rounded bg-[var(--cf-surface-muted)]" />
      <div className="mb-6 h-10 w-full rounded bg-[var(--cf-surface-muted)]" />
      <div className="mb-3 h-4 w-2/3 rounded bg-[var(--cf-surface-muted)]" />
      <div className="mb-6 h-4 w-1/2 rounded bg-[var(--cf-surface-muted)]" />

      <div className="mt-auto flex items-center gap-3 border-t border-[var(--cf-border)] pt-4">
        <div className="h-10 flex-1 rounded-[var(--cf-radius-md)] bg-[var(--cf-surface-muted)]" />
        <div className="h-10 w-10 shrink-0 rounded-[var(--cf-radius-md)] bg-[var(--cf-surface-muted)]" />
      </div>
    </div>
  );
}

export default function CampusFeed() {
  const { items, isLoading, error, addItem, deleteItem, refresh } = useCampusFeed();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<FilterValue>('ALL');
  const [sortType, setSortType] = useState<SortOption>('RECENT');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems =
    filterType === 'ALL' ? items : items.filter((item) => item.type === filterType);

  const searchedItems = searchCampusItems(filteredItems, searchQuery);

  const sortedAndFilteredItems = sortCampusItems(searchedItems, sortType);

  const activeFilterLabel =
    FILTERS.find((f) => f.value === filterType)?.label ?? 'All';

  const openAnalyze = () => setIsModalOpen(true);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 overflow-x-hidden pb-12">
      {/* Header */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between pt-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[length:var(--cf-text-display-size)] leading-[1.1] font-extrabold tracking-tight text-[var(--cf-text)]">
              Campus Feed
            </h1>
            {!isLoading && !error && items.length > 0 && (
              <Badge variant="brand" className="px-2.5 py-1 text-[length:var(--cf-text-micro-size)] shadow-sm">
                {items.length} {items.length === 1 ? 'Notice' : 'Notices'}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)] max-w-2xl">
            Your intelligent hub for university announcements, hackathons, and important deadlines.
          </p>
        </div>
        <Button
          variant="ai"
          size="lg"
          onClick={openAnalyze}
          leftIcon={<Sparkles className="h-5 w-5" aria-hidden />}
          className="w-full sm:w-auto shadow-[var(--cf-elev-1)] hover:shadow-[var(--cf-elev-2)] transition-shadow"
        >
          Analyze notice
        </Button>
      </header>

      {/* Search */}
      <div className="relative group max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--cf-text-tertiary)] group-focus-within:text-[var(--cf-brand)] transition-colors pointer-events-none" aria-hidden="true" />
        <Input
          type="text"
          placeholder="Search events, venues, organizers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-14 w-full rounded-2xl pl-12 pr-12 text-[length:var(--cf-text-body-strong-size)] shadow-[var(--cf-elev-1)] focus:shadow-[var(--cf-elev-2)] border border-[var(--cf-border)] bg-[var(--cf-surface)] transition-all"
          aria-label="Search campus feed"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--cf-surface-muted)] text-[var(--cf-text-tertiary)] hover:bg-[var(--cf-border)] hover:text-[var(--cf-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)]"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between border-b border-[var(--cf-border)] pb-4">
        {/* Filters */}
        <div
          className="hide-scrollbar -mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0"
          role="group"
          aria-label="Filter campus items by type"
        >
          {FILTERS.map(({ value, label }) => {
            const pressed = filterType === value;
            const chipLabel = value === 'ALL' ? 'All Items' : label;

            return (
              <button
                key={value}
                type="button"
                aria-pressed={pressed}
                onClick={() => setFilterType(value)}
                className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-[length:var(--cf-text-body-size)] font-semibold whitespace-nowrap transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-brand)] ${
                  pressed
                    ? 'bg-[var(--cf-brand)] text-[var(--cf-brand-fg)] shadow-sm'
                    : 'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] hover:bg-[var(--cf-border)] hover:text-[var(--cf-text)]'
                }`}
              >
                {chipLabel}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
          <label htmlFor="sort-feed" className="text-[length:var(--cf-text-micro-size)] font-semibold text-[var(--cf-text-tertiary)] uppercase tracking-wider">
            Sort by
          </label>
          <div className="relative">
            <select
              id="sort-feed"
              value={sortType}
              onChange={(e) => setSortType(e.target.value as SortOption)}
              className="h-9 appearance-none rounded-full border border-[var(--cf-border)] bg-[var(--cf-surface)] pl-4 pr-10 text-[length:var(--cf-text-body-size)] font-medium text-[var(--cf-text)] transition-colors hover:border-[var(--cf-border-strong)] hover:bg-[var(--cf-surface-muted)] focus:border-[var(--cf-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--cf-brand)] cursor-pointer"
            >
              <option value="RECENT">Recent</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="REGISTRATION_DEADLINE">Deadline</option>
              <option value="PAST">Past</option>
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="h-4 w-4 text-[var(--cf-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex flex-col items-center rounded-[var(--cf-radius-lg)] border border-[var(--cf-danger)]/20 bg-[var(--cf-danger-subtle)] px-6 py-14 text-center">
          <EmptyState
            icon={<AlertCircle className="h-7 w-7 text-[var(--cf-danger)]" aria-hidden />}
            title="Couldn't load your campus feed"
            description="We encountered an issue while trying to load the latest campus updates. Please try again."
            action={
              <Button
                variant="outline"
                onClick={() => refresh()}
                leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
              >
                Retry
              </Button>
            }
          />
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Loading campus feed"
        >
          {Array.from({ length: 3 }, (_, i) => (
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

      {!isLoading && !error && items.length > 0 && sortedAndFilteredItems.length === 0 && (
        <div className="flex flex-col items-center rounded-[var(--cf-radius-lg)] border border-dashed border-[var(--cf-border-strong)] bg-[var(--cf-surface)] px-6 py-14 text-center">
          {searchQuery ? (
            <EmptyState
              icon={<Search className="h-7 w-7" aria-hidden="true" />}
              title={`No results for "${searchQuery}"`}
              description="Try adjusting your search or filters to find what you're looking for."
              action={
                <Button
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Radio className="h-7 w-7" aria-hidden="true" />}
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
          )}
        </div>
      )}

      {!isLoading && !error && sortedAndFilteredItems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedAndFilteredItems.map((item) => (
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
