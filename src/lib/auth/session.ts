/**
 * サーバー側セッション・認可ヘルパー
 * 参照：CLAUDE.md §6（RLSだけに頼らず、サーバー側でも認可チェック）
 *       requirements.md §4（権限制御・セキュリティ最重要）
 *
 * すべての Route Handler / Server Action は業務ロジックの前に
 * requireUser() または requireAdmin() を通すこと（二重防御）。
 */

import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type Department =
  | 'strategy'
  | 'business'
  | 'it'
  | 'hr'
  | 'sales'
  | 'management';

export type UserRole = 'general' | 'admin';

export type AccountStatus =
  | 'active'
  | 'suspended_leave'
  | 'suspended_retired'
  | 'pending_deletion';

export interface AuthenticatedUser {
  id: string;
  email: string;
  department: Department;
  role: UserRole;
  accountStatus: AccountStatus;
  passwordChanged: boolean;
}

export class UnauthorizedError extends Error {
  constructor(public reason: 'no_session' | 'suspended' | 'forbidden' = 'no_session') {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

/**
 * ログイン済みユーザーを取得。未ログイン・アカウント無効なら例外。
 * Route Handler の冒頭で必ず呼ぶ（サーバー側認可の起点）。
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const supabase = createSupabaseServerClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    throw new UnauthorizedError('no_session');
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email, department, role, account_status, password_changed')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    throw new UnauthorizedError('no_session');
  }

  if (profile.account_status !== 'active') {
    throw new UnauthorizedError('suspended');
  }

  return {
    id: profile.id,
    email: profile.email,
    department: profile.department as Department,
    role: profile.role as UserRole,
    accountStatus: profile.account_status as AccountStatus,
    passwordChanged: profile.password_changed,
  };
}

/**
 * 管理者権限を要求。管理者以外なら forbidden で例外。
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    throw new UnauthorizedError('forbidden');
  }
  return user;
}

/**
 * 一般ユーザーが対象部署にアクセスしてよいかを検証。
 * 管理者は常に true、一般ユーザーは自部署のみ true。
 *
 * ★ RLSでも守られているが、ここでも必ず判定する（二重防御・要件 §4）
 */
export function canAccessDepartment(user: AuthenticatedUser, target: Department): boolean {
  if (user.role === 'admin') return true;
  return user.department === target;
}

export function assertCanAccessDepartment(
  user: AuthenticatedUser,
  target: Department,
): void {
  if (!canAccessDepartment(user, target)) {
    throw new UnauthorizedError('forbidden');
  }
}
