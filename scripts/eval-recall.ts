/**
 * Recall@5 実測スクリプト（Day3 完了条件検証）
 *
 * 使い方：
 *   1. npm run setup-test-users（初回のみ）
 *   2. npm run eval-recall
 *
 * 参照：requirements.md §22 精度検証, architecture.md §12B.5
 *
 * 判定：
 *   - No.1〜9：正解文書（file_id）が source top5 に含まれるか。合格率 80% 以上で受け入れ
 *   - No.10・11：grounding='insufficient' かつ answer に「たぶん/おそらく/思われる/かもしれ」等の推測表現が無いか
 *   - No.12：eval-hr（人事）で IT 部の質問 → sources=0 or 全て hr のみが返るか
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import { answerQuestion } from '@/lib/rag/answer';

interface CsvRow {
  no: number;
  question: string;
  expected: string; // e.g. "case7-doc1-strategy-dx-bank" or "case7-doc1 / case7-doc3 / case7-doc4"
  type: string;
}

interface EvalResult {
  no: number;
  question: string;
  verdict: 'PASS' | 'FAIL';
  note: string;
  answer: string;
  sourceIds: string[];
}

// 検証用アカウントの認証情報は .env から読み出す（平文をリポジトリに置かない）
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} が .env に未設定です。.env.example の「検証用アカウント」節を参照してください`,
    );
  }
  return v;
}
const ADMIN = {
  email: requireEnv('EVAL_ADMIN_EMAIL'),
  password: requireEnv('EVAL_ADMIN_PASSWORD'),
};
const HR = {
  email: requireEnv('EVAL_HR_EMAIL'),
  password: requireEnv('EVAL_HR_PASSWORD'),
};

const SPECULATIVE_PATTERN = /(たぶん|おそらく|思われる|かもしれ|であろう|でしょう|と推測)/;

// Gemini 無料枠は RPM=5。安全側の 15秒間隔（4RPM）で回す
const REQUEST_INTERVAL_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsv(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: CsvRow[] = [];
  for (const line of lines) {
    if (line.startsWith('番号')) continue;
    // 単純 split で問題ない（このCSVは値にカンマを含まない）
    const parts = line.split(',');
    if (parts.length < 5) continue;
    rows.push({
      no: Number(parts[0]),
      question: parts[1].trim(),
      expected: parts[2].trim(),
      type: parts[4].trim(),
    });
  }
  return rows;
}

async function signInAs(user: { email: string; password: string }): Promise<SupabaseClient> {
  const client = createClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey());
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) {
    throw new Error(
      `signIn 失敗（${user.email}）: ${error.message}\n先に \`npm run setup-test-users\` を実行してください`,
    );
  }
  return client;
}

/** documents 表から file_id → documentId マップを作る（採点用） */
async function loadFileIdMap(client: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await client
    .from('documents')
    .select('id, file_id')
    .eq('is_active', true);
  if (error) throw new Error(`documents 一覧取得失敗: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    // "case7-doc1-strategy-dx-bank.pdf" → "case7-doc1-strategy-dx-bank" もキーに
    const withoutExt = row.file_id.replace(/\.pdf$/i, '');
    map.set(row.file_id, row.id);
    map.set(withoutExt, row.id);
    // CSV の省略記法（"case7-doc1" のみ）にも対応
    const shortMatch = withoutExt.match(/^(case7-doc\d+)/);
    if (shortMatch) map.set(shortMatch[1], row.id);
  }
  return map;
}

function judgeRetrieval(
  expected: string,
  sourceDocIds: string[],
  fileIdMap: Map<string, string>,
): { pass: boolean; note: string } {
  const expectedKeys = expected
    .split(/[\s\/,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.startsWith('case7'));
  if (expectedKeys.length === 0) {
    return { pass: false, note: `expected 列から case7-doc* を抽出できず: "${expected}"` };
  }
  const expectedDocIds = expectedKeys
    .map((k) => fileIdMap.get(k))
    .filter((v): v is string => !!v);
  if (expectedDocIds.length === 0) {
    return { pass: false, note: `documents 表に正解文書が見つからず: ${expectedKeys.join(', ')}` };
  }
  const hits = expectedDocIds.filter((id) => sourceDocIds.includes(id));
  if (hits.length === 0) {
    return {
      pass: false,
      note: `正解文書が出典に含まれず（expected=${expectedKeys.join(',')}, got=${sourceDocIds.length}件）`,
    };
  }
  // 「すべて挙げてください」タイプ（複数正解）の場合は全ヒットを要求
  const requireAll = expectedKeys.length >= 2;
  if (requireAll && hits.length < expectedDocIds.length) {
    return {
      pass: false,
      note: `複数正解のうち${hits.length}/${expectedDocIds.length}件のみヒット`,
    };
  }
  return {
    pass: true,
    note: `${hits.length}/${expectedDocIds.length}件ヒット`,
  };
}

async function main(): Promise<void> {
  const csv = await readFile('tests/case7-test-questions.csv', 'utf-8');
  const rows = parseCsv(csv);
  console.log(`[eval] loaded ${rows.length} questions`);

  const adminClient = await signInAs(ADMIN);
  console.log('[eval] signed in as eval-admin');
  const hrClient = await signInAs(HR);
  console.log('[eval] signed in as eval-hr');

  const fileIdMap = await loadFileIdMap(adminClient);
  console.log(`[eval] loaded ${fileIdMap.size / 2} documents`);

  const results: EvalResult[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const client = row.no === 12 ? hrClient : adminClient;
    const label = row.no === 12 ? 'HR' : 'ADMIN';

    // Gemini 無料枠 RPM=5 を回避するため、2 問目以降は待機
    if (idx > 0) {
      await sleep(REQUEST_INTERVAL_MS);
    }
    console.log(`\n[eval] No.${row.no} (${label}): ${row.question.slice(0, 40)}...`);

    try {
      const result = await answerQuestion(
        {
          question: row.question,
          filters: { department: null, createdYear: null, clientName: null },
        },
        client,
      );

      const sourceDocIds = result.sources.map((s) => s.documentId);
      let verdict: 'PASS' | 'FAIL' = 'PASS';
      let note = '';

      if (row.no >= 1 && row.no <= 9) {
        // 通常検索：出典に正解文書が含まれるか
        const judgment = judgeRetrieval(row.expected, sourceDocIds, fileIdMap);
        verdict = judgment.pass ? 'PASS' : 'FAIL';
        note = `${judgment.note} / grounding=${result.grounding}`;
      } else if (row.no === 10 || row.no === 11) {
        // ハルシネーション検証
        if (result.grounding !== 'insufficient') {
          verdict = 'FAIL';
          note = `insufficient を期待したが sufficient: "${result.answer.slice(0, 60)}"`;
        } else if (SPECULATIVE_PATTERN.test(result.answer)) {
          verdict = 'FAIL';
          note = `answer に推測表現が混入: "${result.answer.slice(0, 60)}"`;
        } else {
          note = 'insufficient・推測表現なし';
        }
      } else if (row.no === 12) {
        // RLS 越境検証：HR ユーザーが IT 質問 → 0件 or 全て hr のみが期待
        const nonHrSources = result.sources.filter((s) => s.department !== 'hr');
        if (nonHrSources.length > 0) {
          verdict = 'FAIL';
          note = `RLS 越境発生: 他部署の出典 ${nonHrSources.length} 件が返された`;
        } else {
          note = result.sources.length === 0 ? 'RLS ブロック: 0 件' : `hr 部署のみ ${result.sources.length} 件`;
        }
      }

      const shortAnswer = result.answer.slice(0, 80).replace(/\n/g, ' ');
      console.log(`  verdict=${verdict}: ${note}`);
      console.log(`  answer: "${shortAnswer}${result.answer.length > 80 ? '...' : ''}"`);

      results.push({
        no: row.no,
        question: row.question,
        verdict,
        note,
        answer: result.answer,
        sourceIds: sourceDocIds,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  verdict=FAIL: exception - ${msg}`);
      results.push({
        no: row.no,
        question: row.question,
        verdict: 'FAIL',
        note: `exception: ${msg}`,
        answer: '',
        sourceIds: [],
      });
    }
  }

  // サマリ
  console.log('\n===== SUMMARY =====');
  const passCount = results.filter((r) => r.verdict === 'PASS').length;
  console.log(`Overall: ${passCount}/${results.length} PASS`);

  const retrievalRows = results.filter((r) => r.no >= 1 && r.no <= 9);
  const retrievalPass = retrievalRows.filter((r) => r.verdict === 'PASS').length;
  const recall5 = retrievalPass / retrievalRows.length;
  console.log(
    `Recall@5 (No.1-9): ${retrievalPass}/${retrievalRows.length} = ${(recall5 * 100).toFixed(1)}% ` +
      `(target: 80%, ${recall5 >= 0.8 ? 'ACHIEVED ✓' : 'NOT met'})`,
  );

  const hallucination = results.filter((r) => r.no === 10 || r.no === 11);
  const hallucinationPass = hallucination.filter((r) => r.verdict === 'PASS').length;
  console.log(`Hallucination (No.10-11): ${hallucinationPass}/${hallucination.length} PASS`);

  const rlsRow = results.find((r) => r.no === 12);
  console.log(`RLS越境 (No.12): ${rlsRow?.verdict ?? 'N/A'}`);

  console.log('\n--- Details ---');
  for (const r of results) {
    console.log(`No.${String(r.no).padStart(2)} ${r.verdict}: ${r.note}`);
  }

  const overallOk = recall5 >= 0.8 && hallucinationPass === hallucination.length && rlsRow?.verdict === 'PASS';
  process.exit(overallOk ? 0 : 1);
}

main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(1);
});
