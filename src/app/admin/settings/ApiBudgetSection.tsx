'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FieldError, FieldLabel, Input } from '@/components/ui/Input';

interface Props {
  currentBudget: number;
}

export function ApiBudgetSection({ currentBudget }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(String(currentBudget));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBanner(null);
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      setError('月間予算は 1 以上の整数で指定してください');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/api-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newValueTokens: n }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? '月間予算の変更に失敗しました');
        return;
      }
      setBanner(
        `月間 API 予算を ${currentBudget.toLocaleString()} → ${n.toLocaleString()} tokens に変更しました。変更前後は監査ログに記録されています。`,
      );
      setEditing(false);
      window.setTimeout(() => setBanner(null), 6000);
      router.refresh();
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text-primary">月間 API 予算</h2>
      </div>
      <p className="mt-1 text-[11px] text-text-muted">
        ダッシュボードの使用量ゲージ（70%/90%/100%）の基準値です。開発検証用の目安であり、正式な上限はご利用プロバイダの管理画面でご確認ください。
      </p>

      {banner ? (
        <div
          role="status"
          className="mt-3 rounded-inline border border-[#B8E1CB] bg-[#E9F5EE] px-3 py-2 text-xs text-[#1F6B4C]"
        >
          {banner}
        </div>
      ) : null}

      <div className="mt-3 rounded-inline border border-border bg-white px-3 py-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-text-muted">現在の月間予算</p>
            <p className="text-lg font-semibold text-text-primary tabular">
              {currentBudget.toLocaleString()} tokens
            </p>
          </div>
          {!editing ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              変更する
            </Button>
          ) : null}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="mt-3 space-y-2">
            <div>
              <FieldLabel htmlFor="budget-input" required>
                新しい月間予算（tokens）
              </FieldLabel>
              <Input
                id="budget-input"
                type="number"
                inputMode="numeric"
                min={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" variant="primary" loading={loading}>
                保存する
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setValue(String(currentBudget));
                  setError(null);
                }}
                disabled={loading}
              >
                キャンセル
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
