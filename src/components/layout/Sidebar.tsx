'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, History, Home, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { departmentLabel } from '@/lib/ui/department';
import type { AccountStatus, Department, UserRole } from '@/lib/auth/session';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

function buildNav(role: UserRole): NavItem[] {
  return [
    { href: '/', label: 'ホーム', icon: Home },
    {
      href: '/documents',
      label: role === 'admin' ? '全部署の資料' : '自部署の資料',
      icon: FileText,
    },
    { href: '/history', label: '検索履歴', icon: History },
    { href: '/settings', label: '設定', icon: Settings },
  ];
}

interface SidebarProps {
  email: string;
  department: Department;
  role: UserRole;
  /**
   * account_status。サーバー側で判定済みの user オブジェクトから受け取る。
   * クライアント側で権限を再判定しない（PM 指示・UI の表示制御は認可ではない）。
   */
  accountStatus: AccountStatus;
}

export function Sidebar({ email, department, role, accountStatus }: SidebarProps) {
  const nav = buildNav(role);
  const pathname = usePathname();
  // 管理者コンソール入口の表示条件：role='admin' かつ active。
  // 一般ユーザーには DOM に描画しない（display:none ではない）。
  const showAdminEntry = role === 'admin' && accountStatus === 'active';
  return (
    <aside
      className="hidden shrink-0 flex-col justify-between bg-primary text-white md:flex md:w-64"
      aria-label="メインナビゲーション"
    >
      <div>
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-white/60">
            Consulting RAG
          </p>
          <p className="mt-1 text-sm font-semibold">ナレッジ検索</p>
        </div>
        <nav className="mt-4 space-y-1 px-3">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-inline px-3 py-2 text-sm transition-colors duration-150',
                  active
                    ? 'bg-primary-accent text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-white/10 px-6 py-4">
        <p className="text-xs text-white/60">
          {role === 'admin' ? '所属（管理者）' : '所属部署'}
        </p>
        <p className="mt-0.5 text-sm font-semibold">
          {departmentLabel(department)}
          {role === 'admin' ? (
            <span className="ml-2 rounded-full bg-primary-accent px-2 py-0.5 text-[10px] font-medium text-white">
              管理者
            </span>
          ) : null}
        </p>
        <p className="mt-3 truncate text-xs text-white/70" title={email}>
          {email}
        </p>
        {showAdminEntry ? (
          <Link
            href="/admin/dashboard"
            className="mt-3 inline-flex items-center gap-1.5 rounded-inline bg-primary-accent/20 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors duration-150 hover:bg-primary-accent/40"
          >
            <LayoutDashboard className="h-3 w-3" aria-hidden="true" />
            管理者コンソールへ
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/search');
  return pathname === href || pathname.startsWith(`${href}/`);
}
