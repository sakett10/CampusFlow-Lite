import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center cf-animate-enter py-6 ${className}`}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)] shadow-sm">
        {icon}
      </div>
      <h3 className="mb-1.5 font-sans-display text-[17px] font-semibold text-[var(--cf-text)]">
        {title}
      </h3>
      <p className="max-w-md font-reading text-sm leading-relaxed text-[var(--cf-text-secondary)]">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
