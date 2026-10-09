import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/ui/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-inline border bg-white px-3 text-sm text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:outline-none focus-visible:border-primary-accent',
        invalid ? 'border-status-danger' : 'border-border',
        className,
      )}
      {...rest}
    />
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full rounded-inline border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:outline-none focus-visible:border-primary-accent',
        invalid ? 'border-status-danger' : 'border-border',
        className,
      )}
      {...rest}
    />
  );
});

interface FieldLabelProps {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
  helper?: string;
}

export function FieldLabel({ htmlFor, children, required, helper }: FieldLabelProps) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-primary">
        {children}
        {required ? (
          <span className="ml-1 text-status-danger" aria-label="必須">
            *
          </span>
        ) : null}
      </label>
      {helper ? <span className="text-xs text-text-muted">{helper}</span> : null}
    </div>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-status-danger">
      {children}
    </p>
  );
}
