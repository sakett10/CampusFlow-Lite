import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'ai';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-[number:var(--cf-text-body-strong-weight)] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cf-bg)] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap active:scale-[0.98]';

    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-[var(--cf-brand)] text-[var(--cf-brand-fg)] hover:bg-[var(--cf-brand-hover)] shadow-[var(--cf-elev-1)] hover:shadow-[var(--cf-elev-2)]',
      secondary: 'bg-[var(--cf-surface-muted)] text-[var(--cf-text)] hover:bg-[var(--cf-border)]',
      outline:
        'border border-[var(--cf-border-strong)] bg-[var(--cf-surface)] text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)]',
      ghost: 'bg-transparent text-[var(--cf-text-secondary)] hover:bg-[var(--cf-surface-muted)] hover:text-[var(--cf-text)]',
      ai: 'bg-[var(--cf-ai)] text-[var(--cf-ai-fg)] hover:bg-[var(--cf-ai-hover)] shadow-[var(--cf-elev-ai)] hover:shadow-[0_0_24px_rgba(139,92,246,0.4)]',
    };

    const sizes: Record<ButtonSize, string> = {
      sm: 'h-8 px-3 text-[length:var(--cf-text-label-size)] rounded-[var(--cf-radius-sm)] gap-1.5',
      md: 'h-10 px-4 text-[length:var(--cf-text-body-strong-size)] rounded-[var(--cf-radius-md)] gap-2',
      lg: 'h-12 px-6 text-[length:var(--cf-text-subtitle-size)] rounded-[var(--cf-radius-md)] gap-2',
    };

    const combinedClasses = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

    return (
      <button ref={ref} disabled={disabled || isLoading} className={combinedClasses} {...props}>
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4 mr-1.5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {!isLoading && leftIcon && <span className="shrink-0">{leftIcon}</span>}
        {children}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
