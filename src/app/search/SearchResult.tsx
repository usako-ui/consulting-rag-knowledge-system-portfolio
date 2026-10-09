'use client';

import { useEffect, useState } from 'react';
import { FileWarning, Sparkles } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { RagAnswer } from '@/lib/rag/types';
import { SourceList } from './SourceList';

interface SearchResultProps {
  question: string;
}

interface ApiResponse {
  ok: boolean;
  error?: string;
  grounding?: RagAnswer['grounding'];
  answer?: string;
  sources?: RagAnswer['sources'];
  meta?: { chunksSearched: number; provider: string };
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'answer'; data: ApiResponse };

export function SearchResult({ question }: SearchResultProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ question }),
        });
        const data = (await res.json().catch(() => null)) as ApiResponse | null;
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setState({
            kind: 'error',
            message: data?.error ?? '検索に失敗しました。しばらく待って再度お試しください',
          });
          return;
        }
        setState({ kind: 'answer', data });
      } catch {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: '通信に失敗しました。ネットワーク接続を確認してください',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [question]);

  if (state.kind === 'loading') {
    return <LoadingSkeleton />;
  }

  if (state.kind === 'error') {
    return (
      <Alert tone="danger" title="検索できませんでした">
        {state.message}
      </Alert>
    );
  }

  const { grounding, answer, sources = [] } = state.data;
  const isSufficient = grounding === 'sufficient';

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <CardHeader
          title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary-accent" aria-hidden="true" />AI 回答</span>}
          description={`質問：${question}`}
          action={
            <StatusBadge
              kind={isSufficient ? 'success' : 'info'}
              label={isSufficient ? '根拠あり' : '該当情報なし'}
              size="sm"
            />
          }
        />
        {isSufficient ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{answer}</p>
        ) : (
          <EmptyState
            variant="neutral"
            icon={FileWarning}
            title="登録された資料からは十分な情報が見つかりませんでした"
            description="別の言葉で質問を言い換える、または資料を追加してから再度お試しください。推測での回答は行いません。"
          />
        )}
      </Card>

      {isSufficient ? (
        <Card padding="lg">
          <CardHeader
            title="出典"
            description="AI が実際に根拠として使用した資料のみを表示しています（最大 5 件）"
          />
          <SourceList sources={sources} />
        </Card>
      ) : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Card padding="lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </Card>
      <Card padding="lg">
        <Skeleton className="mb-4 h-5 w-24" />
        <Skeleton className="mb-2 h-4 w-2/3" />
        <Skeleton className="mb-2 h-4 w-1/2" />
      </Card>
    </div>
  );
}
