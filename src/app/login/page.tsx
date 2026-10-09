import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/optional';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'ログイン' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getOptionalUser();
  if (user) {
    redirect(user.passwordChanged ? '/' : '/password-change');
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-app px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-accent">
            Consulting RAG
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">
            社内ナレッジ検索へログイン
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            会社から配布されたメールアドレスとパスワードでログインしてください。
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
