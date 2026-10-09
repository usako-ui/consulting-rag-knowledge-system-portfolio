'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface Props {
  temporaryPassword: string;
  targetEmail: string;
  /** 「新規登録が完了しました」/「新しい一時パスワードを発行しました」等 */
  title: string;
  description?: string;
  onClose: () => void;
}

/**
 * 一時パスワードを 1 度だけ表示するモーダル。
 *   - コピーボタン付
 *   - 画面を閉じるとパスワードは失われる旨を明示
 *   - このコンポーネントは平文 PW を props として受け取るが、
 *     取得元 API のレスポンスヘッダに Cache-Control: no-store が付いている前提。
 *   - localStorage / sessionStorage には書かない
 *
 * ★ 一時 PW の取り扱いポリシー：
 *   - DB 非保存（Supabase Auth の bcrypt hash のみ）
 *   - サーバーログ非保存
 *   - 監査ログ非保存
 *   - クライアント側でも保存しない（本コンポーネント State のみ）
 */
export function TempPasswordModal({
  temporaryPassword,
  targetEmail,
  title,
  description,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Esc で誤って閉じるのを防ぐ（明示的な「閉じる」ボタンで確認を経る）
      if (e.key === 'Escape') e.preventDefault();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード API 失敗時：手動選択を促す（何もしない）
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="temp-pw-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 px-4"
    >
      <div className="w-full max-w-md rounded-card border border-border bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="temp-pw-dialog-title" className="text-base font-semibold text-text-primary">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-inline p-1 text-text-muted hover:text-primary disabled:opacity-40"
            aria-label="閉じる"
            disabled={!confirmed}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {description ? (
          <p className="mb-3 text-sm text-text-muted">{description}</p>
        ) : null}

        <div className="mb-3 rounded-inline border border-border bg-primary-soft/40 px-3 py-2">
          <p className="text-xs text-text-muted">対象アカウント</p>
          <p className="mt-0.5 text-sm font-medium text-text-primary">{targetEmail}</p>
        </div>

        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-text-primary">一時パスワード</p>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-inline border border-border bg-white px-3 py-2 font-mono text-sm text-text-primary select-all tabular">
              {temporaryPassword}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-3 text-xs text-primary hover:bg-primary-soft"
              aria-label="一時パスワードをコピー"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  コピー済
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  コピー
                </>
              )}
            </button>
          </div>
        </div>

        <Alert tone="warning" title="このパスワードは 1 度しか表示されません">
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>画面を閉じると再表示できません（システム内にも残しません）。</li>
            <li>本人に直接（口頭・社内メッセージ等）お伝えください。メールで平文を送らないでください。</li>
            <li>本人は初回ログイン後、新しいパスワードへの変更が必要です。</li>
          </ul>
        </Alert>

        <div className="mt-5 flex items-start gap-2">
          <input
            id="temp-pw-confirm"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border"
          />
          <label htmlFor="temp-pw-confirm" className="text-sm text-text-primary">
            一時パスワードを控えました。閉じても問題ありません。
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <Button variant="primary" onClick={onClose} disabled={!confirmed}>
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}
