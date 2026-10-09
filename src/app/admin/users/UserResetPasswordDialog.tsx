'use client';

import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Input';
import { departmentLabel } from '@/lib/ui/department';
import type { AdminUserRecord } from '@/lib/admin/users-shared';

interface Props {
  target: AdminUserRecord;
  onCancel: () => void;
  onIssued: (result: { temporaryPassword: string; targetEmail: string }) => void;
}

export function UserResetPasswordDialog({ target, onCancel, onIssued }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [loading, onCancel]);

  async function handleIssue() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${target.id}/reset-password`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'パスワード再発行に失敗しました');
        return;
      }
      onIssued({ temporaryPassword: data.temporaryPassword, targetEmail: data.targetEmail });
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-reset-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-primary/40 px-4"
    >
      <div className="w-full max-w-md rounded-card border border-border bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="user-reset-title" className="text-base font-semibold text-text-primary">
              パスワードを再発行しますか？
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
          <p className="text-xs text-text-muted">対象アカウント</p>
          <p className="mt-0.5 text-sm font-semibold text-text-primary">{target.email}</p>
          <p className="text-[11px] text-text-muted tabular">{departmentLabel(target.department)}</p>
        </div>

        <div className="space-y-2 text-sm text-text-primary">
          <p>この操作を行うと、次の状態になります：</p>
          <ul className="ml-4 list-disc space-y-1 text-[13px] text-text-muted">
            <li>新しい一時パスワードが発行されます（画面に 1 度だけ表示）</li>
            <li>本人の既存のログインセッションはすべて無効になります</li>
            <li>次回ログイン時に、本人による新しいパスワードへの変更が必要です</li>
          </ul>
        </div>

        <Alert tone="warning" className="mt-3" title="発行後の一時パスワードは 1 度しか表示されません">
          <p className="text-[13px]">
            発行画面を閉じると再表示できません。本人に直接お伝えください（平文メール送信は避けてください）。
          </p>
        </Alert>

        {error ? (
          <div className="mt-3">
            <FieldError>{error}</FieldError>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleIssue} loading={loading}>
            再発行する
          </Button>
        </div>
      </div>
    </div>
  );
}
