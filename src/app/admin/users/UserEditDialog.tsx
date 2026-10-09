'use client';

import { useEffect, useMemo, useState } from 'react';
import { UserCog, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FieldError, FieldLabel } from '@/components/ui/Input';
import { departmentLabel } from '@/lib/ui/department';
import {
  ACCOUNT_STATUSES,
  DEPARTMENTS,
  DEFAULT_RETIREMENT_RETENTION_DAYS,
  RETIREMENT_RETENTION_DAYS,
  USER_ROLES,
  type AdminUserRecord,
  type RetirementRetentionDays,
} from '@/lib/admin/users-shared';
import type { AccountStatus, Department, UserRole } from '@/lib/auth/session';

interface Props {
  target: AdminUserRecord;
  isSelf: boolean;
  /**
   * この対象ユーザーが「他に有効な管理者がいない唯一の active admin」である場合に true。
   * - UI は認可ではないため、サーバー側（lib/admin/users.ts `hasOtherActiveAdmin` + 403）の防御はそのまま。
   * - UI では「押しても拒否される選択肢」を最初から選べなくして、誤操作の往復と混乱を減らす。
   */
  isLastActiveAdmin: boolean;
  onCancel: () => void;
  onSaved: (user: AdminUserRecord) => void;
}

function statusLabel(s: AccountStatus): string {
  switch (s) {
    case 'active':
      return '有効（通常利用中）';
    case 'suspended_leave':
      return '休職中';
    case 'suspended_retired':
      return '退職・停止中';
    case 'pending_deletion':
      return '削除予定';
  }
}

export function UserEditDialog({ target, isSelf, isLastActiveAdmin, onCancel, onSaved }: Props) {
  const [department, setDepartment] = useState<Department>(target.department);
  const [role, setRole] = useState<UserRole>(target.role);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>(target.accountStatus);
  const [retentionDays, setRetentionDays] = useState<RetirementRetentionDays>(
    DEFAULT_RETIREMENT_RETENTION_DAYS,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [loading, onCancel]);

  const isRetiring =
    accountStatus === 'suspended_retired' && target.accountStatus !== 'suspended_retired';
  const changed = useMemo(
    () =>
      department !== target.department ||
      role !== target.role ||
      accountStatus !== target.accountStatus,
    [department, role, accountStatus, target],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    setError(null);
    setLoading(true);
    try {
      const patch: Record<string, unknown> = {};
      if (department !== target.department) patch.department = department;
      if (role !== target.role) patch.role = role;
      if (accountStatus !== target.accountStatus) patch.accountStatus = accountStatus;
      if (isRetiring) patch.retirementRetentionDays = retentionDays;

      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? '変更に失敗しました');
        return;
      }
      onSaved(data.user);
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
      aria-labelledby="user-edit-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-primary/40 px-4"
    >
      <div className="w-full max-w-md rounded-card border border-border bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
              <UserCog className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="user-edit-title" className="text-base font-semibold text-text-primary">
              ユーザー情報の変更
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
          <p className="text-[11px] text-text-muted tabular">
            現在：{departmentLabel(target.department)} / {target.role === 'admin' ? '管理者' : '一般ユーザー'} /{' '}
            {statusLabel(target.accountStatus)}
          </p>
        </div>

        {isSelf ? (
          <Alert tone="warning" title="ご自身のアカウントです">
            <p className="text-[13px]">
              状態と権限は、ロックアウト防止のため変更できません。変更可能なのは部署のみです。
            </p>
          </Alert>
        ) : isLastActiveAdmin ? (
          <Alert tone="warning" title="このユーザーは、現在唯一の有効な管理者です">
            <p className="text-[13px]">
              管理者が 1 人もいなくなるのを防ぐため、停止・削除予定・権限の降格は選べません。先に別の管理者を作成してください。
            </p>
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" autoComplete="off">
          <div>
            <FieldLabel htmlFor="edit-user-dept" required>
              部署
            </FieldLabel>
            <select
              id="edit-user-dept"
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
            <FieldLabel htmlFor="edit-user-role" required>
              権限
            </FieldLabel>
            <select
              id="edit-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={isSelf || (isLastActiveAdmin && target.role === 'admin')}
              className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent disabled:cursor-not-allowed disabled:bg-primary-soft/40 disabled:text-text-muted"
            >
              {USER_ROLES.map((r) => {
                // 自分自身：現在のロールのみ選択可（管理者→一般への降格を UI で封じる）
                // 最後の管理者：admin のみ選択可（降格を UI で封じる）
                const disabled =
                  (isSelf && r !== target.role) ||
                  (isLastActiveAdmin && target.role === 'admin' && r !== 'admin');
                return (
                  <option key={r} value={r} disabled={disabled}>
                    {r === 'admin' ? '管理者' : '一般ユーザー'}
                    {disabled ? '（選べません）' : ''}
                  </option>
                );
              })}
            </select>
            {isSelf ? (
              <p className="mt-1 text-xs text-text-muted">
                ご自身の権限は変更できません。
              </p>
            ) : isLastActiveAdmin && target.role === 'admin' ? (
              <p className="mt-1 text-xs text-text-muted">
                唯一の管理者のため、権限を一般ユーザーに下げられません。
              </p>
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor="edit-user-status" required>
              状態
            </FieldLabel>
            <select
              id="edit-user-status"
              value={accountStatus}
              onChange={(e) => setAccountStatus(e.target.value as AccountStatus)}
              disabled={isSelf}
              className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent disabled:cursor-not-allowed disabled:bg-primary-soft/40 disabled:text-text-muted"
            >
              {ACCOUNT_STATUSES.map((s) => {
                // 自分自身：active 以外は選択不可
                // 最後の active 管理者：active 以外は選択不可（admin が 1 人もいなくなるのを防ぐ）
                const disabled =
                  (isSelf && s !== 'active') ||
                  (isLastActiveAdmin && target.role === 'admin' && s !== 'active');
                return (
                  <option key={s} value={s} disabled={disabled}>
                    {statusLabel(s)}
                    {disabled ? '（選べません）' : ''}
                  </option>
                );
              })}
            </select>
            {isSelf ? (
              <p className="mt-1 text-xs text-text-muted">
                ご自身のアカウントは、安全のため「有効」のまま変更できません。
              </p>
            ) : isLastActiveAdmin && target.role === 'admin' ? (
              <p className="mt-1 text-xs text-text-muted">
                唯一の管理者のため、「有効」のまま変更できません。
              </p>
            ) : accountStatus === 'pending_deletion' ? (
              <p className="mt-1 text-xs text-text-muted">
                「削除予定」は今すぐデータを消す操作ではありません。データは残ります。
              </p>
            ) : null}
          </div>

          {isRetiring ? (
            <div>
              <FieldLabel htmlFor="edit-user-retention" required>
                退職に伴う保持期間
              </FieldLabel>
              <select
                id="edit-user-retention"
                value={retentionDays}
                onChange={(e) =>
                  setRetentionDays(Number(e.target.value) as RetirementRetentionDays)
                }
                className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent"
              >
                {RETIREMENT_RETENTION_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d === 365 ? '1 年（365 日）' : `${d} 日`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-text-muted">
                この期間はアカウントを保持します。期間経過後に完全削除する機能は今後の対応です。
              </p>
            </div>
          ) : null}

          {error ? <FieldError>{error}</FieldError> : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onCancel} disabled={loading}>
              キャンセル
            </Button>
            <Button variant="primary" type="submit" loading={loading} disabled={!changed}>
              変更を保存する
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
