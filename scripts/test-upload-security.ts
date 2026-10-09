/**
 * T-28 アップロードセキュリティ自動テスト
 *
 * (1) storagePath 部署プレフィックスの不一致 → 400
 * (2) ZIP 爆弾に近い docx（大きな展開後サイズ宣言）→ checkZipBomb が拒否
 * (3) エントリー数超過の ZIP → checkZipBomb が拒否
 * (4) 通常の docx・PDF ZIP ヘッダー → checkZipBomb が通過
 * (5) anon キーでの Storage 直接アクセス → 拒否
 *
 * 前提：(1)(5) は dev server が localhost:3000 で起動していること
 *       .env に EVAL_HR_EMAIL / EVAL_HR_PASSWORD / NEXT_PUBLIC_SUPABASE_URL /
 *              NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていること
 * 使い方：npx tsx scripts/test-upload-security.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { checkZipBomb } from '../src/lib/ingest/zip-check';

// ─── ユーティリティ ────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が未設定です（.env を確認してください）`);
  return v;
}

let passed = 0;
let failed = 0;

function pass(label: string) {
  console.log(`  PASS  ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

const BASE_URL = 'http://localhost:3000';

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

async function post(path: string, payload: unknown, cookies: string[]): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies.join('; ') },
    body: JSON.stringify(payload),
    redirect: 'manual',
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ─── ZIP テストバッファ生成 ───────────────────────────────────────────────────

/**
 * 最小限の ZIP バッファを構築（セントラルディレクトリ + EOCD のみ。ローカルエントリなし）。
 * checkZipBomb のユニットテスト用。
 */
function buildTestZip(entries: { name: string; uncompressedSize: number }[]): Buffer {
  const cdParts: Buffer[] = [];
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const cd = Buffer.alloc(46 + nameBytes.length, 0);
    cd.writeUInt32LE(0x02014b50, 0);              // CD シグネチャ
    cd.writeUInt32LE(entry.uncompressedSize, 24); // 展開後サイズ
    cd.writeUInt16LE(nameBytes.length, 28);       // ファイル名長
    nameBytes.copy(cd, 46);
    cdParts.push(cd);
  }
  const cdBuf = Buffer.concat(cdParts);

  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);          // EOCD シグネチャ
  eocd.writeUInt16LE(entries.length, 10);     // 総エントリー数
  eocd.writeUInt32LE(cdBuf.length, 12);       // CD サイズ
  eocd.writeUInt32LE(0, 16);                  // CD オフセット（= バッファ先頭）

  return Buffer.concat([cdBuf, eocd]);
}

// ─── テスト本体 ───────────────────────────────────────────────────────────────

async function main() {
  // ── (2) ZIP 爆弾：展開後サイズ超過（ユニットテスト）──
  console.log('\n── (2) checkZipBomb：展開後サイズ超過 ──');
  {
    // 1 エントリー・展開後サイズ = 201 MB（上限 20 MB × 10 = 200 MB を超える）
    const buf = buildTestZip([{ name: 'word/document.xml', uncompressedSize: 201 * 1024 * 1024 }]);
    const result = checkZipBomb(buf, { maxEntries: 1000, maxUncompressedMb: 200 });
    if (!result.ok) {
      pass(`展開後 201 MB → 拒否: ${result.error.slice(0, 60)}...`);
    } else {
      fail('展開後 201 MB が通過してしまった');
    }
  }

  // ── (3) ZIP 爆弾：エントリー数超過（ユニットテスト）──
  console.log('\n── (3) checkZipBomb：エントリー数超過 ──');
  {
    // 1001 エントリー（上限 1000 を超える）・各サイズは 0
    const entries = Array.from({ length: 1001 }, (_, i) => ({ name: `file${i}.xml`, uncompressedSize: 0 }));
    const buf = buildTestZip(entries);
    const result = checkZipBomb(buf, { maxEntries: 1000, maxUncompressedMb: 200 });
    if (!result.ok) {
      pass(`エントリー 1001 件 → 拒否: ${result.error.slice(0, 60)}...`);
    } else {
      fail('エントリー 1001 件が通過してしまった');
    }
  }

  // ── (3b) ZIP64 マーカー（0xFFFFFFFF）の検出 ──
  console.log('\n── (3b) checkZipBomb：ZIP64 マーカー検出 ──');
  {
    const buf = buildTestZip([{ name: 'word/document.xml', uncompressedSize: 0xffffffff }]);
    const result = checkZipBomb(buf, { maxEntries: 1000, maxUncompressedMb: 200 });
    if (!result.ok) {
      pass(`ZIP64 マーカー (0xFFFFFFFF) → 拒否`);
    } else {
      fail('ZIP64 マーカーが通過してしまった');
    }
  }

  // ── (4) 通常の docx 相当（ユニットテスト）──
  console.log('\n── (4) checkZipBomb：通常サイズ（通過すること）──');
  {
    // 3 エントリー・合計展開後 1 MB（問題なし）
    const entries = [
      { name: '[Content_Types].xml', uncompressedSize: 500 * 1024 },
      { name: 'word/document.xml',   uncompressedSize: 300 * 1024 },
      { name: 'word/styles.xml',     uncompressedSize: 200 * 1024 },
    ];
    const buf = buildTestZip(entries);
    const result = checkZipBomb(buf, { maxEntries: 1000, maxUncompressedMb: 200 });
    if (result.ok) {
      pass(`通常 3 エントリー・合計 1 MB → 通過 (entries=${result.entryCount})`);
    } else {
      fail('通常サイズが拒否された', result.error);
    }
  }

  // ── (1) storagePath 部署プレフィックス不一致 → 400（API テスト）──
  console.log('\n── (1) upload-complete：storagePath 部署プレフィックス不一致 → 400 ──');
  let cookies: string[];
  try {
    const hrEmail    = requireEnv('EVAL_HR_EMAIL');
    const hrPassword = requireEnv('EVAL_HR_PASSWORD');
    cookies = await loginAndGetCookies(hrEmail, hrPassword);

    // hr ユーザーが strategy/ で始まる storagePath を送る
    const { status, body } = await post(
      '/api/documents/upload-complete',
      {
        storagePath:  'strategy/00000000-0000-0000-0000-000000000000.pdf',
        sha256hex:    'a'.repeat(64),
        fileSize:     1024,
        filename:     'test.pdf',
        title:        'テスト',
        department:   'hr',
        createdYear:  null,
        clientName:   null,
      },
      cookies,
    );
    if (status === 400) {
      pass(`storagePath=strategy/... / department=hr → 400`);
    } else {
      fail(`storagePath 部署不一致が 400 にならなかった`, `status=${status} body=${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('API テスト失敗（dev server が起動していることを確認してください）', String(err));
  }

  // ── (5) anon キーでの Storage 直接アクセス → 拒否 ──
  console.log('\n── (5) Storage 直接アクセス（anon）→ 拒否 ──');
  try {
    const supabaseUrl     = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'rag-documents';

    const { data, error } = await anonClient.storage.from(bucket).list();
    if (error) {
      pass(`anon での list() → 拒否 (${error.message})`);
    } else if (!data || data.length === 0) {
      pass(`anon での list() → 0 件（RLS またはバケット制限により拒否）`);
    } else {
      fail('anon での Storage list() が成功してしまった', `${data.length} 件が見えた`);
    }
  } catch (err) {
    fail('Storage 直接アクセステスト失敗', String(err));
  }

  // ── 結果サマリ ──
  console.log(`\n---`);
  console.log(`result: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
