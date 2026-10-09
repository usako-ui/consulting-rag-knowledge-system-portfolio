'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FieldLabel, Input } from '@/components/ui/Input';
import {
  INGESTION_STATUSES,
  INGESTION_STATUS_LABEL,
  type IngestionStatus,
} from '@/lib/admin/ingestion-shared';

interface Props {
  initial: {
    status?: IngestionStatus;
    from?: string;
    to?: string;
  };
}

export function IngestionFilterForm({ initial }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<IngestionStatus | ''>(initial.status ?? '');
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    router.push(`/admin/ingestion?${params.toString()}`);
  }

  function reset() {
    setStatus('');
    setFrom('');
    setTo('');
    router.push('/admin/ingestion');
  }

  const hasFilter = Boolean(status || from || to);

  return (
    <form onSubmit={apply} className="space-y-3">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text-primary">フィルタ</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <FieldLabel htmlFor="ing-status">状態</FieldLabel>
          <select
            id="ing-status"
            value={status}
            onChange={(e) => setStatus((e.target.value || '') as IngestionStatus | '')}
            className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent"
          >
            <option value="">すべて</option>
            {INGESTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INGESTION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="ing-from">開始日</FieldLabel>
          <Input
            id="ing-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="ing-to">終了日</FieldLabel>
          <Input
            id="ing-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            min={from || undefined}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary">
          絞り込む
        </Button>
        {hasFilter ? (
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            条件をクリア
          </Button>
        ) : null}
      </div>
    </form>
  );
}
