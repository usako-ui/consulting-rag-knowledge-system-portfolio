/**
 * ログ保存期間の管理（Phase 6）
 * 参照：requirements.md §16（30/90/1年の候補）
 *       tasks.md Day6 Phase 6・PM 修正指示 D
 *
 * ★ 要件§16 の 3 択（30 日 / 90 日 / 365 日）を UI 変更可
 * ★ 変更前後は recordAdminActionStrict で記録・失敗時は compensating transaction
 * ★ 保存期間変更ダイアログで「削除対象になる件数」を事前計算する関数も提供
 */

import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAdminActionStrict } from '@/lib/audit/record';
import type { AuthenticatedUser } from '@/lib/auth/session';
import { readSetting } from './settings';

export const LOG_RETENTION_DAYS_CHOICES = [30, 90, 365] as const;
export type LogRetentionDays = (typeof LOG_RETENTION_DAYS_CHOICES)[number];
export const DEFAULT_LOG_RETENTION_DAYS: LogRetentionDays = 30;

export class InvalidRetentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRetentionError';
  }
}

function validateRetentionDays(raw: unknown): LogRetentionDays {
  if (
    typeof raw !== 'number' ||
    !LOG_RETENTION_DAYS_CHOICES.includes(raw as LogRetentionDays)
  ) {
    throw new InvalidRetentionError('保存期間は 30 日・90 日・1 年（365 日）から選択してください');
  }
  return raw as LogRetentionDays;
}

export async function readCurrentRetentionDays(): Promise<LogRetentionDays> {
  const row = await readSetting('log_retention_days');
  if (!row) return DEFAULT_LOG_RETENTION_DAYS;
  const parsed = Number(row.value);
  if (!Number.isFinite(parsed)) return DEFAULT_LOG_RETENTION_DAYS;
  if (!LOG_RETENTION_DAYS_CHOICES.includes(parsed as LogRetentionDays)) {
    return DEFAULT_LOG_RETENTION_DAYS;
  }
  return parsed as LogRetentionDays;
}

/**
 * 指定の retention_days を適用した時に「削除対象になる audit_log の件数」を返す。
 * 保存期間変更ダイアログで事前表示するために使う（PM 修正指示 D）。
 */
export async function countLogsToDelete(retentionDays: number): Promise<number> {
  const service = getServiceRoleClient();
  const thresholdIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await service
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', thresholdIso);
  return count ?? 0;
}

export interface UpdateRetentionInput {
  actor: Pick<AuthenticatedUser, 'id' | 'email'>;
  newValueDays: LogRetentionDays;
}

/**
 * log_retention_days を変更する。
 *   1. 旧値を読む
 *   2. 新値を upsert
 *   3. 監査ログを記録（before/after）
 *   4. 監査失敗時は compensating で旧値へ戻す
 */
export async function updateLogRetentionDays(input: UpdateRetentionInput): Promise<void> {
  const validated = validateRetentionDays(input.newValueDays);

  const service = getServiceRoleClient();
  const before = await readSetting('log_retention_days');
  const beforeValue = before?.value ?? null;

  const { error: upsertErr } = await service.from('system_settings').upsert({
    key: 'log_retention_days',
    value: String(validated),
    updated_by: input.actor.id,
  });
  if (upsertErr) {
    throw new Error(`保存期間の更新に失敗しました: ${upsertErr.message}`);
  }

  try {
    await recordAdminActionStrict({
      actor: input.actor,
      action: 'setting_change',
      targetType: 'setting',
      targetId: null,
      details: {
        key: 'log_retention_days',
        before: beforeValue,
        after: String(validated),
        unit: 'days',
      },
    });
  } catch (auditErr) {
    if (beforeValue !== null) {
      const { error: revertErr } = await service.from('system_settings').upsert({
        key: 'log_retention_days',
        value: beforeValue,
        updated_by: input.actor.id,
      });
      if (revertErr) {
        throw new Error(
          `保存期間の変更後、監査ログ記録に失敗し、旧値への戻しも失敗しました。手動で確認してください: audit=${(auditErr as Error).message} / revert=${revertErr.message}`,
        );
      }
      throw new Error(
        `保存期間の変更後、監査ログ記録に失敗したため旧値へ戻しました: ${(auditErr as Error).message}`,
      );
    }
    throw new Error(
      `保存期間の変更後、監査ログ記録に失敗しました: ${(auditErr as Error).message}`,
    );
  }
}
