import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { OverallStatus } from '@/lib/admin/dashboard';
import { cn } from '@/lib/ui/cn';

interface StatusBannerProps {
  status: OverallStatus;
  taskCount: number;
}

const PRESET: Record<
  OverallStatus,
  { icon: typeof CheckCircle2; label: string; description: string; className: string }
> = {
  ok: {
    icon: CheckCircle2,
    label: '正常稼働中',
    description: '対応が必要なタスクはありません。',
    className: 'bg-[#E9F5EE] border-[#B8E1CB] text-[#1F6B4C]',
  },
  notice: {
    icon: AlertTriangle,
    label: '注意',
    description: '確認しておきたいタスクがあります。',
    className: 'bg-[#FBF2DA] border-[#EDDEA5] text-[#8A6B18]',
  },
  action_required: {
    icon: AlertCircle,
    label: '対応が必要',
    description: '対応すべきタスクがあります。以下のリストから着手してください。',
    className: 'bg-[#FBE7E5] border-[#EFBEBA] text-[#8F332C]',
  },
};

export function StatusBanner({ status, taskCount }: StatusBannerProps) {
  const preset = PRESET[status];
  const Icon = preset.icon;
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-4 rounded-card border px-5 py-4 shadow-card',
        preset.className,
      )}
    >
      <Icon className="mt-0.5 h-6 w-6 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-base font-semibold">{preset.label}</p>
        <p className="mt-0.5 text-sm">
          {preset.description}
          {taskCount > 0 ? `（${taskCount} 件）` : null}
        </p>
      </div>
    </div>
  );
}
