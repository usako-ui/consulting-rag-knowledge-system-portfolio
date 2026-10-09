/**
 * ブラウザ側 Supabase クライアント（anon key）
 * Route Handler / Server Component からは使わない（use client の中でのみ使用）
 */

'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

export function createSupabaseBrowserClient() {
  return createBrowserClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey());
}
