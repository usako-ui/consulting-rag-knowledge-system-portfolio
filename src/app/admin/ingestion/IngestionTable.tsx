'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, RefreshCw } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { departmentLabel } from '@/lib/ui/department';
import { formatDateJa } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import {
  INGESTION_STATUS_LABEL,
  PERMANENT_INGEST_ERROR_CODES,
  type IngestionLogRecord,
  type IngestionStatus,
} from '@/lib/admin/ingestion-shared';
import { toUserMessage } from '@/lib/ingest/errors';
import type { IngestErrorCode } from '@/lib/ingest/types';

interface Props {
  rows: IngestionLogRecord[];
}

function statusKind(
  s: IngestionStatus,
): 'success' | 'warning' | 'alert' | 'danger' | 'processing' | 'info' {
  switch (s) {
    case 'pending':
      return 'info';
    case 'processing':
      return 'processing';
    case 'retrying':
      return 'warning';
    case 'failed':
      return 'danger';
    case 'success':
      return 'success';
  }
}

const STALE_MS = 30 * 60 * 1000; // 30 分

export function IngestionTable({ rows }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dispatchPending, setDispatchPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry(row: IngestionLogRecord) {
    setError(null);
    setBanner(null);
    setPendingId(row.id);
    try {
      const res = await fetch(`/api/admin/ingestion/${row.id}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? '再取り込みの予約に失敗しました');
        return;
      }

      // 再取り込み予約成功 → 自動で GHA dispatch
      let dispatched = false;
      try {
        const dr = await fetch('/api/dispatch/ingest', { method: 'POST', credentials: 'include' });
        const dd = await dr.json().catch(() => null);
        dispatched = dr.ok && dd?.ok === true;
      } catch {
        // silent — 「取り込みを開始する」ボタンで手動起動可
      }

      setBanner(
        dispatched
          ? '再取り込みを開始しました。1〜2 分後に状態が更新されます。このページを更新して確認してください。'
          : '再取り込みを予約しました。「取り込みを開始する」ボタンか、次回の月次実行時に処理されます。',
      );
      window.setTimeout(() => {
        setBanner(null);
        router.refresh();
      }, dispatched ? 8000 : 6000);
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
    } finally {
      setPendingId(null);
    }
  }

  async function handleDispatch() {
    setError(null);
    setBanner(null);
    setDispatchPending(true);
    try {
      const res = await fetch('/api/dispatch/ingest', { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? '取り込みの起動に失敗しました');
        return;
      }
      setBanner('取り込みを開始しました。処理には数分かかります。このページを更新すると状態が反映されます。');
      window.setTimeout(() => { setBanner(null); router.refresh(); }, 8000);
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
    } finally {
      setDispatchPending(false);
    }
  }

  return (
    <div>
      {banner ? (
        <div
          role="status"
          className="mb-3 rounded-inline border border-[#B8E1CB] bg-[#E9F5EE] px-3 py-2 text-xs text-[#1F6B4C]"
        >
          {banner}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mb-3 rounded-inline border border-[#EFBEBA] bg-[#FBE7E5] px-3 py-2 text-xs text-[#8F332C]"
        >
          {error}
        </div>
      ) : null}

      {/* PC / タブレット */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2 font-medium">日時</th>
              <th className="px-3 py-2 font-medium">ファイル／資料</th>
              <th className="px-3 py-2 font-medium">部署</th>
              <th className="px-3 py-2 font-medium">状態</th>
              <th className="px-3 py-2 font-medium">エラー詳細</th>
              <th className="px-3 py-2 font-medium">試行回数</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isFailed = row.status === 'failed';
              const isPermanentError =
                row.errorCode != null &&
                PERMANENT_INGEST_ERROR_CODES.has(row.errorCode as IngestErrorCode);
              const canRetry = isFailed && !isPermanentError;
              const isPermanentFailure = isFailed && isPermanentError;
              const isStale =
                row.status === 'pending' &&
                Date.now() - new Date(row.createdAt).getTime() > STALE_MS;
              const errorMsg = row.errorCode
                ? toUserMessage(row.errorCode as IngestErrorCode)
                : null;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border last:border-none',
                    row.status !== 'failed' && row.status !== 'processing' && 'opacity-80',
                  )}
                >
                  <td className="px-3 py-3 text-xs text-text-muted tabular">
                    {formatDateJa(row.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-text-primary">
                      {row.document?.title ?? (row.status === 'success' ? '（資料は削除済み）' : '（取り込み前）')}
                    </p>
                    <p className="text-[11px] text-text-muted tabular">{row.fileId}</p>
                  </td>
                  <td className="px-3 py-3 text-xs text-text-primary">
                    {row.document?.department ? departmentLabel(row.document.department) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge
                      kind={statusKind(row.status)}
                      label={INGESTION_STATUS_LABEL[row.status]}
                      size="sm"
                    />
                  </td>
                  <td className="px-3 py-3 max-w-xs">
                    {errorMsg ? (
                      <p className="text-xs text-text-primary break-words">{errorMsg}</p>
                    ) : null}
                    {row.errorCode ? (
                      <p className="mt-0.5 text-[10px] text-text-muted tabular">
                        コード: {row.errorCode}
                      </p>
                    ) : !errorMsg ? (
                      <span className="text-xs text-text-muted">—</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-xs text-text-primary tabular">
                    {row.retryCount}
                  </td>
                  <td className="px-3 py-3">
                    {canRetry ? (
                      <button
                        type="button"
                        onClick={() => handleRetry(row)}
                        disabled={pendingId === row.id}
                        className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary hover:bg-primary-soft disabled:opacity-60"
                      >
                        <RefreshCw
                          className={cn('h-3 w-3', pendingId === row.id && 'animate-spin')}
                          aria-hidden="true"
                        />
                        再取り込み
                      </button>
                    ) : isPermanentFailure ? (
                      <p className="max-w-[10rem] text-[11px] text-text-muted break-words">
                        元のファイルを直して、もう一度アップロードしてください。
                      </p>
                    ) : isStale ? (
                      <button
                        type="button"
                        onClick={handleDispatch}
                        disabled={dispatchPending}
                        className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary hover:bg-primary-soft disabled:opacity-60"
                      >
                        <Play
                          className={cn('h-3 w-3', dispatchPending && 'animate-pulse')}
                          aria-hidden="true"
                        />
                        取り込みを開始する
                      </button>
                    ) : (
                      <span className="text-[11px] text-text-muted">
                        {row.status === 'retrying' || row.status === 'pending'
                          ? '予約済'
                          : row.status === 'processing'
                            ? '処理中'
                            : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* モバイル */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => {
          const isFailed = row.status === 'failed';
          const isPermanentError =
            row.errorCode != null &&
            PERMANENT_INGEST_ERROR_CODES.has(row.errorCode as IngestErrorCode);
          const canRetry = isFailed && !isPermanentError;
          const isPermanentFailure = isFailed && isPermanentError;
          const isStale =
            row.status === 'pending' &&
            Date.now() - new Date(row.createdAt).getTime() > STALE_MS;
          const errorMsg = row.errorCode
            ? toUserMessage(row.errorCode as IngestErrorCode)
            : null;
          return (
            <li
              key={row.id}
              className={cn(
                'px-2 py-3',
                row.status !== 'failed' && row.status !== 'processing' && 'opacity-80',
              )}
            >
              <p className="text-sm font-semibold text-text-primary">
                {row.document?.title ?? (row.status === 'success' ? '（資料は削除済み）' : '（取り込み前）')}
              </p>
              <p className="text-[11px] text-text-muted tabular">{row.fileId}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge
                  kind={statusKind(row.status)}
                  label={INGESTION_STATUS_LABEL[row.status]}
                  size="sm"
                />
                {row.document?.department ? (
                  <StatusBadge
                    kind="info"
                    label={departmentLabel(row.document.department)}
                    size="sm"
                  />
                ) : null}
              </div>
              {errorMsg ? (
                <p className="mt-1 text-[11px] text-text-primary">{errorMsg}</p>
              ) : null}
              {row.errorCode ? (
                <p className="mt-0.5 text-[10px] text-text-muted tabular">
                  コード: {row.errorCode}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-text-muted tabular">
                {formatDateJa(row.createdAt)} / 試行 {row.retryCount} 回
              </p>
              {canRetry ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => handleRetry(row)}
                    disabled={pendingId === row.id}
                    className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary disabled:opacity-60"
                  >
                    <RefreshCw
                      className={cn('h-3 w-3', pendingId === row.id && 'animate-spin')}
                      aria-hidden="true"
                    />
                    再取り込み
                  </button>
                </div>
              ) : isPermanentFailure ? (
                <p className="mt-2 text-[11px] text-text-muted">
                  元のファイルを直して、もう一度アップロードしてください。
                </p>
              ) : isStale ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleDispatch}
                    disabled={dispatchPending}
                    className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary disabled:opacity-60"
                  >
                    <Play
                      className={cn('h-3 w-3', dispatchPending && 'animate-pulse')}
                      aria-hidden="true"
                    />
                    取り込みを開始する
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
