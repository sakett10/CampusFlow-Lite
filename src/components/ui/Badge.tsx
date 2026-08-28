import React from 'react';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'neutral', children, ...props }, ref) => {
    const variants: Record<BadgeVariant, string> = {
      neutral: 'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]',
      brand: 'bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20',
      success: 'bg-[var(--cf-success-subtle)] text-[var(--cf-success)] border border-[var(--cf-success-border)]',
      warning: 'bg-[var(--cf-warning-subtle)] text-[var(--cf-warning)] border border-[var(--cf-warning-border)]',
      danger: 'bg-[var(--cf-danger-subtle)] text-[var(--cf-danger)] border border-[var(--cf-danger-border)]',
      info: 'bg-[var(--cf-info-subtle)] text-[var(--cf-info)] border border-[var(--cf-info-border)]',
      ai: 'bg-[var(--cf-ai-subtle)] text-[var(--cf-ai)] border border-[var(--cf-ai-border)]',
    };

    return (
      <span
        ref={ref}
        className={`inline-flex items-center rounded-[var(--cf-radius-sm)] px-2 py-0.5 text-[length:var(--cf-text-micro-size)] font-mono-meta font-medium tracking-wide transition-colors duration-150 ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
