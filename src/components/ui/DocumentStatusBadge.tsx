import type { DocumentStatus } from '@/lib/documents/list';
import { StatusBadge, type StatusKind } from './StatusBadge';

const MAP: Record<DocumentStatus, { kind: StatusKind; label: string }> = {
  success: { kind: 'success', label: '取り込み完了' },
  processing: { kind: 'processing', label: '処理中' },
  retrying: { kind: 'processing', label: '再試行中' },
  failed: { kind: 'danger', label: '失敗' },
  pending: { kind: 'info', label: '待機中' },
  unknown: { kind: 'info', label: '状態不明' },
};

export function DocumentStatusBadge({ status, size = 'sm' }: { status: DocumentStatus; size?: 'sm' | 'md' }) {
  const preset = MAP[status];
  return <StatusBadge kind={preset.kind} label={preset.label} size={size} />;
}
