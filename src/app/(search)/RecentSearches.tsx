'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock, History } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { clearRecentSearches, readRecentSearches, type RecentEntry } from './recent';
import { formatRelativeJa } from '@/lib/ui/format';

export function RecentSearches({ max = 5 }: { max?: number }) {
  const [entries, setEntries] = useState<RecentEntry[] | null>(null);

  useEffect(() => {
    setEntries(readRecentSearches().slice(0, max));
    const onStorage = () => setEntries(readRecentSearches().slice(0, max));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [max]);

  if (entries === null) {
    return <p className="text-sm text-text-muted">読み込み中…</p>;
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="まだ検索履歴はありません"
        description="検索欄から質問すると、この端末に履歴が残ります。"
      />
    );
  }
  return (
    <div>
      <ul className="divide-y divide-border">
        {entries.map((entry) => (
          <li key={`${entry.at}-${entry.question}`}>
            <Link
              href={`/search?q=${encodeURIComponent(entry.question)}`}
              className="flex items-center gap-3 py-2.5 text-sm hover:text-primary"
            >
              <Clock className="h-4 w-4 text-text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{entry.question}</span>
              <span className="text-xs text-text-muted tabular">
                {formatRelativeJa(entry.at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-right">
        <button
          type="button"
          onClick={() => {
            clearRecentSearches();
            setEntries([]);
          }}
          className="text-xs text-text-muted hover:text-primary"
        >
          履歴をこの端末から消去
        </button>
      </div>
    </div>
  );
}
