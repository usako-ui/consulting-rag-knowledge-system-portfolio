import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-primary text-white hover:bg-[#0a2743] disabled:bg-[#7c8899] shadow-card',
  secondary:
    'bg-white text-primary border border-border hover:bg-primary-soft disabled:text-text-muted',
  ghost:
    'bg-transparent text-primary hover:bg-primary-soft disabled:text-text-muted',
  danger:
    'bg-status-danger text-white hover:bg-[#a63730] disabled:bg-[#c99a97]',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-inline',
  md: 'h-10 px-4 text-sm rounded-inline',
  lg: 'h-12 px-5 text-base rounded-inline',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
