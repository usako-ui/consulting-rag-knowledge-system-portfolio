'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

interface LogoutButtonProps {
  className?: string;
}

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-inline px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors duration-150 hover:text-primary disabled:opacity-60',
        className,
      )}
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      ログアウト
    </button>
  );
}
