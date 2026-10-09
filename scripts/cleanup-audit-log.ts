/**
 * 期限切れ audit_log 削除ジョブ（Phase 6）
 *
 * 使い方：
 *   npm run cleanup-audit-log            # DRY_RUN=true（デフォルト）：件数のみログ出力
 *   DRY_RUN=false npm run cleanup-audit-log   # 実削除
 *
 * 参照：tasks.md Day6 Phase 6・PM 修正指示 D
 *       requirements.md §9（新しい cron を増やさず相乗り）・§16（保存期間設定）
 *
 * 動作：
 *   1. system_settings.log_retention_days を読む（未設定時は 30）
 *   2. (now - retention_days) 以前の audit_log を COUNT（削除対象件数）
 *   3. DRY_RUN=true なら件数のみ stderr に出して終了（実削除なし）
 *   4. DRY_RUN=false なら実削除し、system_settings.audit_cleanup_last_run に結果を保存
 *
 * 監査ログは Phase 1 の audit_log_immutable で UPDATE/DELETE が service_role 専用になっているため、
 * 本スクリプトは service_role キーで実行する必要がある（GHA Secrets 経由）。
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('[AUDIT_CLEANUP] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const VALID_DAYS = [30, 90, 365];
const DEFAULT_DAYS = 30;

async function readRetentionDays(): Promise<number> {
  const { data } = await service
    .from('system_settings')
    .select('value')
    .eq('key', 'log_retention_days')
    .maybeSingle();
  const parsed = data?.value ? Number(data.value) : NaN;
  if (!Number.isFinite(parsed) || !VALID_DAYS.includes(parsed)) {
    console.warn(
      `[AUDIT_CLEANUP] log_retention_days が未設定 or 無効値（${data?.value}）。デフォルト ${DEFAULT_DAYS} 日を使用`,
    );
    return DEFAULT_DAYS;
  }
  return parsed;
}

async function main() {
  const retentionDays = await readRetentionDays();
  const thresholdIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { count: toDelete, error: countErr } = await service
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', thresholdIso);
  if (countErr) {
    console.error(`[AUDIT_CLEANUP] count failed: ${countErr.message}`);
    process.exit(1);
  }

  // stderr へのログ出力（PM 修正指示 D：実行ごとに削除件数を記録）
  console.error(
    `[AUDIT_CLEANUP] mode=${DRY_RUN ? 'dry-run' : 'live'} retention=${retentionDays} target_rows=${toDelete ?? 0} since=${thresholdIso}`,
  );

  if (DRY_RUN) {
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        retention_days: retentionDays,
        target_rows: toDelete ?? 0,
        since: thresholdIso,
        deleted: 0,
      }),
    );
    // system_settings に dry-run 実行結果を記録（live でなくても最終実行時刻を残す）
    await service.from('system_settings').upsert({
      key: 'audit_cleanup_last_run',
      value: JSON.stringify({
        at: new Date().toISOString(),
        mode: 'dry-run',
        retention_days: retentionDays,
        target_rows: toDelete ?? 0,
        deleted: 0,
      }),
    });
    return;
  }

  // live 実削除
  const { error: deleteErr } = await service
    .from('audit_log')
    .delete()
    .lt('created_at', thresholdIso);
  if (deleteErr) {
    console.error(`[AUDIT_CLEANUP] delete failed: ${deleteErr.message}`);
    process.exit(1);
  }

  console.error(`[AUDIT_CLEANUP] mode=live deleted=${toDelete ?? 0}`);
  console.log(
    JSON.stringify({
      mode: 'live',
      retention_days: retentionDays,
      target_rows: toDelete ?? 0,
      since: thresholdIso,
      deleted: toDelete ?? 0,
    }),
  );

  // 最終実行結果を保存
  await service.from('system_settings').upsert({
    key: 'audit_cleanup_last_run',
    value: JSON.stringify({
      at: new Date().toISOString(),
      mode: 'live',
      retention_days: retentionDays,
      target_rows: toDelete ?? 0,
      deleted: toDelete ?? 0,
    }),
  });
}

main().catch((err) => {
  console.error('[AUDIT_CLEANUP] fatal:', err);
  process.exit(1);
});
