import { cn } from '@/lib/ui/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-inline bg-[#EAEEF4]', className)}
    />
  );
}
