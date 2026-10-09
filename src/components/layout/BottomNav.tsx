'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, History, Home, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const NAV: Item[] = [
  { href: '/', label: 'ホーム', icon: Home, match: (p) => p === '/' },
  { href: '/search', label: '検索', icon: Search, match: (p) => p.startsWith('/search') },
  {
    href: '/history',
    label: '履歴',
    icon: History,
    match: (p) => p.startsWith('/history'),
  },
  {
    href: '/documents',
    label: '資料',
    icon: FileText,
    match: (p) => p.startsWith('/documents'),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="モバイルナビゲーション"
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
