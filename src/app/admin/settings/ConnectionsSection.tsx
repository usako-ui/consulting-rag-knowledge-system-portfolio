'use client';

import { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/ui/cn';

interface Health {
  status: 'ok' | 'error' | 'unknown';
  latencyMs: number | null;
}

interface GeminiLastRecord {
  at: string;
  ok: boolean;
  latencyMs: number;
  model: string;
  errorCode: string | null;
}

interface Props {
  supabase: Health;
  slack: Health;
  geminiLast: GeminiLastRecord | null;
}

interface GeminiState {
  status: 'ok' | 'error' | 'unknown';
  latencyMs: number | null;
  model: string | null;
  checkedAt: string | null;
  cached: boolean;
  errorCode: string | null;
}

function badgeFromHealth(h: Health | null) {
  if (!h || h.status === 'unknown') return <StatusBadge kind="info" label="未確認" size="sm" />;
  if (h.status === 'ok') return <StatusBadge kind="success" label="接続済み" size="sm" />;
  return <StatusBadge kind="danger" label="確認できません" size="sm" />;
}

function badgeFromGemini(g: GeminiState | null) {
  if (!g) return <StatusBadge kind="info" label="未確認" size="sm" />;
  if (g.status === 'ok') return <StatusBadge kind="success" label="接続済み" size="sm" />;
  return <StatusBadge kind="danger" label="確認できません" size="sm" />;
}

function geminiFailureMessage(errorCode: string | null): string {
  if (errorCode === 'auth') {
    return 'Gemini（AIサービス）に接続できません。APIキーが無効、または設定されていない可能性があります。システムの開発・運用担当者に、APIキーの設定の確認を依頼してください。直ったら、もう一度「確認する」を押してください。';
  }
  if (errorCode != null && /429|rate.?limit|quota|too.?many/i.test(errorCode)) {
    return 'AIサービスの利用上限に達している可能性があります。しばらく時間をおいて、もう一度「確認する」を押してください。改善しない場合は、開発・運用担当者に連絡してください。';
  }
  return '接続の確認中に問題が発生しました。時間をおいて、もう一度「確認する」を押してください。改善しない場合は、開発・運用担当者に連絡してください。';
}

function formatRelativeMinutes(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'たった今';
  if (mins < 60) return `${mins} 分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 時間前`;
  const days = Math.floor(hours / 24);
  return `${days} 日前`;
}

export function ConnectionsSection({ supabase, slack, geminiLast }: Props) {
  const [gemini, setGemini] = useState<GeminiState | null>(
    geminiLast
      ? {
          status: geminiLast.ok ? 'ok' : 'error',
          latencyMs: geminiLast.latencyMs,
          model: geminiLast.model,
          checkedAt: geminiLast.at,
          cached: true,
          errorCode: geminiLast.errorCode,
        }
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/gemini-check', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Gemini の確認に失敗しました');
        return;
      }
      setGemini(data.result);
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text-primary">接続状態</h2>
      </div>
      <p className="mt-1 text-[11px] text-text-muted">
        システムが利用する外部サービスの疎通確認。環境変数の値は画面に表示しません。
      </p>

      <ul className="mt-3 space-y-2">
        <li className="flex items-center justify-between rounded-inline border border-border bg-white px-3 py-2">
          <div>
            <p className="text-sm font-medium text-text-primary">Supabase（データベース）</p>
            <p className="text-[11px] text-text-muted">
              {supabase.latencyMs !== null ? `応答時間：${supabase.latencyMs} ms` : '応答なし'}
            </p>
          </div>
          {badgeFromHealth(supabase)}
        </li>
        <li className="flex items-center justify-between rounded-inline border border-border bg-white px-3 py-2">
          <div>
            <p className="text-sm font-medium text-text-primary">Slack</p>
            <p className="text-[11px] text-text-muted">
              {slack.latencyMs !== null ? `応答時間：${slack.latencyMs} ms` : '応答なし'}
            </p>
          </div>
          {badgeFromHealth(slack)}
        </li>
        <li className="rounded-inline border border-border bg-white px-3 py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Gemini（AI）</p>
              <p className="text-[11px] text-text-muted">
                {gemini?.checkedAt
                  ? `最終確認：${formatRelativeMinutes(gemini.checkedAt)}${gemini.cached ? '（保存済みの結果を表示）' : ''}`
                  : 'まだ確認していません'}
                {gemini?.latencyMs !== null && gemini?.latencyMs !== undefined
                  ? ` / 応答 ${gemini.latencyMs} ms`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {badgeFromGemini(gemini)}
              <Button size="sm" variant="secondary" onClick={handleCheck} loading={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
                確認する
              </Button>
            </div>
          </div>
          {gemini?.status === 'error' ? (
            <p role="alert" className="mt-2 text-xs text-status-danger">
              {geminiFailureMessage(gemini.errorCode)}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-xs text-status-danger">
              {error}
            </p>
          ) : null}
          <p className="mt-2 text-[11px] text-text-muted">
            Gemini の確認は 1 回につき少量のトークンを消費します（ダッシュボードのゲージに反映されます）。前回確認から 5 分以内のボタン押下では、API を呼ばず前回の結果を表示します。
          </p>
        </li>
      </ul>
    </div>
  );
}
