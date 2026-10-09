'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, KeyRound, UserCog, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { departmentLabel } from '@/lib/ui/department';
import { formatDateJa } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import type { AccountStatus, Department } from '@/lib/auth/session';
import type { AdminUserRecord } from '@/lib/admin/users-shared';
import { UserCreateDialog } from './UserCreateDialog';
import { UserEditDialog } from './UserEditDialog';
import { UserResetPasswordDialog } from './UserResetPasswordDialog';
import { TempPasswordModal } from './TempPasswordModal';

type StatusFilter = 'all' | AccountStatus;
type DeptFilter = 'all' | Department;
type SortKey = 'created' | 'email' | 'department' | 'status';
type SortDir = 'asc' | 'desc';

const ALL_DEPTS: DeptFilter[] = [
  'all',
  'strategy',
  'business',
  'it',
  'hr',
  'sales',
  'management',
];

const ALL_STATUSES: StatusFilter[] = [
  'all',
  'active',
  'suspended_leave',
  'suspended_retired',
  'pending_deletion',
];

function statusBadge(status: AccountStatus) {
  switch (status) {
    case 'active':
      return <StatusBadge kind="success" label="有効" size="sm" />;
    case 'suspended_leave':
      return <StatusBadge kind="warning" label="休職中" size="sm" />;
    case 'suspended_retired':
      return <StatusBadge kind="alert" label="退職・停止" size="sm" />;
    case 'pending_deletion':
      return <StatusBadge kind="danger" label="削除予定" size="sm" />;
  }
}

function statusFilterLabel(s: StatusFilter): string {
  switch (s) {
    case 'all':
      return 'すべての状態';
    case 'active':
      return '有効';
    case 'suspended_leave':
      return '休職中';
    case 'suspended_retired':
      return '退職・停止';
    case 'pending_deletion':
      return '削除予定';
  }
}

interface Props {
  users: AdminUserRecord[];
  currentUserId: string;
}

