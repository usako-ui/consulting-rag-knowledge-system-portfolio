import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/optional';
import { UserShell } from '@/components/layout/UserShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { RecentSearches } from '../(search)/RecentSearches';

export const metadata: Metadata = { title: '検索履歴' };
export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');

  return (
    <UserShell user={user} title="検索履歴" description="この端末で最近入力した質問">
      <div className="space-y-4">
        <Alert tone="info" title="この履歴の保存場所について">
          検索履歴はこの端末のブラウザ内にのみ保存されます。サーバーには保存されません。ブラウザを切り替えると履歴は表示されません。
        </Alert>
        <Card>
          <CardHeader
            title="最近の質問"
            description="クリックすると再度検索できます"
          />
          <RecentSearches max={20} />
        </Card>
      </div>
    </UserShell>
  );
}
