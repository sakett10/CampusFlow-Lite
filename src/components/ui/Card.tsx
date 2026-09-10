import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', padding = 'md', interactive = false, children, ...props }, ref) => {
    const paddings = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    };

    const interactiveClasses = interactive
      ? 'hover:-translate-y-0.5 hover:border-[var(--cf-border-strong)] hover:shadow-[var(--cf-elev-2)] motion-reduce:hover:translate-y-0'
      : '';

    return (
      <div
        ref={ref}
        className={`rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] shadow-[var(--cf-elev-1)] transition-all duration-[var(--cf-transition-normal)] ${paddings[padding]} ${interactiveClasses} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
