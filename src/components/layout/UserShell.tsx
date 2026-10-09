import type { ReactNode } from 'react';
import type { AuthenticatedUser } from '@/lib/auth/session';
import { departmentLabel } from '@/lib/ui/department';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { DepartmentScope } from './DepartmentScope';
import { LogoutButton } from './LogoutButton';
import { OfflineBanner } from './OfflineBanner';

interface UserShellProps {
  user: AuthenticatedUser;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function UserShell({ user, title, description, actions, children }: UserShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-app text-text-primary">
      <OfflineBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          email={user.email}
          department={user.department}
          role={user.role}
          accountStatus={user.accountStatus}
        />
        <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-8 md:py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 md:hidden">
                <p className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
                  Consulting RAG
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
                  {departmentLabel(user.department)} / {user.role === 'admin' ? '管理者' : '一般ユーザー'}
                </p>
              </div>
              <LogoutButton />
            </div>
          </div>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 pb-3 md:px-8">
            <DepartmentScope department={user.department} role={user.role} />
            {actions}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-12">
          {children}
        </main>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
