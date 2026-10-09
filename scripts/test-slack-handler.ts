/**
 * Slack 経由の RAG 実行における RLS 越境防止の検証スクリプト
 *
 * 実際に Slack へは送信せず、runRagForSlackUser（handler が内部で呼ぶ関数）を
 * 直接叩いて以下を確認する：
 *
 *   1. HR ロールの user で IT 部の質問 → sources=0（他部署の出典が混入しないこと）
 *   2. admin ロールの user で任意の質問 → sources > 0（全部署検索できること）
 *   3. formatter（Block Kit 出力）の構造が想定どおりか
 *
 * これに加えて、Slack Events API のエンドポイント動作（署名検証 → 即時ACK →
 * 非同期回答）は Day7 T-27 の統合テストで実 Slack を使って検証する。
 *
 * 使い方：npm run test-slack-handler
 *
 * 前提：eval-admin / eval-hr が user_profiles に存在すること（Day3 で作成済み）
 */

import 'dotenv/config';
import { runRagForSlackUser } from '@/lib/slack/rag-runner';
import { formatAnswerBlocks } from '@/lib/slack/formatter';
import { serverEnv } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { SlackAuthenticatedUser } from '@/lib/slack/user-resolver';
import type { Department, UserRole } from '@/lib/auth/session';

async function loadProfileByEmail(email: string): Promise<SlackAuthenticatedUser> {
  const service = getServiceRoleClient();
  const { data, error } = await service
    .from('user_profiles')
    .select('id, email, department, role, account_status')
    .eq('email', email)
    .single();
  if (error || !data) throw new Error(`profile not found: ${email}`);
  return {
    id: data.id,
    email: data.email,
    department: data.department as Department,
    role: data.role as UserRole,
    accountStatus: data.account_status,
  };
}

/**
 * role で取得（Day5 で eval-admin の email を PM の Slack email に書き換えたため、
 * email hard-code は Day7 T-30.5 で戻すまで壊れやすい。role で取得すれば email 変更に耐える）
 */
async function loadProfileByRole(role: UserRole, department?: Department): Promise<SlackAuthenticatedUser> {
  const service = getServiceRoleClient();
  let q = service
    .from('user_profiles')
    .select('id, email, department, role, account_status')
    .eq('role', role)
    .eq('account_status', 'active');
  if (department) q = q.eq('department', department);
  const { data, error } = await q.limit(1).single();
  if (error || !data) throw new Error(`profile not found: role=${role}${department ? ` dept=${department}` : ''}`);
  return {
    id: data.id,
    email: data.email,
    department: data.department as Department,
    role: data.role as UserRole,
    accountStatus: data.account_status,
  };
}

