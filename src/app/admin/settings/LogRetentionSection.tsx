'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FieldError, FieldLabel } from '@/components/ui/Input';
import {
  DEFAULT_LOG_RETENTION_DAYS,
  LOG_RETENTION_DAYS_CHOICES,
  type LogRetentionDays,
  logRetentionLabel,
} from '@/lib/admin/log-retention-shared';

interface Props {
  currentDays: LogRetentionDays;
}

export function LogRetentionSection({ currentDays }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<LogRetentionDays>(currentDays ?? DEFAULT_LOG_RETENTION_DAYS);
  const [preview, setPreview] = useState<{ toDelete: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // 選択が変わるたびに削除対象件数をプレビュー
  useEffect(() => {
    if (!editing) return;
    let aborted = false;
    (async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch(
          `/api/admin/settings/log-retention?days=${selected}`,
          { credentials: 'include' },
        );
        const data = await res.json().catch(() => null);
        if (!aborted && res.ok && data?.ok) {
          setPreview({ toDelete: data.toDelete });
        }
      } finally {
        if (!aborted) setPreviewLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [selected, editing]);

  async function handleSave() {
    setError(null);
    setBanner(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/log-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newValueDays: selected }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? '保存期間の変更に失敗しました');
        return;
      }
      setBanner(
        `ログ保存期間を ${logRetentionLabel(currentDays)} → ${logRetentionLabel(selected)} に変更しました。変更前後は監査ログに記録されています。`,
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

  const willShrink = selected < currentDays;

  return (
    <div>
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text-primary">ログ保存期間</h2>
      </div>
      <p className="mt-1 text-[11px] text-text-muted">
        監査ログの保持期間です。期間を過ぎたログは月次の自動削除ジョブで整理されます。
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
            <p className="text-[11px] text-text-muted">現在の設定</p>
            <p className="text-lg font-semibold text-text-primary tabular">
              {logRetentionLabel(currentDays)}
            </p>
          </div>
          {!editing ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              変更する
            </Button>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-3 space-y-3">
            <div>
              <FieldLabel htmlFor="retention-select" required>
                新しい保存期間
              </FieldLabel>
              <select
                id="retention-select"
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value) as LogRetentionDays)}
                className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent"
              >
                {LOG_RETENTION_DAYS_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {logRetentionLabel(d)}
                  </option>
                ))}
              </select>
            </div>

            {selected === currentDays ? (
              <Alert tone="info" title="変更内容はありません">
                <p className="text-[13px]">現在と同じ期間が選択されています。</p>
              </Alert>
            ) : willShrink ? (
              <Alert tone="warning" title="短縮する変更です">
                <p className="text-[13px]">
                  {logRetentionLabel(currentDays)} → {logRetentionLabel(selected)} に短縮すると、
                  {previewLoading
                    ? '削除対象件数を計算中…'
                    : preview
                      ? `次回の削除ジョブで ${preview.toDelete.toLocaleString()} 件の監査ログが削除対象になります。`
                      : '削除対象件数を取得できませんでした。'}
                  削除後は復元できません。
                </p>
              </Alert>
            ) : (
              <Alert tone="info" title="延長する変更です">
                <p className="text-[13px]">
                  {logRetentionLabel(currentDays)} → {logRetentionLabel(selected)} に延長します。既存の監査ログに影響はありません（保持期間が長くなるため）。
                </p>
              </Alert>
            )}

            {error ? <FieldError>{error}</FieldError> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={handleSave}
                loading={loading}
                disabled={selected === currentDays}
              >
                変更を保存する
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setSelected(currentDays);
                  setError(null);
                  setPreview(null);
                }}
                disabled={loading}
              >
                キャンセル
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
