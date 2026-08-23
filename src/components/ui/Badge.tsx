import React from 'react';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'neutral', children, ...props }, ref) => {
    const variants: Record<BadgeVariant, string> = {
      neutral: 'bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]',
      brand: 'bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-transparent',
      success: 'bg-[var(--cf-success-subtle)] text-[var(--cf-success)] border border-[var(--cf-success)]/20',
      warning: 'bg-[var(--cf-warning-subtle)] text-[var(--cf-warning)] border border-[var(--cf-warning)]/20',
      danger: 'bg-[var(--cf-danger-subtle)] text-[var(--cf-danger)] border border-[var(--cf-danger)]/20',
      info: 'bg-[var(--cf-info-subtle)] text-[var(--cf-info)] border border-[var(--cf-info)]/20',
    };

    return (
      <span
        ref={ref}
        className={`inline-flex items-center rounded-[var(--cf-radius-sm)] px-2 py-0.5 text-[length:var(--cf-text-micro-size)] font-semibold tracking-wide uppercase ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
