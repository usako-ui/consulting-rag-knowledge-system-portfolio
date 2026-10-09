import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { RagSource } from '@/lib/rag/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { departmentLabel } from '@/lib/ui/department';

interface SourceListProps {
  sources: RagSource[];
}

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) {
    return <p className="text-sm text-text-muted">出典はありません。</p>;
  }
  return (
    <ol className="space-y-3">
      {sources.map((s, i) => (
        <li
          key={`${s.documentId}-${s.pageNumber ?? 'na'}-${i}`}
          className="rounded-inline border border-border p-4 hover:border-primary-accent"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white tabular">
              {i + 1}
            </span>
            <StatusBadge kind="info" label={departmentLabel(s.department)} size="sm" />
            {typeof s.similarity === 'number' ? (
              <span className="text-[11px] text-text-muted tabular">
                類似度 {(s.similarity * 100).toFixed(0)}%
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-text-primary">{s.title}</p>
          {(s.pageNumber !== null || s.sectionTitle) ? (
            <p className="mt-0.5 text-xs text-text-muted">
              {s.pageNumber !== null
                ? `p.${s.pageNumber}${s.sectionTitle ? ` / ${s.sectionTitle}` : ''}`
                : s.sectionTitle}
            </p>
          ) : null}
          <div className="mt-3">
            <Link
              href={`/documents/${s.documentId}${s.pageNumber ? `?page=${s.pageNumber}` : ''}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-accent hover:underline"
            >
              資料の該当箇所を確認する
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
