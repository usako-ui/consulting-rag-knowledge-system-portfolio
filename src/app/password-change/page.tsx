import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/optional';
import { PasswordChangeForm } from './PasswordChangeForm';

export const metadata: Metadata = { title: 'パスワード変更' };
export const dynamic = 'force-dynamic';

export default async function PasswordChangePage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');

  const isInitial = !user.passwordChanged;
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-app px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-accent">
            Consulting RAG
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">
            {isInitial ? '初回パスワード変更' : 'パスワード変更'}
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {isInitial
              ? '初期パスワードでログインしました。安全のため新しいパスワードを設定してください。'
              : '新しいパスワードを設定してください。'}
          </p>
        </div>
        <PasswordChangeForm isInitial={isInitial} email={user.email} />
      </div>
    </div>
  );
}
