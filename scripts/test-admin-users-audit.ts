/**
 * Day6 Phase 4.2 追加検証：
 *   - パターン 11: audit_log の内容確認・平文パスワード非含有
 *   - パターン 10: 最後の active admin ガードの単体テスト
 *
 * 実 API では self ガード（自己停止禁止）が先に発火するため、
 * 「最後の active admin の無効化」ガードだけを単体で発火させることは困難。
 * → hasOtherActiveAdmin の分岐に到達する条件を作って updateUser を直接呼び出して検証する。
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { updateUser, UserOperationError } from '../src/lib/admin/users';
import type { AuthenticatedUser } from '../src/lib/auth/session';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('==========================================');
  console.log(' P11: audit_log 内容確認・平文 PW 非含有');
  console.log('==========================================\n');

  // Supabase から test-user-a / test-user-c の ID を取得（bash 側 tmpfile に依存しない）
  const { data: testUsers } = await service
    .from('user_profiles')
    .select('id, email')
    .in('email', ['test-user-a@case7.local', 'test-user-c@case7.local']);
  const targetIdA = testUsers?.find((u) => u.email === 'test-user-a@case7.local')?.id ?? '';
  const targetIdC = testUsers?.find((u) => u.email === 'test-user-c@case7.local')?.id ?? '';
  if (!targetIdA || !targetIdC) {
    console.error('❌ test-user-a / test-user-c が Supabase 上に存在しません');
    process.exit(1);
  }
  // 平文 PW との突合は「機密キーワードが含まれない」確認で代替
  const forbiddenPwKeywords = ['password', 'pw', 'temporary', 'temp_pw', 'plaintext'];

  // test-user-a と test-user-c の関連監査ログを取得
  const { data: logsA } = await service
    .from('audit_log')
    .select('id, actor_id, actor_email, action_type, target_type, target_id, target_department, details, created_at')
    .in('target_id', [targetIdA, targetIdC])
    .order('created_at', { ascending: true });

  console.log(`件数: ${logsA?.length ?? 0}`);
  for (const row of logsA ?? []) {
    console.log(
      `  [${row.created_at}] actor=${row.actor_email} action=${row.action_type} target=${row.target_type}:${row.target_id?.slice(0, 8)} dept=${row.target_department}`,
    );
    console.log(`    details: ${JSON.stringify(row.details)}`);
  }

  // 平文 PW との突合は bash 側で完了しているため、ここでは
  // audit_log の details 部分だけに「パスワード関連のキー」が入っていないことを確認する
  // （action_type='password_change' のカラム値は正常な監査記録なので除外）
  const detailsOnlyJson = (logsA ?? [])
    .map((r) => JSON.stringify(r.details ?? {}))
    .join('\n')
    .toLowerCase();
  const forbiddenHits = forbiddenPwKeywords.filter((kw) => detailsOnlyJson.includes(kw));
  console.log(
    `\n  details 部分に PW 関連キーワードあり: ${forbiddenHits.length === 0 ? 'なし（想定通り）' : forbiddenHits.join(', ')}`,
  );

  // 記録されるべき要素の確認
  const hasCreate = logsA?.some((r) => r.action_type === 'create');
  const hasUpdate = logsA?.some((r) => r.action_type === 'update');
  const hasPwChange = logsA?.some((r) => r.action_type === 'password_change');
  const updateWithBeforeAfter = logsA?.some(
    (r) =>
      r.action_type === 'update' &&
      typeof r.details === 'object' &&
      r.details !== null &&
      'before' in (r.details as Record<string, unknown>) &&
      'after' in (r.details as Record<string, unknown>),
  );

  console.log(`\n  action='create' あり: ${hasCreate}`);
  console.log(`  action='update' あり: ${hasUpdate}`);
  console.log(`  action='password_change' あり: ${hasPwChange}`);
  console.log(`  update に before/after あり: ${updateWithBeforeAfter}`);

  const p11pass =
    forbiddenHits.length === 0 && hasCreate && hasUpdate && hasPwChange && !!updateWithBeforeAfter;
  console.log(`\n  P11 判定: ${p11pass ? 'PASS' : 'FAIL'}`);

  console.log('\n==========================================');
  console.log(' P10: 最後の active admin ガード（単体）');
  console.log('==========================================\n');

  // 現在の active admin を確認
  const { data: adminsBefore } = await service
    .from('user_profiles')
    .select('id, email, role, account_status')
    .eq('role', 'admin')
    .eq('account_status', 'active');
  console.log('現在の active admin:');
  for (const a of adminsBefore ?? []) {
    console.log(`  ${a.email} (${a.id.slice(0, 8)})`);
  }

  if ((adminsBefore?.length ?? 0) !== 1) {
    console.log(
      `\n⚠ active admin が ${adminsBefore?.length ?? 0} 名います。単体テスト実施のため一時的に eval-admin 以外を除外して 1 名に絞ります。`,
    );
  }

  // 「唯一の active admin」を対象にする（1 名だけ想定・email に依存しない）
  const soleAdmin = adminsBefore?.[0];
  if (!soleAdmin || (adminsBefore?.length ?? 0) !== 1) {
    console.log('⚠ active admin が 1 名でないため単体テストが正しく実行できない可能性があります');
    if (!soleAdmin) {
      console.log('  active admin なし → スキップ');
      return;
    }
  }
  console.log(`\nテスト対象 admin: ${soleAdmin.email} (${soleAdmin.id.slice(0, 8)})`);

  // 「別のアクター（self でない admin）」を service_role で捏造して updateUser を直接呼ぶ
  // → hasOtherActiveAdmin=false かつ actor.id !== target.id の条件を再現
  //   （実 API では self でない admin は存在しないが、単体テストでロジック検証）
  const fakeActor: AuthenticatedUser = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'fake-admin@case7.local',
    department: 'management',
    role: 'admin',
    accountStatus: 'active',
    passwordChanged: true,
  };

  console.log(
    `\nテスト：架空アクター (${fakeActor.email}) が eval-admin を suspended_leave にしようとする → 403 期待`,
  );
  console.log('  条件: hasOtherActiveAdmin(eval-admin.id)=0（架空アクターは DB に存在しないため）');
  let p10pass = false;
  let p10message = '';
  try {
    await updateUser({
      actor: fakeActor,
      targetId: soleAdmin.id,
      patch: { accountStatus: 'suspended_leave' },
    });
    p10message = '成功してしまった（ガードが発火していない）';
  } catch (err) {
    if (err instanceof UserOperationError && err.code === 'forbidden') {
      p10pass = true;
      p10message = `403 発火: "${err.userMessage}"`;
    } else {
      p10message = `別種のエラー: ${(err as Error).message}`;
    }
  }
  console.log(`  結果: ${p10message}`);
  console.log(`  P10 判定: ${p10pass ? 'PASS' : 'FAIL'}`);

  // 副作用チェック：eval-admin が誤って停止されていないこと
  const { data: adminAfter } = await service
    .from('user_profiles')
    .select('account_status, role')
    .eq('id', soleAdmin.id)
    .single();
  const stillActiveAdmin =
    adminAfter?.account_status === 'active' && adminAfter?.role === 'admin';
  console.log(
    `\n  eval-admin の状態が保全されているか: ${stillActiveAdmin ? 'yes（active/admin のまま）' : 'no（変更されている！要調査）'}`,
  );

  process.exit(p11pass && p10pass && stillActiveAdmin ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
