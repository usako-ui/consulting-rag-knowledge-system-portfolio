import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

type Tone = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  className?: string;
}

const TONE: Record<Tone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'bg-primary-soft text-primary border-[#C3D6EA]' },
  success: {
    icon: CheckCircle2,
    className: 'bg-[#E9F5EE] text-[#1F6B4C] border-[#B8E1CB]',
  },
  warning: {
    icon: AlertTriangle,
    className: 'bg-[#FBF2DA] text-[#8A6B18] border-[#EDDEA5]',
  },
  danger: {
    icon: AlertCircle,
    className: 'bg-[#FBE7E5] text-[#8F332C] border-[#EFBEBA]',
  },
};

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const preset = TONE[tone];
  const Icon = preset.icon;
  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-card border px-4 py-3 text-sm',
        preset.className,
        className,
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="text-[13px] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
