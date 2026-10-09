/**
 * テストユーザーセットアップ（Day3 Recall@5 検証用）
 *
 * 使い方：npm run setup-test-users
 *
 * 参照：architecture.md §12B.5
 *
 * 作成対象：
 *   - eval-admin@case7.local（部署=management, role=admin）
 *   - eval-hr@case7.local  （部署=hr,        role=general）
 *
 * ★ .env の SUPABASE_SERVICE_ROLE_KEY が必要（Supabase Auth Admin API 使用）
 * ★ 既存ユーザーは skip・profile は upsert（冪等）
 */

import 'dotenv/config';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

interface TestUser {
  email: string;
  password: string;
  department: 'strategy' | 'business' | 'it' | 'hr' | 'sales' | 'management';
  role: 'general' | 'admin';
}

// 検証用アカウントの認証情報は .env から読み出す（平文をリポジトリに置かない）
// EVAL_ADMIN_EMAIL / EVAL_ADMIN_PASSWORD / EVAL_HR_EMAIL / EVAL_HR_PASSWORD
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} が .env に未設定です。.env.example の 「検証用アカウント」節を参照して .env に設定してください`,
    );
  }
  return v;
}

const TEST_USERS: TestUser[] = [
  {
    email: requireEnv('EVAL_ADMIN_EMAIL'),
    password: requireEnv('EVAL_ADMIN_PASSWORD'),
    department: 'management',
    role: 'admin',
  },
  {
    email: requireEnv('EVAL_HR_EMAIL'),
    password: requireEnv('EVAL_HR_PASSWORD'),
    department: 'hr',
    role: 'general',
  },
];

async function ensureUser(u: TestUser): Promise<string> {
  const supabase = getServiceRoleClient();

  // 既存ユーザー確認
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers 失敗: ${listErr.message}`);

  const existing = list?.users?.find((x) => x.email === u.email);
  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log(`[setup] user ${u.email} exists → id=${userId}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser 失敗: ${error?.message ?? 'no user'}`);
    userId = data.user.id;
    console.log(`[setup] created user ${u.email} → id=${userId}`);
  }

  // user_profiles upsert（部署・ロール確定、password_changed=true で初回変更フローをスキップ）
  const { error: profErr } = await supabase.from('user_profiles').upsert({
    id: userId,
    email: u.email,
    department: u.department,
    role: u.role,
    account_status: 'active',
    password_changed: true,
  });
  if (profErr) throw new Error(`profile upsert 失敗: ${profErr.message}`);
  console.log(`[setup] profile upserted → ${u.email} / ${u.department} / ${u.role}`);

  return userId;
}

async function main(): Promise<void> {
  for (const u of TEST_USERS) {
    await ensureUser(u);
  }
  console.log('\n[setup] 完了。認証情報は scripts/eval-recall.ts と共有（source of truth）');
}

main().catch((err) => {
  console.error('[setup] fatal:', err);
  process.exit(1);
});
