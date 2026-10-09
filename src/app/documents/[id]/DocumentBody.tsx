'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { DocumentChunk } from '@/lib/documents/access';
import { cn } from '@/lib/ui/cn';

interface DocumentBodyProps {
  chunks: DocumentChunk[];
  highlightPage: number | null;
}

export function DocumentBody({ chunks, highlightPage }: DocumentBodyProps) {
  const ordered = useMemo(() => sortAndHighlight(chunks, highlightPage), [chunks, highlightPage]);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlightPage]);

  return (
    <div className="space-y-3">
      {ordered.map((entry) => (
        <div
          key={entry.chunk.id}
          ref={entry.highlighted ? highlightRef : undefined}
          className={cn(
            'rounded-inline border px-4 py-3 transition-colors duration-150',
            entry.highlighted
              ? 'border-primary-accent bg-primary-soft/40'
              : 'border-border bg-white',
          )}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted tabular">
            {entry.chunk.pageNumber !== null ? (
              <span>{`p.${entry.chunk.pageNumber}`}</span>
            ) : null}
            {entry.chunk.sectionTitle ? (
              <span className="truncate">
                {entry.chunk.pageNumber !== null ? '/ ' : ''}{entry.chunk.sectionTitle}
              </span>
            ) : null}
            {entry.highlighted ? (
              <span className="ml-auto rounded-full bg-primary-accent px-2 py-0.5 text-[10px] font-semibold text-white">
                Slack からの誘導箇所
              </span>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
            {entry.chunk.content}
          </p>
        </div>
      ))}
    </div>
  );
}

function sortAndHighlight(
  chunks: DocumentChunk[],
  highlightPage: number | null,
): Array<{ chunk: DocumentChunk; highlighted: boolean }> {
  const withFlag = chunks.map((c) => ({
    chunk: c,
    highlighted: highlightPage !== null && c.pageNumber === highlightPage,
  }));
  return withFlag.sort((a, b) => {
    if (a.highlighted && !b.highlighted) return -1;
    if (!a.highlighted && b.highlighted) return 1;
    const pa = a.chunk.pageNumber ?? Number.MAX_SAFE_INTEGER;
    const pb = b.chunk.pageNumber ?? Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}
