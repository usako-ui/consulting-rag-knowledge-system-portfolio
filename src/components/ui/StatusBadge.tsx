import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/ui/cn';

export type StatusKind = 'success' | 'warning' | 'alert' | 'danger' | 'processing' | 'info';

interface Preset {
  icon: LucideIcon;
  label: string;
  className: string;
  iconClassName?: string;
}

const PRESET: Record<StatusKind, Preset> = {
  success: {
    icon: CheckCircle2,
    label: '正常',
    className: 'bg-[#E9F5EE] text-status-success border-[#B8E1CB]',
  },
  warning: {
    icon: AlertTriangle,
    label: '注意',
    className: 'bg-[#FBF2DA] text-[#8A6B18] border-[#EDDEA5]',
  },
  alert: {
    icon: AlertOctagon,
    label: '警告',
    className: 'bg-[#FCE9D7] text-[#9B4E19] border-[#F1C79A]',
  },
  danger: {
    icon: XCircle,
    label: 'エラー',
    className: 'bg-[#FBE7E5] text-status-danger border-[#EFBEBA]',
  },
  processing: {
    icon: Loader2,
    label: '処理中',
    className: 'bg-primary-soft text-primary-accent border-[#C3D6EA]',
    iconClassName: 'animate-spin',
  },
  info: {
    icon: Info,
    label: '情報',
    className: 'bg-primary-soft text-primary border-[#C3D6EA]',
  },
};

interface StatusBadgeProps {
  kind: StatusKind;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ kind, label, size = 'md', className }: StatusBadgeProps) {
  const preset = PRESET[kind];
  const Icon = preset.icon;
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 font-medium',
        size === 'sm' ? 'h-6 text-xs' : 'h-7 text-sm',
        preset.className,
        className,
      )}
    >
      <Icon className={cn(iconSize, preset.iconClassName)} aria-hidden="true" />
      <span>{label ?? preset.label}</span>
    </span>
  );
}
