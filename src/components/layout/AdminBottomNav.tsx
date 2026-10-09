'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, FileText, LayoutDashboard, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const NAV: Item[] = [
  {
    href: '/admin/dashboard',
    label: 'ダッシュボード',
    icon: LayoutDashboard,
    match: (p) => p === '/admin/dashboard' || p === '/admin',
  },
  {
    href: '/admin/documents',
    label: '文書',
    icon: FileText,
    match: (p) => p.startsWith('/admin/documents'),
  },
  {
    href: '/admin/users',
    label: 'ユーザー',
    icon: Users,
    match: (p) => p.startsWith('/admin/users'),
  },
  {
    href: '/admin/ingestion',
    label: '取込',
    icon: Activity,
    match: (p) => p.startsWith('/admin/ingestion'),
  },
];

export function AdminBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="管理者モバイルナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors duration-150',
                  active ? 'text-primary-accent' : 'text-text-muted',
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'text-primary-accent')} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