export function UsersTable({ users, currentUserId }: Props) {
  const router = useRouter();
  const [deptFilter, setDeptFilter] = useState<DeptFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // 「唯一の有効な管理者」の id（存在すれば UI 側で停止・降格を無効化・サーバー側の 403 と二重）
  // ★ UI は認可ではないので、サーバー側（hasOtherActiveAdmin）の防御はそのまま。
  //   ここで無効化するのは「押しても必ず拒否される選択肢」を UI 上で可視化して誤操作を減らす目的。
  const lastActiveAdminId = useMemo(() => {
    const actives = users.filter((u) => u.role === 'admin' && u.accountStatus === 'active');
    return actives.length === 1 ? actives[0].id : null;
  }, [users]);

  // モーダル state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserRecord | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserRecord | null>(null);
  const [tempPwState, setTempPwState] = useState<{
    temporaryPassword: string;
    targetEmail: string;
    title: string;
    description: string;
  } | null>(null);

  const [banner, setBanner] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = users;
    if (deptFilter !== 'all') list = list.filter((u) => u.department === deptFilter);
    if (statusFilter !== 'all') list = list.filter((u) => u.accountStatus === statusFilter);
    const sorted = [...list].sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case 'email':
          c = a.email.localeCompare(b.email);
          break;
        case 'department':
          c = a.department.localeCompare(b.department);
          break;
        case 'status':
          c = a.accountStatus.localeCompare(b.accountStatus);
          break;
        case 'created':
        default:
          c = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === 'asc' ? c : -c;
    });
    return sorted;
  }, [users, deptFilter, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created' ? 'desc' : 'asc');
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-inline border border-border bg-primary-soft/40 px-3 py-2">
        <label htmlFor="users-dept-filter" className="text-xs font-medium text-primary">
          部署
        </label>
        <select
          id="users-dept-filter"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value as DeptFilter)}
          className="h-8 rounded-inline border border-border bg-white px-2 text-xs text-text-primary focus:outline-none focus-visible:border-primary-accent"
        >
          {ALL_DEPTS.map((d) => (
            <option key={d} value={d}>
              {d === 'all' ? '全部署' : departmentLabel(d)}
            </option>
          ))}
        </select>

        <label htmlFor="users-status-filter" className="ml-2 text-xs font-medium text-primary">
          状態
        </label>
        <select
          id="users-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-8 rounded-inline border border-border bg-white px-2 text-xs text-text-primary focus:outline-none focus-visible:border-primary-accent"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusFilterLabel(s)}
            </option>
          ))}
        </select>

        <span className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-text-muted tabular">
            {filtered.length}件を表示
          </span>
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            新規登録
          </Button>
        </span>
      </div>

      {banner ? (
        <div
          role="status"
          className="mb-3 rounded-inline border border-[#B8E1CB] bg-[#E9F5EE] px-3 py-2 text-xs text-[#1F6B4C]"
        >
          {banner}
        </div>
      ) : null}

      {/* PC / タブレット */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <SortHeader
                label="メール"
                active={sortKey === 'email'}
                dir={sortDir}
                onClick={() => toggleSort('email')}
              />
              <SortHeader
                label="部署"
                active={sortKey === 'department'}
                dir={sortDir}
                onClick={() => toggleSort('department')}
              />
              <th className="px-3 py-2 font-medium">権限</th>
              <SortHeader
                label="状態"
                active={sortKey === 'status'}
                dir={sortDir}
                onClick={() => toggleSort('status')}
              />
              <SortHeader
                label="登録日"
                active={sortKey === 'created'}
                dir={sortDir}
                onClick={() => toggleSort('created')}
              />
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr
                  key={u.id}
                  className={cn(
                    'border-b border-border last:border-none',
                    u.accountStatus !== 'active' && 'opacity-80',
                  )}
                >
                  <td className="px-3 py-3">
                    <p className="font-medium text-text-primary">{u.email}</p>
                    {isSelf ? (
                      <p className="text-[11px] text-primary-accent">（自分自身のアカウント）</p>
                    ) : null}
                    {!u.passwordChanged ? (
                      <p className="text-[11px] text-text-muted">
                        初回パスワード未変更
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge kind="info" label={departmentLabel(u.department)} size="sm" />
                  </td>
                  <td className="px-3 py-3 text-xs text-text-primary">
                    {u.role === 'admin' ? '管理者' : '一般ユーザー'}
                  </td>
                  <td className="px-3 py-3">
                    {statusBadge(u.accountStatus)}
                    {u.retirementRetentionDeadline ? (
                      <p className="mt-1 text-[11px] text-text-muted tabular">
                        保持期限：{formatDateJa(u.retirementRetentionDeadline)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-xs text-text-muted tabular">
                    {formatDateJa(u.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditTarget(u)}
                        className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary hover:bg-primary-soft"
                      >
                        <UserCog className="h-3 w-3" aria-hidden="true" />
                        編集
                      </button>
                      {isSelf ? (
                        // 自分自身の行では PW 再発行を非表示（即ログアウトになる・要件§3 想定外）。
                        // 設定ページの通常パスワード変更へ誘導する
                        <span className="text-[11px] text-text-muted">
                          ご自身のパスワード変更は{' '}
                          <Link href="/settings" className="text-primary-accent hover:underline">
                            設定ページ
                          </Link>
                          から
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setResetTarget(u)}
                          className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary hover:bg-primary-soft"
                        >
                          <KeyRound className="h-3 w-3" aria-hidden="true" />
                          パスワード再発行
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* モバイル */}
      <ul className="divide-y divide-border md:hidden">
        {filtered.map((u) => {
          const isSelf = u.id === currentUserId;
          return (
            <li
              key={u.id}
              className={cn('px-2 py-3', u.accountStatus !== 'active' && 'opacity-80')}
            >
              <p className="text-sm font-semibold text-text-primary">{u.email}</p>
              {isSelf ? (
                <p className="text-[11px] text-primary-accent">（自分自身のアカウント）</p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge kind="info" label={departmentLabel(u.department)} size="sm" />
                {statusBadge(u.accountStatus)}
                <span className="text-[11px] text-text-muted">
                  {u.role === 'admin' ? '管理者' : '一般ユーザー'}
                </span>
              </div>
              {u.retirementRetentionDeadline ? (
                <p className="mt-1 text-[11px] text-text-muted tabular">
                  保持期限：{formatDateJa(u.retirementRetentionDeadline)}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-text-muted tabular">
                登録：{formatDateJa(u.createdAt)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(u)}
                  className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary"
                >
                  編集
                </button>
                {isSelf ? (
                  <span className="text-[11px] text-text-muted">
                    パスワード変更は{' '}
                    <Link href="/settings" className="text-primary-accent hover:underline">
                      設定
                    </Link>
                    から
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setResetTarget(u)}
                    className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary"
                  >
                    パスワード再発行
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {createOpen ? (
        <UserCreateDialog
          onCancel={() => setCreateOpen(false)}
          onCreated={({ user, temporaryPassword }) => {
            setCreateOpen(false);
            setTempPwState({
              temporaryPassword,
              targetEmail: user.email,
              title: '新規登録が完了しました',
              description:
                'このアカウントの一時パスワードは、いま画面上でのみ確認できます。閉じると再表示できません。',
            });
            router.refresh();
          }}
        />
      ) : null}

      {editTarget ? (
        <UserEditDialog
          target={editTarget}
          isSelf={editTarget.id === currentUserId}
          isLastActiveAdmin={editTarget.id === lastActiveAdminId}
          onCancel={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            setBanner('ユーザー情報を更新しました。');
            window.setTimeout(() => setBanner(null), 3000);
            router.refresh();
          }}
        />
      ) : null}

      {resetTarget ? (
        <UserResetPasswordDialog
          target={resetTarget}
          onCancel={() => setResetTarget(null)}
          onIssued={({ temporaryPassword, targetEmail }) => {
            setResetTarget(null);
            setTempPwState({
              temporaryPassword,
              targetEmail,
              title: '新しい一時パスワードを発行しました',
              description:
                '既存のログインセッションは無効化されました。次回ログイン時にパスワードを変更していただきます。',
            });
            router.refresh();
          }}
        />
      ) : null}

      {tempPwState ? (
        <TempPasswordModal
          temporaryPassword={tempPwState.temporaryPassword}
          targetEmail={tempPwState.targetEmail}
          title={tempPwState.title}
          description={tempPwState.description}
          onClose={() => setTempPwState(null)}
        />
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 hover:text-primary',
          active && 'text-primary',
        )}
      >
        {label}
        <ArrowUpDown
          className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')}
          aria-hidden="true"
        />
        {active ? <span className="sr-only">{dir === 'asc' ? '昇順' : '降順'}</span> : null}
      </button>
    </th>
  );
}
