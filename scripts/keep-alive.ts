/**
 * CLI エントリポイント：Supabase 生存確認
 *
 * 使い方：
 *   npm run keep-alive
 *
 * 参照：architecture.md §9・§12
 *
 * Supabase 無料枠は 1 週間非アクティブで Pause するため、月次 GHA cron で軽量な
 * SELECT を投げてアクティブ状態を維持する。
 */

import 'dotenv/config';
import { pingSupabase } from '@/lib/ingest/keep-alive';

async function main(): Promise<void> {
  const { ok, latencyMs } = await pingSupabase();
  if (ok) {
    console.log(`[keep-alive] ok (latency=${latencyMs}ms)`);
    process.exit(0);
  } else {
    console.error(`[keep-alive] failed (latency=${latencyMs}ms)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[keep-alive] fatal:', err);
  process.exit(1);
});
