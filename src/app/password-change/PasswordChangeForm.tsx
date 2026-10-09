'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FieldLabel, Input } from '@/components/ui/Input';

interface PasswordChangeFormProps {
  isInitial: boolean;
  email: string;
}

interface ApiResponse {
  ok: boolean;
  error?: string;
}

const MIN_LENGTH = 10;

export function PasswordChangeForm({ isInitial, email }: PasswordChangeFormProps) {
  const router = useRouter();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const strengthHint = useMemo(() => {
    if (next.length === 0) return null;
    if (tooShort) return `${MIN_LENGTH - next.length} 文字たりません`;
    if (mismatch) return '確認用パスワードと一致しません';
    return '設定できるパスワードです';
  }, [next.length, tooShort, mismatch]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    if (tooShort) {
      setError(`パスワードは ${MIN_LENGTH} 文字以上で入力してください`);
      return;
    }
    if (mismatch) {
      setError('入力した2つのパスワードが一致しません');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword: next }),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'パスワードの変更に失敗しました。しばらく待って再度お試しください');
        setLoading(false);
        return;
      }
      setDone(true);
      setLoading(false);
      // 少し余韻を持たせてから遷移（ユーザーが完了メッセージを認識できるように）
      setTimeout(() => {
        router.replace('/');
        router.refresh();
      }, 900);
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card padding="lg">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-status-success" aria-hidden="true" />
          <p className="text-sm font-semibold text-text-primary">パスワードを変更しました</p>
          <p className="text-xs text-text-muted">まもなくホーム画面へ移動します。</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="rounded-inline border border-border bg-primary-soft/60 px-3 py-2 text-xs text-primary">
          対象アカウント：<span className="font-semibold">{email}</span>
        </div>
        {error ? (
          <Alert tone="danger" title="パスワードを変更できませんでした">
            {error}
          </Alert>
        ) : null}
        {isInitial ? (
          <Alert tone="info">
            初期パスワードのままではシステムを利用できません。他の人が推測しづらいパスワードを設定してください。
          </Alert>
        ) : null}
        <div>
          <FieldLabel htmlFor="next" required helper={`${MIN_LENGTH} 文字以上`}>
            新しいパスワード
          </FieldLabel>
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <Input
              id="next"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="pl-9"
              disabled={loading}
              invalid={tooShort}
            />
          </div>
          {strengthHint ? (
            <p
              className={`mt-1 text-xs ${
                tooShort || mismatch ? 'text-status-danger' : 'text-status-success'
              }`}
            >
              {strengthHint}
            </p>
          ) : null}
        </div>
        <div>
          <FieldLabel htmlFor="confirm" required>
            新しいパスワード（確認）
          </FieldLabel>
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="pl-9"
              disabled={loading}
              invalid={mismatch}
            />
          </div>
        </div>
        <Button type="submit" fullWidth loading={loading}>
          パスワードを変更する
        </Button>
      </form>
    </Card>
  );
}
