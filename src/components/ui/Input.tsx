import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, fullWidth = true, ...props }, ref) => {
    const wrapperClasses = fullWidth ? 'w-full' : '';
    const inputClasses = `
      flex h-11 w-full rounded-[var(--cf-radius-md)] border border-[var(--cf-border)] bg-[var(--cf-surface)] px-4 py-2 text-[length:var(--cf-text-body-size)] text-[var(--cf-text)] transition-all duration-[var(--cf-transition-normal)] shadow-sm hover:border-[var(--cf-border-strong)]
      file:border-0 file:bg-transparent file:text-[length:var(--cf-text-body-size)] file:font-[number:var(--cf-text-body-weight)]
      placeholder:text-[var(--cf-text-tertiary)]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] focus-visible:border-transparent focus-visible:shadow-[var(--cf-elev-2)]
      disabled:cursor-not-allowed disabled:opacity-50
      ${error ? 'border-[var(--cf-danger)] focus-visible:ring-[var(--cf-danger)]' : ''}
      ${className}
    `;

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={props.id} className="mb-1.5 block text-[length:var(--cf-text-body-strong-size)] font-medium text-[var(--cf-text)]">
            {label}
          </label>
        )}
        <input ref={ref} className={inputClasses} {...props} />
        {error && (
          <p className="mt-1.5 text-[length:var(--cf-text-caption-size)] font-medium text-[var(--cf-danger)]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
