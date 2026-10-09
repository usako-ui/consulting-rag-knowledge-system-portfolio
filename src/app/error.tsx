'use client';

import { AlertCircle, Home, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 詳細（メッセージ・スタック）は UI に出さない。開発時のみコンソールへ
    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-app px-4 py-10">
      <Card padding="lg" className="w-full max-w-md text-center">
        <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#FBE7E5] text-status-danger">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-text-primary">
          画面の表示中に問題が発生しました
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          ネットワークまたはシステム側の一時的な不調の可能性があります。もう一度読み込むか、ホームへ戻ってやり直してください。
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => reset()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            もう一度読み込む
          </Button>
          <Link href="/">
            <Button variant="secondary">
              <Home className="h-4 w-4" aria-hidden="true" />
              ホームへ戻る
            </Button>
          </Link>
        </div>
        {error.digest ? (
          <div className="mt-4 space-y-0.5 text-[10px] text-text-muted">
            <p className="tabular">
              参照コード：<span className="font-medium">{error.digest}</span>
            </p>
            <p>この英数字は、管理者へお問い合わせの際にお伝えください（原因調査に使用します）。</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
