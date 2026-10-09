import type { ReactNode } from 'react';
import type { AuthenticatedUser } from '@/lib/auth/session';
import { departmentLabel } from '@/lib/ui/department';
import { AdminBottomNav } from './AdminBottomNav';
import { AdminSidebar } from './AdminSidebar';
import { LogoutButton } from './LogoutButton';
import { OfflineBanner } from './OfflineBanner';

interface AdminShellProps {
  user: AuthenticatedUser;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * 管理者専用のシェル。UserShell と別コンポーネントに分ける理由：
 *   - 権限別 UI の分離（要件 §16「一般ユーザーと管理者の UI 分離」）
 *   - サイドバー項目・下部ボトムナビが異なる
 *   - 「対応が必要なタスク」を上部に集約するダッシュボード前提のヘッダー
 */
export function AdminShell({ user, title, description, actions, children }: AdminShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-app text-text-primary">
      <OfflineBanner />
      <div className="flex min-h-0 flex-1">
        <AdminSidebar email={user.email} department={user.department} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-border bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-8 md:py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 md:hidden">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-primary-accent">
                    管理者コンソール
                  </p>
                </div>
                <h1 className="mt-0.5 truncate text-lg font-semibold text-text-primary md:text-xl">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-0.5 truncate text-sm text-text-muted">{description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden text-right md:block">
                  <p className="text-xs text-text-muted">{user.email}</p>
                  <p className="text-[11px] text-text-muted">
                    {departmentLabel(user.department)} / 管理者
                  </p>
                </div>
                <LogoutButton />
              </div>
            </div>
            {actions ? (
              <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 pb-3 md:px-8">
                {actions}
              </div>
            ) : null}
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-12">
            {children}
          </main>
        </div>
      </div>
      <AdminBottomNav />
    </div>
  );
}
