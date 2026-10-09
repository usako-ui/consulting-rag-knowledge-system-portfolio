import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg';
}

const PADDING = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6 md:p-8',
} as const;

export function Card({ padding = 'md', className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface-card shadow-card',
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
