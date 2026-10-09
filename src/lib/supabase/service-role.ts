/**
 * Node ランタイム / Next.js サーバー両対応の service_role クライアントファクトリ
 *
 * 参照：agent-brief.md §3.1（RLS + サーバー側チェックの二重防御）
 *
 * `src/lib/supabase/server.ts` の createSupabaseServiceRoleClient は `import 'server-only'`
 * の制約で CLI スクリプト（scripts/ingest.ts 等）から使えないため、
 * `server-only` を持たない共通ファクトリをここに切り出す。
 *
 * ★ RLS をバイパスするため、呼び出し側で必ず認可チェック済みであることを確認すること（CLAUDE.md §6）
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

let cached: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(serverEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}

/** テスト・再初期化用 */
export function resetServiceRoleClientForTest(): void {
  cached = null;
}
