'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { AdminDocumentItem } from '@/lib/documents/admin-list';
import { Button } from '@/components/ui/Button';
import { departmentLabel } from '@/lib/ui/department';

interface Props {
  target: AdminDocumentItem;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({ target, loading, onCancel, onConfirm }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [loading, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 px-4"
    >
      <div className="w-full max-w-md rounded-card border border-border bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#FBE7E5] text-status-danger">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="delete-dialog-title" className="text-base font-semibold text-text-primary">
              資料を削除しますか？
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-inline p-1 text-text-muted hover:text-primary"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 rounded-inline border border-border bg-primary-soft/40 px-3 py-2">
          <p className="text-xs text-text-muted">対象資料</p>
          <p className="mt-0.5 text-sm font-semibold text-text-primary">{target.title}</p>
          <p className="text-[11px] text-text-muted tabular">
            {departmentLabel(target.department)} / {target.fileId}
          </p>
        </div>

        <div className="space-y-2 text-sm text-text-primary">
          <p>この操作を行うと、次の状態になります：</p>
          <ul className="ml-4 list-disc space-y-1 text-[13px] text-text-muted">
            <li>この資料が <strong>一般ユーザーの検索結果</strong> に表示されなくなります</li>
            <li>この資料が <strong>資料一覧画面</strong> に表示されなくなります</li>
            <li>Slack から質問しても、この資料は出典として返らなくなります</li>
            <li>データは監査目的で残ります（物理削除ではありません）</li>
          </ul>
          <p className="mt-3 text-[13px] text-text-muted">
            誤って削除した場合は、後で「無効化中の資料も表示」にチェックを入れて再有効化できます。
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            削除する
          </Button>
        </div>
      </div>
    </div>
  );
}
