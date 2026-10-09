import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileText, Upload } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { UserShell } from '@/components/layout/UserShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listDocumentsForUser } from '@/lib/documents/list';
import { departmentLabel } from '@/lib/ui/department';
import { DocumentsTable } from './DocumentsTable';

export const metadata: Metadata = { title: '自部署の資料' };
export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');

  const docs = await listDocumentsForUser(user);
  const processingCount = docs.filter((d) => d.status === 'processing' || d.status === 'retrying').length;
  const failedCount = docs.filter((d) => d.status === 'failed').length;

  return (
    <UserShell
      user={user}
      title={user.role === 'admin' ? '全部署の資料' : `${departmentLabel(user.department)}の資料`}
      description="登録済み資料の一覧と取り込み状態"
      actions={
        <Link href="/documents/upload" className="ml-auto">
          <Button size="md">
            <Upload className="h-4 w-4" aria-hidden="true" />
            資料をアップロード
          </Button>
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard
            title="登録済み"
            value={docs.length}
            unit="件"
            badge={<StatusBadge kind="info" label="現行版のみ" size="sm" />}
          />
          <SummaryCard
            title="処理中 / 再試行中"
            value={processingCount}
            unit="件"
            badge={
              processingCount > 0 ? (
                <StatusBadge kind="processing" size="sm" />
              ) : (
                <StatusBadge kind="success" label="なし" size="sm" />
              )
            }
          />
          <SummaryCard
            title="失敗"
            value={failedCount}
            unit="件"
            badge={
              failedCount > 0 ? (
                <StatusBadge kind="danger" size="sm" />
              ) : (
                <StatusBadge kind="success" label="なし" size="sm" />
              )
            }
          />
        </div>

        {docs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="登録された資料がありません"
            description="「資料をアップロード」から追加できます。"
            action={
              <Link href="/documents/upload">
                <Button>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  資料をアップロード
                </Button>
              </Link>
            }
          />
        ) : (
          <Card padding="sm">
            <DocumentsTable documents={docs} isAdmin={user.role === 'admin'} />
          </Card>
        )}
      </div>
    </UserShell>
  );
}

function SummaryCard({
  title,
  value,
  unit,
  badge,
}: {
  title: string;
  value: number;
  unit: string;
  badge: React.ReactNode;
}) {
  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">{title}</p>
        {badge}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular text-text-primary">
        {value}
        <span className="ml-1 text-xs font-normal text-text-muted">{unit}</span>
      </p>
    </Card>
  );
}
