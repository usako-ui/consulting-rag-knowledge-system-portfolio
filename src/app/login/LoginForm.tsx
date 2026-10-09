'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FieldError, FieldLabel, Input } from '@/components/ui/Input';

interface LoginResponse {
  ok: boolean;
  error?: string;
  passwordChangeRequired?: boolean;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => null)) as LoginResponse | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'ログインに失敗しました。しばらく待って再度お試しください');
        setLoading(false);
        return;
      }
      const nextPath = data.passwordChangeRequired ? '/password-change' : '/';
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
      setLoading(false);
    }
  }

  return (
    <Card padding="lg">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error ? (
          <Alert tone="danger" title="ログインできませんでした">
            {error}
          </Alert>
        ) : null}
        <div>
          <FieldLabel htmlFor="email" required>
            メールアドレス
          </FieldLabel>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              placeholder="you@example.com"
              disabled={loading}
              invalid={Boolean(error)}
            />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="password" required helper="半角英数字 10 文字以上">
            パスワード
          </FieldLabel>
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              disabled={loading}
              invalid={Boolean(error)}
            />
          </div>
          <FieldError>{null}</FieldError>
        </div>
        <Button type="submit" fullWidth loading={loading}>
          ログイン
        </Button>
        <p className="text-xs text-text-muted">
          パスワードが分からない場合は、管理者へパスワードの再発行を依頼してください。
        </p>
      </form>
    </Card>
  );
}
