/**
 * T-27 追加自動テスト（HTTP層アクセス制御）
 *
 * No.3:   eval-hr でログイン済み状態で /api/admin/* を呼び出す → 403 であること
 * No.4-9: eval-hr で /api/search に他部署フィルタをかける → 403 であること
 * No.10-11: eval-hr の Supabase クライアントで他部署 document を SELECT → 0件 であること
 *
 * 前提：
 *   - dev server が localhost:3000 で起動していること（npm run dev）
 *   - .env に EVAL_HR_EMAIL / EVAL_HR_PASSWORD が設定されていること
 *
 * 使い方：npm run test-api-access-control
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が未設定です（.env を確認してください）`);
  return v;
}

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const HR_EMAIL = requireEnv('EVAL_HR_EMAIL');
const HR_PASSWORD = requireEnv('EVAL_HR_PASSWORD');

/** /api/auth/login してセッションCookieを返す */
async function loginAndGetCookies(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: HR_EMAIL, password: HR_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`ログイン失敗 (${res.status}): ${(body as { error?: string }).error ?? '不明'}`);
  }

  // Node 18.14+ の getSetCookie() で複数 Set-Cookie ヘッダを取得
  const rawCookies: string[] =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get('set-cookie') ?? '').split(/,(?=[^ ])/).filter(Boolean);

  // "name=value" 部分だけ取り出す
  return rawCookies.map((c) => c.split(';')[0]).filter(Boolean);
}

/** Cookie 付きで GET */
async function get(path: string, cookies: string[]): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: cookies.join('; ') },
    redirect: 'manual', // リダイレクトを追わず status code を直接取得
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Cookie 付きで POST */
async function post(
  path: string,
  payload: unknown,
  cookies: string[],
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies.join('; ') },
    body: JSON.stringify(payload),
    redirect: 'manual',
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  let passed = 0;
  let failed = 0;

  console.log('▶ eval-hr でログイン中...');
  let hrCookies: string[];
  try {
    hrCookies = await loginAndGetCookies();
    console.log(`  Cookie 取得: ${hrCookies.length} 件`);
  } catch (err) {
    console.error(`  LOGIN FAIL: ${(err as Error).message}`);
    console.error(
      '  → npm run setup-test-users を実行してアカウントを作成してください',
    );
    process.exit(1);
  }

  // ─── No.3: 一般ユーザー → /api/admin/* → 403 ────────────────────────
  console.log('\n── No.3: 一般ユーザーが /api/admin/* を呼ぶと 403 ──');

  const adminEndpoints = [
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/ingestion/dummy-id/retry' },
    { method: 'POST', path: '/api/admin/settings/api-budget' },
    { method: 'POST', path: '/api/admin/settings/log-retention' },
  ] as const;

  for (const ep of adminEndpoints) {
    const { status } =
      ep.method === 'GET'
        ? await get(ep.path, hrCookies)
        : await post(ep.path, {}, hrCookies);

    if (status === 403) {
      console.log(`  PASS  ${ep.method} ${ep.path} → ${status}`);
      passed++;
    } else {
      console.log(`  FAIL  ${ep.method} ${ep.path} → ${status}（期待: 403）`);
      failed++;
    }
  }

  // ─── No.4-9: 他部署フィルタで 403 ──────────────────────────────────
  console.log('\n── No.4-9: /api/search で他部署フィルタ → 403 ──');

  const otherDepts = ['strategy', 'business', 'it', 'sales', 'management'] as const;
  for (const dept of otherDepts) {
    const { status } = await post(
      '/api/search',
      { question: 'テスト', filters: { department: dept, createdYear: null, clientName: null } },
      hrCookies,
    );
    if (status === 403) {
      console.log(`  PASS  department='${dept}' → ${status}`);
      passed++;
    } else {
      console.log(`  FAIL  department='${dept}' → ${status}（期待: 403）`);
      failed++;
    }
  }

  // ─── No.4-9-ext: eval-hr でフィルタなし × IT向け質問 → 出典すべて hr 部署 ──
  console.log('\n── No.4-9-ext: eval-hr・フィルタ null × IT向け質問 → sources はすべて hr ──');
  {
    const itQuestion = 'クラウドへの移行コスト削減効果は？';
    const { status, body } = await post(
      '/api/search',
      { question: itQuestion, filters: { department: null, createdYear: null, clientName: null } },
      hrCookies,
    );
    if (status !== 200) {
      console.log(`  FAIL  status=${status}（期待: 200）`);
      failed++;
    } else {
      type SearchBody = { ok: boolean; sources?: { department: string }[] };
      const b = body as SearchBody;
      const sources = b?.sources ?? [];
      const nonHr = sources.filter((s) => s.department !== 'hr');
      if (nonHr.length === 0) {
        console.log(`  PASS  sources=${sources.length}件・すべて hr 部署（cross-dept leak なし）`);
        passed++;
      } else {
        console.log(`  FAIL  hr 以外の出典が ${nonHr.length} 件: ${JSON.stringify(nonHr.map((s) => s.department))}`);
        failed++;
      }
    }
  }

  // ─── No.10-11: eval-hr の Supabase クライアントで他部署 document → 0件 ──
  console.log('\n── No.10-11: eval-hr Supabase クライアントで他部署 document SELECT → 0件 ──');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: HR_EMAIL,
    password: HR_PASSWORD,
  });
  if (signInErr) {
    console.error(`  Supabase signIn 失敗: ${signInErr.message}`);
    failed++;
  } else {
    // documents テーブル：他部署（it / strategy / sales / business / management）
    const { data: docs, error: docsErr } = await supabase
      .from('documents')
      .select('id, department')
      .neq('department', 'hr')
      .eq('is_active', true);

    if (docsErr) {
      console.log(`  FAIL  documents SELECT エラー: ${docsErr.message}`);
      failed++;
    } else if (!docs || docs.length === 0) {
      console.log(`  PASS  documents(is_active=true, dept≠hr) → 0件（RLSブロック確認）`);
      passed++;
    } else {
      console.log(`  FAIL  他部署 document が ${docs.length} 件取得されてしまった`);
      failed++;
    }

    // document_chunks テーブル：他部署チャンク
    const { data: chunks, error: chunksErr } = await supabase
      .from('document_chunks')
      .select('id, department')
      .neq('department', 'hr');

    if (chunksErr) {
      console.log(`  FAIL  document_chunks SELECT エラー: ${chunksErr.message}`);
      failed++;
    } else if (!chunks || chunks.length === 0) {
      console.log(`  PASS  document_chunks(dept≠hr) → 0件（RLSブロック確認）`);
      passed++;
    } else {
      console.log(`  FAIL  他部署 chunk が ${chunks.length} 件取得されてしまった`);
      failed++;
    }

    await supabase.auth.signOut();
  }

  console.log(`\n---\nresult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
