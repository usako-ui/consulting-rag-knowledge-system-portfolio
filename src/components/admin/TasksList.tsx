import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { DashboardTask } from '@/lib/admin/dashboard';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/ui/cn';

interface TasksListProps {
  tasks: DashboardTask[];
}

export function TasksList({ tasks }: TasksListProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        variant="neutral"
        icon={CheckCircle2}
        title="対応が必要なタスクはありません"
        description="システムは通常どおり稼働しています。定期的にチェックを続けてください。"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li key={task.id}>
          <Link
            href={task.actionHref}
            className={cn(
              'flex items-start justify-between gap-3 rounded-inline border p-4 transition-shadow duration-150 hover:shadow-card-hover',
              task.severity === 'action_required'
                ? 'border-[#EFBEBA] bg-[#FBE7E5]/40'
                : 'border-[#EDDEA5] bg-[#FBF2DA]/40',
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">{task.title}</p>
              <p className="mt-0.5 text-xs text-text-muted">{task.description}</p>
            </div>
            <div className="flex-shrink-0 self-center text-primary-accent">
              <span className="mr-1 inline-block text-xs font-medium">{task.actionLabel}</span>
              <ArrowRight className="inline-block h-4 w-4" aria-hidden="true" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
