import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { UserShell } from '@/components/layout/UserShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { departmentLabel } from '@/lib/ui/department';

export const metadata: Metadata = { title: '設定' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');

  return (
    <UserShell user={user} title="設定" description="アカウント情報の確認とパスワード変更">
      <div className="space-y-4">
        <Card padding="lg">
          <CardHeader
            title="アカウント情報"
            description="部署とロールは管理者側で管理しています"
          />
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">メールアドレス</dt>
              <dd className="mt-0.5 font-medium text-text-primary">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">所属部署</dt>
              <dd className="mt-0.5 font-medium text-text-primary">{departmentLabel(user.department)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">権限</dt>
              <dd className="mt-0.5 font-medium text-text-primary">
                {user.role === 'admin' ? '管理者' : '一般ユーザー'}
              </dd>
            </div>
          </dl>
        </Card>
        <Card padding="lg">
          <CardHeader
            title="パスワード"
            description="定期的な変更をおすすめします"
          />
          <Link href="/password-change" className="inline-block">
            <Button variant="secondary">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              パスワードを変更する
            </Button>
          </Link>
        </Card>
      </div>
    </UserShell>
  );
}
