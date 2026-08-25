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
    <div className={`flex flex-col items-center justify-center text-center cf-animate-enter ${className}`}>
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--cf-surface-muted)] text-[var(--cf-text-tertiary)] shadow-inner ring-1 ring-[var(--cf-border)]">
        {icon}
      </div>
      <h3 className="mb-2 text-[length:var(--cf-text-subtitle-size)] leading-[var(--cf-text-subtitle-line)] font-[number:var(--cf-text-subtitle-weight)] text-[var(--cf-text)]">
        {title}
      </h3>
      <p className="max-w-sm text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
