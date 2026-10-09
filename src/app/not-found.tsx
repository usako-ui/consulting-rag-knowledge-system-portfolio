import Link from 'next/link';
import { Compass, Home, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-app px-4 py-10">
      <Card padding="lg" className="w-full max-w-md text-center">
        <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-text-primary">
          お探しのページは見つかりませんでした
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          URL が古いか、対象の資料・ページが削除されている可能性があります。
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/">
            <Button>
              <Home className="h-4 w-4" aria-hidden="true" />
              ホームへ戻る
            </Button>
          </Link>
          <Link href="/search">
            <Button variant="secondary">
              <Search className="h-4 w-4" aria-hidden="true" />
              検索から探す
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
