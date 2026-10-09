'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { departmentLabel } from '@/lib/ui/department';
import type { Department } from '@/lib/auth/session';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ADMIN_NAV: NavItem[] = [
  { href: '/admin/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/admin/documents', label: '文書管理', icon: FileText },
  { href: '/admin/users', label: 'ユーザー管理', icon: Users },
  { href: '/admin/ingestion', label: '取り込み状況', icon: Activity },
  { href: '/admin/audit-log', label: '監査ログ', icon: ClipboardList },
  { href: '/admin/settings', label: '設定', icon: Settings },
];

interface AdminSidebarProps {
  email: string;
  department: Department;
}

export function AdminSidebar({ email, department }: AdminSidebarProps) {
  const pathname = usePathname();
  return (
    <aside
      className="hidden shrink-0 flex-col justify-between bg-primary text-white md:flex md:w-64"
      aria-label="管理者ナビゲーション"
    >
      <div>
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-white/60">
            Consulting RAG
          </p>
          <p className="mt-1 text-sm font-semibold">管理者コンソール</p>
        </div>
        <nav className="mt-4 space-y-1 px-3">
          {ADMIN_NAV.map((item) => {
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
        <p className="text-xs text-white/60">所属（管理者）</p>
        <p className="mt-0.5 text-sm font-semibold">
          {departmentLabel(department)}
          <span className="ml-2 rounded-full bg-primary-accent px-2 py-0.5 text-[10px] font-medium text-white">
            管理者
          </span>
        </p>
        <p className="mt-3 truncate text-xs text-white/70" title={email}>
          {email}
        </p>
        <Link
          href="/"
          className="mt-3 inline-block text-[11px] text-white/70 hover:text-white"
        >
          ← 一般ユーザー画面に戻る
        </Link>
      </div>
    </aside>
  );
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
