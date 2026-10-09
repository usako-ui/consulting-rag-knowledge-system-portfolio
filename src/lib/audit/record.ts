/**
 * 管理系操作の監査ログ共通ヘルパー
 * 参照：requirements.md §16（機密情報をログに保存しない）
 *
 * 呼び出しルール：
 *   - すべての /admin/* Route Handler で管理操作を実行した後に必ず記録する
 *   - 平文パスワード・APIキー・PDF本文などの機密情報を details に絶対に入れない
 *   - 対象ユーザーの user_id・email・部署 は details に含めてよい（監査目的の必須情報）
 *
 * 2 種類の記録関数：
 *   - recordAdminAction()       … 監査失敗を許容する（login/logout/search など軽量操作向け）
 *   - recordAdminActionStrict() … 監査失敗時に例外を投げる（ユーザーCRUD/PW リセット/文書削除/設定変更向け）
 *     Route Handler 側で try/catch し、失敗時は業務操作を成功扱いにしない（500 を返す）
 */

import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { AuthenticatedUser, Department } from '@/lib/auth/session';
import { sanitizeDeep } from './sanitize';

export { sanitizeDeep };

export type AdminActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'setting_change'
  | 'password_change';

export type AdminTargetType = 'user' | 'document' | 'setting' | 'ingestion_job';

export interface RecordAdminActionInput {
  actor: Pick<AuthenticatedUser, 'id' | 'email'>;
  action: AdminActionType;
  targetType: AdminTargetType;
  targetId?: string | null;
  targetDepartment?: Department | null;
  /**
   * 監査目的で残すメタ情報。以下は禁止：
   *   - 平文パスワード（reset時は `{ initiated_by: 'admin' }` のみ）
   *   - APIキー・トークン
   *   - PDF/Word の本文
   *   - Slack signing secret 等
   */
  details?: Record<string, unknown>;
}

/**
 * 管理操作を audit_log に記録する。失敗しても呼び出し元の処理は継続させる
 * （login/logout/search 等の軽量操作向け）。
 */
export async function recordAdminAction(input: RecordAdminActionInput): Promise<void> {
  try {
    await insertAuditRow(input);
  } catch (err) {
    // 業務処理を止めない・ただし可視性のため stderr にログ出す（平文機密は入っていない）
    console.error(
      '[AUDIT] recordAdminAction failed:',
      (err as Error).message,
      'action=' + input.action,
      'target=' + input.targetType,
    );
  }
}

/**
 * 監査失敗を許容しない厳密版。失敗時は例外を投げるので、
 * Route Handler 側で catch して業務操作を失敗扱いにすること。
 *
 * 適用対象：ユーザー CRUD・パスワードリセット・文書削除・設定変更・再取り込み
 * （要件§16「管理者の設定変更もログに残す」→ 記録できないなら操作させない）
 */
export async function recordAdminActionStrict(input: RecordAdminActionInput): Promise<void> {
  await insertAuditRow(input);
}

async function insertAuditRow(input: RecordAdminActionInput): Promise<void> {
  const service = getServiceRoleClient();
  const { error } = await service.from('audit_log').insert({
    actor_id: input.actor.id,
    actor_email: input.actor.email,
    action_type: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    target_department: input.targetDepartment ?? null,
    details: sanitizeDeep(input.details ?? {}),
  });
  if (error) {
    throw new Error(`audit_log insert failed: ${error.message}`);
  }
}

// sanitizeDeep は ./sanitize.ts に分離（サーバー側・テスト両方から使えるように）
