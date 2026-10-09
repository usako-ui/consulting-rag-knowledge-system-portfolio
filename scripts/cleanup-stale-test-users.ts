/**
 * 前回失敗した E2E 実行で中途状態のまま残った test-user-* を pending_deletion に片付ける。
 * （本番運用では不要・開発セッション後片付け専用）
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const service = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const { data: targets } = await service
    .from('user_profiles')
    .select('id, email, account_status')
    .like('email', 'test-user-%@case7.local')
    .neq('account_status', 'pending_deletion');
  console.log(`cleanup target count: ${targets?.length ?? 0}`);
  for (const u of targets ?? []) {
    const { error } = await service
      .from('user_profiles')
      .update({
        account_status: 'pending_deletion',
        retirement_retention_deadline: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', u.id);
    console.log(
      `  ${u.email} (prev=${u.account_status}): ${error ? 'FAIL ' + error.message : 'OK → pending_deletion'}`,
    );
  }
  const { data: after } = await service
    .from('user_profiles')
    .select('email, account_status')
    .eq('account_status', 'active');
  console.log('\n=== active users after cleanup ===');
  for (const u of after ?? []) console.log(`  ${u.email}`);
}

main().catch(console.error);
