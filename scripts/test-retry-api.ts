/**
 * T-27 追加自動テスト（再取り込み API）
 *
 * テストケース:
 *   Case 1: testdocs 由来 + 一時エラー (embedding_failed) → 正常に retrying へ遷移
 *   Case 2: web 由来   + 一時エラー (embedding_failed) → 正常に retrying へ遷移（段階3: source で判定）
 *   Case 3: testdocs 由来 + 恒久エラー (pdf_parse_failed) → 409 Conflict で拒否
 *   Case 4: web 由来   + 恒久エラー (pdf_parse_failed) → 409 Conflict で拒否
 *
 * 変更点（段階3）：
 *   - 旧 Case 2（retry_count=0 → 409）を廃止
 *   - source 列で web/testdocs を判別、一時/恒久エラーで許可/拒否を判定
 *
 * 前提：
 *   - dev server が localhost:3000 で起動していること（npm run dev）
 *   - .env に EVAL_ADMIN_EMAIL / EVAL_ADMIN_PASSWORD が設定されていること
 *
 * 使い方：npm run test-retry-api
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
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const ADMIN_EMAIL = requireEnv('EVAL_ADMIN_EMAIL');
const ADMIN_PASSWORD = requireEnv('EVAL_ADMIN_PASSWORD');

function getService() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function loginAndGetCookies(email: string, password: string): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`ログイン失敗 (${res.status}): ${(body as { error?: string }).error ?? '不明'}`);
  }
  const rawCookies: string[] =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get('set-cookie') ?? '').split(/,(?=[^ ])/).filter(Boolean);
  return rawCookies.map((c) => c.split(';')[0]).filter(Boolean);
}

interface RetryResult {
  status: number;
  ok: boolean;
  error?: string;
  newStatus?: string;
  retryCount?: number;
}

async function postRetry(cookies: string[], id: string): Promise<RetryResult> {
  const res = await fetch(`${BASE_URL}/api/admin/ingestion/${id}/retry`, {
    method: 'POST',
    headers: { Cookie: cookies.join('; ') },
    redirect: 'manual',
  });
  const body = await res.json().catch(() => null) as Record<string, unknown> | null;
  return {
    status: res.status,
    ok: body?.ok === true,
    error: body?.error as string | undefined,
    newStatus: body?.newStatus as string | undefined,
    retryCount: body?.retryCount as number | undefined,
  };
}

type RowId = string | null;

async function main() {
  let passed = 0;
  let failed = 0;
  const rowIds: Array<[string, RowId]> = [];

  const service = getService();

  // ── ステップ 1: テスト用 failed 行を INSERT（4 行）──────────────────────
  console.log('▶ テスト用 ingestion_log 行を INSERT（4 行）...\n');

  const cases: Array<{
    label: string;
    source: 'testdocs' | 'web';
    errorCode: string;
    retryCount: number;
  }> = [
    { label: 'Case 1 testdocs + embedding_failed (一時)', source: 'testdocs', errorCode: 'embedding_failed', retryCount: 3 },
    { label: 'Case 2 web      + embedding_failed (一時)', source: 'web',      errorCode: 'embedding_failed', retryCount: 1 },
    { label: 'Case 3 testdocs + pdf_parse_failed (恒久)', source: 'testdocs', errorCode: 'pdf_parse_failed', retryCount: 3 },
    { label: 'Case 4 web      + pdf_parse_failed (恒久)', source: 'web',      errorCode: 'pdf_parse_failed', retryCount: 1 },
  ];

  for (const c of cases) {
    const { data, error } = await service
      .from('ingestion_log')
      .insert({
        file_id: `test-retry-api-${c.source}-${c.errorCode.split('_')[0]}`,
        source: c.source,
        status: 'failed',
        retry_count: c.retryCount,
        error_message: `test-only: ${c.label}`,
        error_code: c.errorCode,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error(`  INSERT 失敗 (${c.label}): ${error?.message ?? '不明'}`);
      rowIds.push([c.label, null]);
    } else {
      console.log(`  INSERT 完了 (${c.label}): id=${(data.id as string).slice(0, 8)}...`);
      rowIds.push([c.label, data.id as string]);
    }
  }

  try {
    // ── ステップ 2: eval-admin でログイン ─────────────────────────────────
    console.log('\n▶ eval-admin でログイン中...');
    const adminCookies = await loginAndGetCookies(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log(`  Cookie 取得: ${adminCookies.length} 件\n`);

    // ── Case 1: testdocs + 一時エラー → 200 ok ───────────────────────────
    const [, id1] = rowIds[0];
    if (id1) {
      console.log('[Case 1] testdocs + embedding_failed → retrying を期待');
      const r = await postRetry(adminCookies, id1);
      const { data: db1 } = await service
        .from('ingestion_log').select('status, retry_count').eq('id', id1).single();
      if (r.status === 200 && r.ok && db1?.status === 'retrying' && (db1?.retry_count as number) === 0) {
        console.log(`  PASS  API status=${r.status}, DB status=retrying, retry_count=0`);
        passed++;
      } else {
        console.log(`  FAIL  API: ${r.status}/${r.ok}, DB: ${JSON.stringify(db1)}`);
        failed++;
      }
      // retrying → failed に戻す（後続テスト用ではなく cleanup 用）
      await service.from('ingestion_log').update({ status: 'failed', retry_count: 3 }).eq('id', id1);
    }

    // ── Case 2: web + 一時エラー → 200 ok（段階3 新規）───────────────────
    const [, id2] = rowIds[1];
    if (id2) {
      console.log('\n[Case 2] web + embedding_failed → retrying を期待（段階3 新規）');
      const r = await postRetry(adminCookies, id2);
      const { data: db2 } = await service
        .from('ingestion_log').select('status, retry_count').eq('id', id2).single();
      if (r.status === 200 && r.ok && db2?.status === 'retrying' && (db2?.retry_count as number) === 0) {
        console.log(`  PASS  API status=${r.status}, DB status=retrying, retry_count=0`);
        passed++;
      } else {
        console.log(`  FAIL  API: ${r.status}/${r.ok}, DB: ${JSON.stringify(db2)}`);
        failed++;
      }
    }

    // ── Case 3: testdocs + 恒久エラー → 409 ──────────────────────────────
    const [, id3] = rowIds[2];
    if (id3) {
      console.log('\n[Case 3] testdocs + pdf_parse_failed → 409 Conflict を期待');
      const r = await postRetry(adminCookies, id3);
      const { data: db3 } = await service
        .from('ingestion_log').select('status').eq('id', id3).single();
      if (r.status === 409 && !r.ok && db3?.status === 'failed') {
        console.log(`  PASS  API status=409, ok=false, DB status=failed（変化なし）`);
        console.log(`  メッセージ: "${r.error ?? ''}"`);
        passed++;
      } else {
        console.log(`  FAIL  API: ${r.status}/${r.ok}/${r.error}, DB: ${JSON.stringify(db3)}`);
        failed++;
      }
    }

    // ── Case 4: web + 恒久エラー → 409 ───────────────────────────────────
    const [, id4] = rowIds[3];
    if (id4) {
      console.log('\n[Case 4] web + pdf_parse_failed → 409 Conflict を期待');
      const r = await postRetry(adminCookies, id4);
      const { data: db4 } = await service
        .from('ingestion_log').select('status').eq('id', id4).single();
      if (r.status === 409 && !r.ok && db4?.status === 'failed') {
        console.log(`  PASS  API status=409, ok=false, DB status=failed（変化なし）`);
        console.log(`  メッセージ: "${r.error ?? ''}"`);
        passed++;
      } else {
        console.log(`  FAIL  API: ${r.status}/${r.ok}/${r.error}, DB: ${JSON.stringify(db4)}`);
        failed++;
      }
    }

  } finally {
    // ── クリーンアップ ──────────────────────────────────────────────────
    console.log('\n▶ テスト行を DELETE...');
    for (const [label, rowId] of rowIds) {
      if (!rowId) continue;
      const { error } = await service.from('ingestion_log').delete().eq('id', rowId);
      if (error) {
        console.warn(`  ⚠ DELETE 失敗 (${label}): ${error.message}`);
      } else {
        console.log(`  DELETE 完了 (${label})`);
      }
    }
  }

  console.log(`\n---\nresult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
