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
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--cf-surface-muted)] text-[var(--cf-text-tertiary)]">
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
