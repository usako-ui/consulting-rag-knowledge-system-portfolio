'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

export function IngestionPagination({ page, totalPages, totalCount, pageSize }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete('page');
    else params.set('page', String(nextPage));
    const qs = params.toString();
    router.push(`/admin/ingestion${qs ? `?${qs}` : ''}`);
  }

  const first = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(totalCount, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-2">
      <p className="text-xs text-text-muted tabular">
        {totalCount.toLocaleString()} 件中 {first.toLocaleString()}〜
        {last.toLocaleString()} 件を表示
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          前へ
        </Button>
        <span className="text-xs text-text-muted tabular">
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
        >
          次へ
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
