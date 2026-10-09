/**
 * サーバー側 Supabase クライアント
 * 参照：agent-brief.md §3.1（RLS + サーバー側チェックの二重防御）
 *
 * 2種類のクライアントを提供：
 *  - createSupabaseServerClient()      ： ユーザーセッションを引き継ぐ（RLS適用）
 *  - createSupabaseServiceRoleClient() ： 管理系処理専用（RLSバイパス、慎重に使う）
 */

import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * リクエストコンテキストのユーザーセッションを引き継ぐクライアント。
 * RLSが適用されるため、Route Handler での通常の読み書きに使う。
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Component からの set 失敗は無視（middleware で更新される）
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // 同上
        }
      },
    },
  });
}

/**
 * service_role キーを使う特権クライアント。RLSをバイパスする。
 * 使用ケース：
 *  - GitHub Actions からの取り込みパイプライン
 *  - 管理系のバックグラウンドジョブ
 *  - 監査ログの記録（一般ユーザー権限では書けない）
 *
 * ★ 呼び出し側で必ず認可チェック済みであることを確認すること（CLAUDE.md §6）
 */
export function createSupabaseServiceRoleClient() {
  return createClient(serverEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
