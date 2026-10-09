/**
 * サーバーサイドで「ログインしていない場合は null を返す」認可ヘルパー。
 * ログイン画面などで既ログインを判定するために使う（requireUser とは違い例外を投げない）。
 */

import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AuthenticatedUser, Department, UserRole, AccountStatus } from './session';

export async function getOptionalUser(): Promise<AuthenticatedUser | null> {
  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email, department, role, account_status, password_changed')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) return null;
  if (profile.account_status !== 'active') return null;

  return {
    id: profile.id,
    email: profile.email,
    department: profile.department as Department,
    role: profile.role as UserRole,
    accountStatus: profile.account_status as AccountStatus,
    passwordChanged: profile.password_changed,
  };
}