async function main() {
  let passed = 0;
  let failed = 0;

  // 1. HR × IT 質問 → RLS 越境防止（source=0 or hr のみ）
  {
    console.log('\n▶ HR ユーザーが IT 部の質問を投げる → 他部署の出典が混入しないこと');
    const hr = await loadProfileByRole('general', 'hr');
    const result = await runRagForSlackUser('AWS 移行のコスト削減効果は？', hr);
    const leaked = result.sources.filter((s) => s.department !== 'hr');
    if (leaked.length === 0) {
      console.log(`  PASS  sources=${result.sources.length}（hr部以外の混入なし・${result.grounding}）`);
      passed++;
    } else {
      console.log(`  FAIL  他部署の出典が混入：${leaked.map((l) => l.department).join(',')}`);
      failed++;
    }
  }

  // 2. admin × 戦略部の質問 → 出典が返る
  {
    console.log('\n▶ 管理者が戦略部の質問を投げる → 正しい出典が返ること');
    const admin = await loadProfileByRole('admin');
    const result = await runRagForSlackUser(
      'DX 戦略における ROI 試算はどうなっていますか？',
      admin,
    );
    if (result.grounding === 'sufficient' && result.sources.length > 0) {
      const titles = result.sources.map((s) => `[${s.department}] ${s.title}`).join(', ');
      console.log(`  PASS  grounding=sufficient / sources=${result.sources.length} (${titles})`);
      passed++;
    } else {
      console.log(`  FAIL  grounding=${result.grounding} / sources=${result.sources.length}`);
      failed++;
    }

    // 3. formatter の構造チェック（管理者の結果を使う）
    console.log('\n▶ formatAnswerBlocks の Block Kit 構造チェック');
    const payload = formatAnswerBlocks(result);
    const hasAnswerBlock = Array.isArray(payload.blocks) && payload.blocks.length > 0;
    const hasFallbackText = typeof payload.text === 'string' && payload.text.length > 0;
    if (hasAnswerBlock && hasFallbackText) {
      console.log(`  PASS  blocks=${payload.blocks.length} / text=${payload.text.length}文字`);
      passed++;
    } else {
      console.log(`  FAIL  blocks or text 欠落`);
      failed++;
    }

    // 4. isFollowup=true の場合、先頭に接頭 Section が付く（Day6 Phase 7）
    console.log('\n▶ formatAnswerBlocks isFollowup=true で接頭文言が入る');
    const followupPayload = formatAnswerBlocks(result, { isFollowup: true });
    const extraBlock =
      Array.isArray(followupPayload.blocks) &&
      followupPayload.blocks.length === payload.blocks.length + 1;
    const prefixInText = followupPayload.text.startsWith('（お待たせしました）');
    const firstBlockHasPrefix =
      Array.isArray(followupPayload.blocks) &&
      followupPayload.blocks[0] &&
      JSON.stringify(followupPayload.blocks[0]).includes('お待たせしました');
    if (extraBlock && prefixInText && firstBlockHasPrefix) {
      console.log(
        `  PASS  blocks=${followupPayload.blocks.length}（+1）/ 先頭 Section に接頭 / text 先頭に接頭`,
      );
      passed++;
    } else {
      console.log(
        `  FAIL  extraBlock=${extraBlock} prefixInText=${prefixInText} firstBlockHasPrefix=${firstBlockHasPrefix}`,
      );
      failed++;
    }
  }

  // ---- SLACK_FALLBACK_MS 環境変数フォールバックのユニットテスト（P2） ----
  // process.env を一時的に書き換えて serverEnv.slackFallbackMs() の挙動を確認する
  // 仕様：未設定・空文字・非数値・1000未満・30000超 → 30000 にフォールバック（throw しない）
  const origFallbackMs = process.env.SLACK_FALLBACK_MS;

  // 5. 未設定 → 30000
  {
    console.log('\n▶ SLACK_FALLBACK_MS 未設定 → 30000 にフォールバック');
    delete process.env.SLACK_FALLBACK_MS;
    const v = serverEnv.slackFallbackMs();
    if (v === 30_000) {
      console.log(`  PASS  value=${v}`);
      passed++;
    } else {
      console.log(`  FAIL  expected=30000, got=${v}`);
      failed++;
    }
  }

  // 6. 空文字 → 30000
  {
    console.log('\n▶ SLACK_FALLBACK_MS="" （空文字）→ 30000 にフォールバック');
    process.env.SLACK_FALLBACK_MS = '';
    const v = serverEnv.slackFallbackMs();
    if (v === 30_000) {
      console.log(`  PASS  value=${v}`);
      passed++;
    } else {
      console.log(`  FAIL  expected=30000, got=${v}`);
      failed++;
    }
  }

  // 7. 非数値（"abc"）→ 30000
  {
    console.log('\n▶ SLACK_FALLBACK_MS=abc （非数値）→ 30000 にフォールバック');
    process.env.SLACK_FALLBACK_MS = 'abc';
    const v = serverEnv.slackFallbackMs();
    if (v === 30_000) {
      console.log(`  PASS  value=${v}`);
      passed++;
    } else {
      console.log(`  FAIL  expected=30000, got=${v}`);
      failed++;
    }
  }

  // 8. 1000未満（"500"）→ 30000
  {
    console.log('\n▶ SLACK_FALLBACK_MS=500 （1000未満）→ 30000 にフォールバック');
    process.env.SLACK_FALLBACK_MS = '500';
    const v = serverEnv.slackFallbackMs();
    if (v === 30_000) {
      console.log(`  PASS  value=${v}`);
      passed++;
    } else {
      console.log(`  FAIL  expected=30000, got=${v}`);
      failed++;
    }
  }

  // 9. 30000超（"31000"）→ 30000
  {
    console.log('\n▶ SLACK_FALLBACK_MS=31000 （30000超）→ 30000 にフォールバック');
    process.env.SLACK_FALLBACK_MS = '31000';
    const v = serverEnv.slackFallbackMs();
    if (v === 30_000) {
      console.log(`  PASS  value=${v}`);
      passed++;
    } else {
      console.log(`  FAIL  expected=30000, got=${v}`);
      failed++;
    }
  }

  // 10. 有効値（"5000"）→ 5000
  {
    console.log('\n▶ SLACK_FALLBACK_MS=5000 （有効値）→ 5000 が返る');
    process.env.SLACK_FALLBACK_MS = '5000';
    const v = serverEnv.slackFallbackMs();
    if (v === 5_000) {
      console.log(`  PASS  value=${v}`);
      passed++;
    } else {
      console.log(`  FAIL  expected=5000, got=${v}`);
      failed++;
    }
  }

  // env を元に戻す
  if (origFallbackMs !== undefined) {
    process.env.SLACK_FALLBACK_MS = origFallbackMs;
  } else {
    delete process.env.SLACK_FALLBACK_MS;
  }

  console.log(`\n---\nresult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
