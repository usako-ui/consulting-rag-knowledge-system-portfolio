import { Info } from 'lucide-react';
import type { DashboardData } from '@/lib/admin/dashboard';
import { cn } from '@/lib/ui/cn';
import { formatDateTimeJa } from '@/lib/ui/format';

interface UsageGaugeProps {
  usage: DashboardData['usage'];
}

const BAND_TEXT: Record<DashboardData['usage']['band'], { label: string; className: string; bar: string }> = {
  green: {
    label: '正常',
    className: 'text-status-success',
    bar: 'bg-status-success',
  },
  yellow: {
    label: '注意',
    className: 'text-status-warning',
    bar: 'bg-status-warning',
  },
  orange: {
    label: '高負荷',
    className: 'text-status-alert',
    bar: 'bg-status-alert',
  },
  red: {
    label: '上限接近',
    className: 'text-status-danger',
    bar: 'bg-status-danger',
  },
};

export function UsageGauge({ usage }: UsageGaugeProps) {
  // 予算未設定（0 or マイナス）の場合はゲージ描画せず「予算未設定」案内表示（0 除算防止）
  if (!usage.monthTokenBudget || usage.monthTokenBudget <= 0) {
    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-text-muted">予算未設定</span>
        </div>
        <div className="h-2 w-full rounded-full bg-[#EAEEF4]" aria-hidden="true" />
        <p className="mt-2 text-[11px] text-text-muted tabular">
          当月の使用量：{usage.monthTokens.toLocaleString()} tokens
        </p>
        <p className="mt-1 text-[11px] text-text-muted">
          月間予算が未設定です。設定画面から予算を設定するとゲージが有効になります。
        </p>
        {usage.lastMeasuredAt ? (
          <p className="mt-2 text-[10px] text-text-muted tabular">
            最終計測：{formatDateTimeJa(usage.lastMeasuredAt)}
          </p>
        ) : null}
      </div>
    );
  }
  const preset = BAND_TEXT[usage.band];
  const percentClamped = Math.min(100, Math.max(0, usage.tokenPercent));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className={cn('text-xs font-medium', preset.className)}>{preset.label}</span>
        <span className={cn('text-lg font-semibold tabular', preset.className)}>
          {usage.tokenPercent}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[#EAEEF4]"
        role="progressbar"
        aria-valuenow={percentClamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="月間 API 予算の使用率"
      >
        <div
          className={cn('h-full transition-all duration-150', preset.bar)}
          style={{ width: `${percentClamped}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="mt-2 text-[11px] text-text-muted tabular">
        {usage.monthTokens.toLocaleString()} / {usage.monthTokenBudget.toLocaleString()} tokens
      </p>
      <p className="text-[11px] text-text-muted tabular">
        リクエスト数：{usage.monthRequests.toLocaleString()} 回（当月・参考値）
      </p>
      <p className="mt-2 text-[10px] text-text-muted tabular">
        最終計測：{usage.lastMeasuredAt ? formatDateTimeJa(usage.lastMeasuredAt) : '当月データなし'}
      </p>
      <div className="mt-3 flex gap-1.5 rounded-inline border border-border bg-primary-soft/40 px-2 py-1.5 text-[10px] text-primary">
        <Info className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
        <div className="space-y-0.5 leading-snug">
          <p>
            <strong>設定予算に対する使用の目安</strong>です。管理者が設定した月間予算を 100% としています。
          </p>
          <p>
            正式な請求・上限はご利用の API プロバイダの管理画面をご確認ください。
          </p>
          <p>
            ※ ご利用の API プランによっては、1 日あたりの上限で一時的に停止することがあります。月間ゲージが低い場合でも、短時間に集中して使うと制限に当たる可能性があります。
          </p>
        </div>
      </div>
    </div>
  );
}
