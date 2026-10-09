import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: 'default' | 'neutral';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-white/60 px-6 py-10 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full',
          variant === 'neutral' ? 'bg-primary-soft text-primary-accent' : 'bg-primary-soft text-primary',
        )}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
