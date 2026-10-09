/**
 * Supabase Pause 回避のための生存確認クエリ
 *
 * 参照：architecture.md §9・§12（GHA cron に相乗り）
 *
 * 無料枠は1週間非アクティブで Pause するため、月次 GHA からこの関数を呼ぶ。
 * 軽量な SELECT だけを実行し、結果は捨てる。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

export async function pingSupabase(client?: SupabaseClient): Promise<{ ok: boolean; latencyMs: number }> {
  const supabase = client ?? getServiceRoleClient();
  const start = Date.now();
  const { error } = await supabase.from('documents').select('id').limit(1);
  const latencyMs = Date.now() - start;
  return { ok: !error, latencyMs };
}
