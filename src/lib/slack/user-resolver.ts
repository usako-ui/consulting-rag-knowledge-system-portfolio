/**
 * Slack ユーザー ID を user_profiles と紐付ける
 *
 * 方式：Slack users.info で email を取得 →  user_profiles.email と一致するレコードを検索
 *   ・追加の DB カラム（slack_user_id 等）を持たずに済むため MVP に最適
 *   ・email 一致がなければ「未登録」として案内メッセージを返す
 *
 * ★ requirements.md §4「サーバー側でも認可チェック」
 *   一般ユーザーは自部署のみ、管理者は全部署。account_status='active' 以外は拒否。
 */

import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { AccountStatus, Department, UserRole } from '@/lib/auth/session';
import { fetchSlackUserSummary } from './client';

export interface SlackAuthenticatedUser {
  id: string;
  email: string;
  department: Department;
  role: UserRole;
  accountStatus: AccountStatus;
}

export type ResolveReason =
  | 'no_email'
  | 'not_registered'
  | 'suspended'
  | 'deleted_slack_user'
  | 'is_bot';

export type ResolveResult =
  | { ok: true; user: SlackAuthenticatedUser }
  | { ok: false; reason: ResolveReason };

/**
 * Slack ユーザー ID から user_profiles を解決
 *
 * QA SHOULD-2（T-D4Q-2）：Slack 側で削除済みユーザー（deleted=true）や Bot（is_bot=true）
 * が user_profiles.active のまま検索を通過するのを防ぐため、users.info の
 * フラグをまず先に検査する。
 */
export async function resolveSlackUser(slackUserId: string): Promise<ResolveResult> {
  const summary = await fetchSlackUserSummary(slackUserId);

  if (summary.isBot) return { ok: false, reason: 'is_bot' };
  if (summary.deleted) return { ok: false, reason: 'deleted_slack_user' };
  if (!summary.email) return { ok: false, reason: 'no_email' };

  const service = getServiceRoleClient();
  const { data, error } = await service
    .from('user_profiles')
    .select('id, email, department, role, account_status')
    .eq('email', summary.email)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: 'not_registered' };

  if (data.account_status !== 'active') {
    return { ok: false, reason: 'suspended' };
  }

  return {
    ok: true,
    user: {
      id: data.id,
      email: data.email,
      department: data.department as Department,
      role: data.role as UserRole,
      accountStatus: data.account_status as AccountStatus,
    },
  };
}
