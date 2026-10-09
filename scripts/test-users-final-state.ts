/**
 * テスト完了後の最終状態を確認する。
 *   - test-user-a / test-user-c が pending_deletion であること
 *   - eval-admin が active/admin のまま
 *   - 一般ユーザー一覧（is_active=true, account_status=active）に test-user-a/c が含まれないこと
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const service = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  console.log('=== テストユーザーの最終状態 ===');
  const { data } = await service
    .from('user_profiles')
    .select('email, role, department, account_status, retirement_retention_deadline')
    .order('email', { ascending: true });
  for (const u of data ?? []) {
    console.log(
      `  ${u.email.padEnd(35)} role=${u.role.padEnd(8)} dept=${(u.department as string).padEnd(12)} status=${u.account_status}${u.retirement_retention_deadline ? ` deadline=${u.retirement_retention_deadline}` : ''}`,
    );
  }

  console.log('\n=== active な一般ユーザー画面ログイン可能アカウント ===');
  const { data: active } = await service
    .from('user_profiles')
    .select('email, role, account_status')
    .eq('account_status', 'active');
  for (const u of active ?? []) {
    console.log(`  ${u.email} (${u.role})`);
  }

  const testUsersActive = active?.filter((u) => u.email.startsWith('test-user-'));
  console.log(
    `\n  test-user-* が active に含まれない: ${testUsersActive?.length === 0 ? 'yes（想定通り）' : `no（${testUsersActive?.length} 件が active・要調査）`}`,
  );
}

main().catch(console.error);
