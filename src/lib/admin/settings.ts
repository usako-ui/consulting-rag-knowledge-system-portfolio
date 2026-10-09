/**
 * 管理者用 system_settings の読み書きヘルパー
 * 参照：requirements.md §12・§16・§17
 *        Phase 3 では読み取り + 予算変更関数の骨組みだけ提供・UI（Phase 5.3）から呼び出す
 *
 * ★ 予算変更は必ず recordAdminActionStrict を通す（変更前後の値を details に記録・
 *   監査失敗時は変更を成功扱いにしない）
 */

import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAdminActionStrict } from '@/lib/audit/record';
import type { AuthenticatedUser } from '@/lib/auth/session';

export interface SystemSettingRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export async function readSetting(key: string): Promise<SystemSettingRecord | null> {
  const service = getServiceRoleClient();
  const { data } = await service
    .from('system_settings')
    .select('key, value, updated_at')
    .eq('key', key)
    .maybeSingle();
  if (!data) return null;
  return { key: data.key, value: data.value, updatedAt: data.updated_at };
}

export interface UpdateBudgetInput {
  actor: Pick<AuthenticatedUser, 'id' | 'email'>;
  newValueTokens: number;
}

/**
 * バリデーション用の上限値。1 兆 tokens/月（現実的にありえない値の上限）。
 * 極端に大きな値を弾いて操作ミス・攻撃を防ぐ。
 */
const MAX_MONTHLY_TOKEN_BUDGET = 1_000_000_000_000;

export class InvalidBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBudgetError';
  }
}

function validateBudgetTokens(raw: unknown): number {
  if (typeof raw !== 'number') {
    throw new InvalidBudgetError('月間予算は数値で指定してください');
  }
  if (!Number.isFinite(raw)) {
    throw new InvalidBudgetError('月間予算に無効な値が指定されています');
  }
  if (!Number.isInteger(raw)) {
    throw new InvalidBudgetError('月間予算は整数（小数不可）で指定してください');
  }
  if (raw <= 0) {
    throw new InvalidBudgetError('月間予算は 1 以上の整数で指定してください');
  }
  if (raw > MAX_MONTHLY_TOKEN_BUDGET) {
    throw new InvalidBudgetError(
      `月間予算は ${MAX_MONTHLY_TOKEN_BUDGET.toLocaleString()} tokens 以下で指定してください`,
    );
  }
  return raw;
}

/**
 * 月間 API 予算を変更する（tokens）
 *
 * 更新と監査ログの順序（architecture.md §7.3 参照）：
 *   1. 旧値を取得（before）
 *   2. system_settings を更新
 *   3. recordAdminActionStrict で監査ログを記録
 *   4. 3 が失敗した場合、システムは compensating transaction で旧値へ戻す
 *      → 戻しにも失敗した場合は例外の中にその旨を含める（監査ログなしの更新を残さない）
 *
 * ★ 入力バリデーション：数値以外 / 小数 / 0 以下 / 極端に大きい値をすべて拒否
 */
export async function updateMonthlyApiBudget(input: UpdateBudgetInput): Promise<void> {
  const validated = validateBudgetTokens(input.newValueTokens);

  const service = getServiceRoleClient();
  const before = await readSetting('monthly_api_budget_tokens');
  const beforeValue = before?.value ?? null;

  // Step 2: system_settings を更新
  const { error: upsertErr } = await service
    .from('system_settings')
    .upsert({
      key: 'monthly_api_budget_tokens',
      value: String(validated),
      updated_by: input.actor.id,
    });
  if (upsertErr) {
    throw new Error(`月間予算の更新に失敗しました: ${upsertErr.message}`);
  }

  // Step 3: 監査ログ記録・失敗時は compensating transaction で旧値へ戻す
  try {
    await recordAdminActionStrict({
      actor: input.actor,
      action: 'setting_change',
      targetType: 'setting',
      targetId: null,
      details: {
        key: 'monthly_api_budget_tokens',
        before: beforeValue,
        after: String(validated),
        unit: 'tokens',
      },
    });
  } catch (auditErr) {
    // Step 4: compensating transaction
    if (beforeValue !== null) {
      const { error: revertErr } = await service
        .from('system_settings')
        .upsert({
          key: 'monthly_api_budget_tokens',
          value: beforeValue,
          updated_by: input.actor.id,
        });
      if (revertErr) {
        throw new Error(
          `月間予算の変更後、監査ログ記録に失敗し、旧値への戻しも失敗しました。手動で確認してください: audit=${(auditErr as Error).message} / revert=${revertErr.message}`,
        );
      }
      throw new Error(
        `月間予算の変更後、監査ログ記録に失敗したため旧値へ戻しました: ${(auditErr as Error).message}`,
      );
    }
    // before が無い＝新規登録 → 削除で戻す
    const { error: deleteErr } = await service
      .from('system_settings')
      .delete()
      .eq('key', 'monthly_api_budget_tokens');
    if (deleteErr) {
      throw new Error(
        `月間予算の新規登録後、監査ログ記録に失敗し、削除による戻しも失敗しました: audit=${(auditErr as Error).message} / delete=${deleteErr.message}`,
      );
    }
    throw new Error(
      `月間予算の新規登録後、監査ログ記録に失敗したため設定を削除して戻しました: ${(auditErr as Error).message}`,
    );
  }
}
