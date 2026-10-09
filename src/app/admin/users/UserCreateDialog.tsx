'use client';

import { useEffect, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FieldError, FieldLabel, Input } from '@/components/ui/Input';
import { departmentLabel } from '@/lib/ui/department';
import { DEPARTMENTS, USER_ROLES, type AdminUserRecord } from '@/lib/admin/users-shared';
import type { Department, UserRole } from '@/lib/auth/session';

interface Props {
  onCancel: () => void;
  onCreated: (result: { user: AdminUserRecord; temporaryPassword: string }) => void;
}

export function UserCreateDialog({ onCancel, onCreated }: Props) {
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState<Department>('strategy');
  const [role, setRole] = useState<UserRole>('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [loading, onCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), department, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'ユーザーの登録に失敗しました');
        return;
      }
      // 一時パスワードは呼び出し元で TempPasswordModal に渡す
      onCreated({ user: data.user, temporaryPassword: data.temporaryPassword });
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
      aria-labelledby="user-create-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-primary/40 px-4"
    >
      <div className="w-full max-w-md rounded-card border border-border bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="user-create-title" className="text-base font-semibold text-text-primary">
              新規ユーザー登録
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

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <FieldLabel htmlFor="new-user-email" required>
              メールアドレス
            </FieldLabel>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
              placeholder="user@example.co.jp"
            />
          </div>

          <div>
            <FieldLabel htmlFor="new-user-dept" required>
              部署
            </FieldLabel>
            <select
              id="new-user-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
              className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {departmentLabel(d)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel htmlFor="new-user-role" required>
              権限
            </FieldLabel>
            <select
              id="new-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent"
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r === 'admin' ? '管理者' : '一般ユーザー'}
                </option>
              ))}
            </select>
          </div>

          <Alert tone="info" title="登録直後に一時パスワードが 1 度だけ表示されます">
            <p className="text-[13px]">
              画面を閉じると再表示できません。本人に直接お伝えいただき、初回ログイン時にパスワード変更を促してください。
            </p>
          </Alert>

          {error ? <FieldError>{error}</FieldError> : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onCancel} disabled={loading}>
              キャンセル
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              登録する
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
