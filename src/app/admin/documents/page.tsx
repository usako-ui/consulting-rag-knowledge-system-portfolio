import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { AdminShell } from '@/components/layout/AdminShell';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { AdminDocumentsTable } from './AdminDocumentsTable';
import { listAllDocumentsForAdmin } from '@/lib/documents/admin-list';

export const metadata: Metadata = { title: '文書管理' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminDocumentsPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');
  if (user.role !== 'admin') redirect('/');

  const docs = await listAllDocumentsForAdmin();

  return (
    <AdminShell
      user={user}
      title="文書管理"
      description="全部署の資料を管理・削除・一時無効化"
    >
      <div className="space-y-4">
        <Alert tone="info" title="削除と一時無効化の違い">
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>
              <strong>削除</strong>：資料を「無効」にして一般ユーザーの検索結果・資料一覧から表示されなくします。データは残るため、監査目的で履歴を確認できます（物理削除ではありません）。
            </li>
            <li>
              <strong>一時無効化 / 再有効化</strong>：資料を一時的にオフ／オンできます。一時的な非公開に使用してください。有効化するとまた検索結果に含まれるようになります。
            </li>
          </ul>
        </Alert>

        {docs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="登録された資料がありません"
            description="部署ユーザーがアップロードするか、管理者権限で追加してください。"
          />
        ) : (
          <Card padding="sm">
            <AdminDocumentsTable documents={docs} />
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
