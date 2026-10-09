import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Users as UsersIcon } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { AdminShell } from '@/components/layout/AdminShell';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { listUsers } from '@/lib/admin/users';
import { UsersTable } from './UsersTable';

export const metadata: Metadata = { title: 'ユーザー管理' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminUsersPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');
  if (user.role !== 'admin') redirect('/');

  const users = await listUsers();

  return (
    <AdminShell
      user={user}
      title="ユーザー管理"
      description="社員アカウントの新規登録・状態変更・パスワード再発行"
    >
      <div className="space-y-4">
        <Alert tone="info" title="このページでできること">
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>
              <strong>新規登録</strong>：メール・部署・権限を指定して登録します。登録直後に一時パスワードが 1 度だけ表示されます（画面を閉じると再表示できません）。
            </li>
            <li>
              <strong>状態変更</strong>：休職・退職・削除予定・復職を切り替えます。退職に切り替えると保持期間（30 日／90 日／1 年）を選択します。
            </li>
            <li>
              <strong>パスワード再発行</strong>：新しい一時パスワードを発行します。次回ログイン時にご本人にパスワードを変更していただきます。既存のログインセッションは無効化されます。
            </li>
            <li>
              <strong>削除予定にする</strong>：この操作ではデータは残ります（すぐには消えません）。保持期限を過ぎた後の完全削除は、今後の機能として検討中です。
            </li>
          </ul>
        </Alert>

        {users.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="登録されたユーザーがいません"
            description="右上の「新規登録」ボタンから追加してください。"
          />
        ) : (
          <Card padding="sm">
            <UsersTable users={users} currentUserId={user.id} />
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
