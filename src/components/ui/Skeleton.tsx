import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => {
  return (
    <div
      aria-hidden="true"
      className={`rounded-[var(--cf-radius-md)] bg-[var(--cf-surface-muted)] animate-pulse motion-reduce:animate-none ${className}`}
      {...props}
    />
  );
};

export const TaskSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-2.5" aria-label="Loading tasks" role="status">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center gap-3 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-3.5"
        >
          <Skeleton className="h-5 w-5 rounded-md shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-4 w-3/5" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-16 rounded-md shrink-0" />
        </div>
      ))}
      <span className="sr-only">Loading tasks...</span>
    </div>
  );
};

export const NoticeCardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="Loading notices" role="status">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="flex flex-col gap-3 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-5"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--cf-border-subtle)] pb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-14 rounded" />
            </div>
            <Skeleton className="h-4 w-16 rounded" />
          </div>

          <div className="space-y-2 pt-1">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>

          <div className="mt-auto pt-3 border-t border-[var(--cf-border-subtle)] flex items-center justify-between">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-24 rounded-lg" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading campus notices...</span>
    </div>
  );
};

export default Skeleton;
