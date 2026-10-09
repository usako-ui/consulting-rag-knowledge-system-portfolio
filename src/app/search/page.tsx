import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/optional';
import { UserShell } from '@/components/layout/UserShell';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '../(search)/SearchBar';
import { SearchResult } from './SearchResult';

export const metadata: Metadata = { title: '検索' };
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { q?: string };
}

export default async function SearchPage({ searchParams }: Props) {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');

  const question = (searchParams.q ?? '').trim();

  return (
    <UserShell
      user={user}
      title="検索"
      description="AI が根拠を確認したうえで回答します"
    >
      <div className="space-y-6">
        <Card padding="md">
          <SearchBar defaultQuestion={question} placeholder="別の質問を入力できます" />
        </Card>
        {question.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted">
              {user.role === 'admin'
                ? '上の検索欄に質問を入力してください。管理者権限で全部署の資料を横断的に検索し、根拠として使った出典のみを表示します。'
                : '上の検索欄に質問を入力してください。回答は登録された自部署の資料のみを根拠にします。'}
            </p>
          </Card>
        ) : (
          <SearchResult question={question} />
        )}
      </div>
    </UserShell>
  );
}
