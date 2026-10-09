import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FileText, History, Upload } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { UserShell } from '@/components/layout/UserShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { SearchBar } from './(search)/SearchBar';
import { RecentSearches } from './(search)/RecentSearches';
import { departmentLabel } from '@/lib/ui/department';

export const metadata: Metadata = { title: 'ホーム' };
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');

  return (
    <UserShell user={user} title="何を知りたいですか？" description="社内資料からAIが根拠付きで回答します">
      <div className="space-y-6">
        <Card padding="lg" className="bg-gradient-to-br from-white to-primary-soft">
          <div className="mb-5">
            <p className="text-xs font-medium uppercase tracking-widest text-primary-accent">
              AI ナレッジ検索
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {user.role === 'admin'
                ? '管理者権限で全部署の資料を横断的に検索できます。'
                : `${departmentLabel(user.department)}に登録された資料から検索します。他部署の資料は表示されません。`}
            </p>
          </div>
          <SearchBar size="lg" placeholder="例：新規顧客の与信審査プロセスは？" />
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <QuickAction
            href="/documents"
            icon={FileText}
            title={user.role === 'admin' ? '全部署の資料' : '自部署の資料'}
            description={
              user.role === 'admin'
                ? '全部署の登録資料と取り込み状態を管理'
                : '登録済み資料の一覧と状態を確認'
            }
          />
          <QuickAction
            href="/documents/upload"
            icon={Upload}
            title="資料をアップロード"
            description={
              user.role === 'admin'
                ? '任意の部署の資料としてナレッジに追加'
                : '新しい資料をナレッジに追加する'
            }
          />
          <QuickAction
            href="/history"
            icon={History}
            title="検索履歴"
            description="この端末で最近検索した質問を確認"
          />
        </div>

        <Card>
          <CardHeader
            title="最近の検索"
            description="この端末で最近入力した質問（保存はブラウザ内のみ）"
          />
          <RecentSearches />
        </Card>
      </div>
    </UserShell>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-card border border-border bg-surface-card p-4 shadow-card transition-shadow duration-150 hover:shadow-card-hover"
    >
      <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-inline bg-primary-soft text-primary-accent">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary group-hover:text-primary">{title}</p>
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
      </div>
    </Link>
  );
}
