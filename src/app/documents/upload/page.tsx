import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { UserShell } from '@/components/layout/UserShell';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader } from '@/components/ui/Card';
import { UploadForm } from './UploadForm';
import { departmentLabel } from '@/lib/ui/department';
import { serverEnv } from '@/lib/env';

export const metadata: Metadata = { title: '資料をアップロード' };
export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');

  const maxMb = serverEnv.maxFileSizeMb();

  return (
    <UserShell
      user={user}
      title="資料をアップロード"
      description="登録した資料は自部署のメンバーが検索できるようになります"
      actions={
        <Link
          href="/documents"
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary-accent hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          資料一覧へ戻る
        </Link>
      }
    >
      <div className="space-y-4">
        <Alert tone="info" title="アップロード前に確認してください">
          <ul className="ml-4 list-disc space-y-1">
            <li>取り込み対象は PDF・Word（.docx）ファイルです（1 ファイル {maxMb} MB まで）。</li>
            {user.role === 'admin' ? (
              <li>
                管理者は<strong>登録先の部署を選択</strong>できます。選択した部署の資料として登録され、他部署の人には表示されません。
              </li>
            ) : (
              <li>
                登録した資料は <strong>{departmentLabel(user.department)}</strong> の資料として登録され、他部署の人には表示されません。
              </li>
            )}
            <li>取り込みには数秒〜数十秒かかります。ページを閉じずにお待ちください。</li>
          </ul>
        </Alert>
        <Card padding="lg">
          <CardHeader
            title="ファイルとメタ情報"
            description="ファイルを選び、資料名・作成年・顧客名を入力してください"
          />
          <UploadForm defaultDepartment={user.department} isAdmin={user.role === 'admin'} maxFileMb={maxMb} />
        </Card>
      </div>
    </UserShell>
  );
}
