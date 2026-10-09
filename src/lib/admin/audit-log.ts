/**
 * 監査ログ一覧取得（Phase 5.1）
 * 参照：requirements.md §16（ログは追記のみ・機密情報禁止）
 *       tasks.md Day6 Phase 5.1
 *
 * ★ SELECT 専用：Phase 1 で audit_log_immutable 適用済・管理者含めて UPDATE/DELETE 不可
 *   削除は Phase 6 の GHA cleanup ジョブのみ（service_role 経由）
 *
 * ★ サーバー側で zod 検証（PM Phase 5 修正指示 E）
 *   - 日付：YYYY-MM-DD 形式 + from <= to
 *   - 実行者：email 風フリーテキスト（最大 254 文字・LIKE エスケープ）
 *   - 操作種別：audit_action enum 8 種のみ
 *   - 対象種別：target_type の列挙（固定値以外は受け付けない）
 *   - ページ：1 以上 10,000 以下の正整数
 */

import 'server-only';
import { z } from 'zod';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { Department } from '@/lib/auth/session';
import {
  AUDIT_ACTION_TYPES,
  AUDIT_TARGET_TYPES,
  type AuditActionType,
  type AuditLogRecord,
} from './audit-log-shared';

export interface AuditLogListResult {
  rows: AuditLogRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// -----------------------------------------------------------------------------
// 入力検証スキーマ（Server Component / Route Handler 共通で使う）
// -----------------------------------------------------------------------------

export const auditLogFilterSchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '開始日は YYYY-MM-DD 形式で指定してください')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '終了日は YYYY-MM-DD 形式で指定してください')
      .optional(),
    actor: z.string().max(254).optional(),
    actionType: z.enum(AUDIT_ACTION_TYPES).optional(),
    targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
    page: z.coerce.number().int().positive().max(10_000).default(1),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '開始日は終了日以前の日付を指定してください',
    path: ['from'],
  });

export type AuditLogFilter = z.infer<typeof auditLogFilterSchema>;

// -----------------------------------------------------------------------------
// LIKE ワイルドカードエスケープ
// -----------------------------------------------------------------------------

/**
 * Supabase の .ilike(pattern) に渡す値用に、SQL LIKE のメタ文字をエスケープする。
 *   - `%` → `\%`
 *   - `_` → `\_`
 *   - `\` → `\\`
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

// -----------------------------------------------------------------------------
// 一覧取得
// -----------------------------------------------------------------------------

export const AUDIT_LOG_PAGE_SIZE = 20;

export async function listAuditLogs(filter: AuditLogFilter): Promise<AuditLogListResult> {
  const service = getServiceRoleClient();

  // JST 基準の日付範囲を UTC の timestamptz に変換
  // from="2026-10-01" → 2026-10-01T00:00:00+09:00 = 2026-09-30T15:00:00Z
  // to="2026-10-05"   → 2026-10-06T00:00:00+09:00 = 2026-10-05T15:00:00Z（end exclusive）
  function jstDateToUtcIso(date: string, endOfDay = false): string {
    const [y, m, d] = date.split('-').map(Number);
    const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const base = Date.UTC(y, m - 1, d) - JST_OFFSET_MS;
    const target = endOfDay ? base + 24 * 60 * 60 * 1000 : base;
    return new Date(target).toISOString();
  }

  let query = service
    .from('audit_log')
    .select(
      'id, actor_id, actor_email, action_type, target_type, target_id, target_department, details, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (filter.from) {
    query = query.gte('created_at', jstDateToUtcIso(filter.from, false));
  }
  if (filter.to) {
    // end exclusive：to 日の 00:00 翌日 JST = to+1 日 00:00 JST
    query = query.lt('created_at', jstDateToUtcIso(filter.to, true));
  }
  if (filter.actionType) {
    query = query.eq('action_type', filter.actionType);
  }
  if (filter.targetType) {
    query = query.eq('target_type', filter.targetType);
  }
  if (filter.actor) {
    const escaped = escapeLikePattern(filter.actor.trim());
    if (escaped.length > 0) {
      query = query.ilike('actor_email', `%${escaped}%`);
    }
  }

  const page = Math.max(1, filter.page);
  const offset = (page - 1) * AUDIT_LOG_PAGE_SIZE;
  query = query.range(offset, offset + AUDIT_LOG_PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) {
    throw new Error(`監査ログの取得に失敗しました: ${error.message}`);
  }

  const rows: AuditLogRecord[] = (data ?? []).map((row) => ({
    id: row.id as string,
    actorId: (row.actor_id as string | null) ?? null,
    actorEmail: (row.actor_email as string | null) ?? null,
    actionType: row.action_type as AuditActionType,
    targetType: (row.target_type as string | null) ?? null,
    targetId: (row.target_id as string | null) ?? null,
    targetDepartment: (row.target_department as Department | null) ?? null,
    details: (row.details as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at as string,
  }));

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / AUDIT_LOG_PAGE_SIZE));

  return {
    rows,
    totalCount,
    page,
    pageSize: AUDIT_LOG_PAGE_SIZE,
    totalPages,
  };
}

// 表示用ユーティリティ（ラベル）は audit-log-shared.ts に移動済み（Client 用）
