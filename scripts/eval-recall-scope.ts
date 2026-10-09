/**
 * eval-recall-scope.ts — スコープ別 Recall@5 評価（2026-10-06 追加）
 *
 * 検索順位ベース（要件§22）と出典ベース（運用指標）の両方を計測する。
 * スコープ：
 *   spec4 — case7-doc1〜doc4 の 4 文書のみを正解文書として判定
 *   all   — DB の is_active=true 全文書を対象（テスト docx を含む）
 *
 * 使い方：
 *   npx ts-node --project tsconfig.scripts.json scripts/eval-recall-scope.ts spec4
 *   npx ts-node --project tsconfig.scripts.json scripts/eval-recall-scope.ts all
 *
 * 参照：requirements.md §22, architecture.md §12B.5・§12B.6
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import { getLlmProvider } from '@/lib/llm';
import { answerQuestion } from '@/lib/rag/answer';
import type { RagAnswer } from '@/lib/rag/types';
import { NO_MATCH_ANSWER } from '@/lib/rag/types';

// ──────────────────────────────────────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────────────────────────────────────
type Scope = 'spec4' | 'all';

interface CsvRow {
  no: number;
  question: string;
  expected: string;
  type: string;
}

interface SearchRow {
  id: string;
  document_id: string;
  title: string;
  department: string;
  page_number: number | null;
  section_title: string | null;
  content: string;
  similarity: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// 設定
// ──────────────────────────────────────────────────────────────────────────────

// Gemini 無料枠 LLM RPM=5 を考慮し 15 秒間隔（4 RPM）
const REQUEST_INTERVAL_MS = 15_000;
const MATCH_COUNT = 5;
const SPEC4_FETCH_COUNT = 10;

// spec4 スコープでのみ正解文書として扱う file_id プレフィックス
const SPEC4_PREFIXES = ['case7-doc1', 'case7-doc2', 'case7-doc3', 'case7-doc4'];

// ──────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────────────────────────────────────────
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} が .env に未設定です`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCsv(csv: string): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('番号')) continue;
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

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey());
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn 失敗(${email}): ${error.message}`);
  return client;
}

/** file_id → document_id マップ（スコープで絞込） */
async function loadFileIdMap(client: SupabaseClient, scope: Scope): Promise<Map<string, string>> {
  const { data, error } = await client
    .from('documents')
    .select('id, file_id')
    .eq('is_active', true);
  if (error) throw new Error(`documents 一覧取得失敗: ${error.message}`);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    // spec4 スコープでは case7-doc1〜4 以外はマップに入れない
    if (scope === 'spec4') {
      const prefix = row.file_id.match(/^(case7-doc\d+)/)?.[1];
      if (!prefix || !SPEC4_PREFIXES.includes(prefix)) continue;
    }
    const withoutExt = row.file_id.replace(/\.pdf$/i, '');
    map.set(row.file_id, row.id);
    map.set(withoutExt, row.id);
    const shortMatch = withoutExt.match(/^(case7-doc\d+)/);
    if (shortMatch) map.set(shortMatch[1], row.id);
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────────────
// spec4 スコープ用：チャンクを filterDocIds に絞ってから LLM に渡す
// ──────────────────────────────────────────────────────────────────────────────
async function answerWithFilteredChunks(
  question: string,
  client: SupabaseClient,
  filterDocIds: string[],
): Promise<RagAnswer> {
  const provider = getLlmProvider();
  const { vector } = await provider.embed({ text: question });

  const { data, error } = await client.rpc('search_document_chunks', {
    query_embedding: vector,
    match_count: SPEC4_FETCH_COUNT,
    department_filter: null,
    year_filter: null,
    client_filter: null,
  });
  if (error) throw new Error(`RPC error: ${error.message}`);

  const allRows = (data ?? []) as SearchRow[];
  const filteredRows = allRows
    .filter((r) => filterDocIds.includes(r.document_id))
    .slice(0, MATCH_COUNT);

  if (filteredRows.length === 0) {
    return {
      grounding: 'insufficient',
      answer: NO_MATCH_ANSWER,
      sources: [],
      reason: '検索結果0件（spec4文書に類似なし）',
      meta: { chunksSearched: 0, provider: provider.name, embeddingTokens: 0, chatTokens: 0 },
    };
  }

  const answerResult = await provider.generateAnswer({
    question,
    contexts: filteredRows.map((r) => ({
      title: r.title,
      pageNumber: r.page_number,
      sectionTitle: r.section_title,
      content: r.content,
      similarity: r.similarity,
    })),
  });

  const sufficient = answerResult.groundingSufficient && answerResult.usedContextIndexes.length > 0;
  const usedRows = answerResult.usedContextIndexes
    .map((i) => filteredRows[i])
    .filter((r): r is SearchRow => !!r);

  const byDoc = new Map<string, SearchRow>();
  for (const r of usedRows) {
    const prev = byDoc.get(r.document_id);
    if (!prev || r.similarity > prev.similarity) byDoc.set(r.document_id, r);
  }
  const sources = Array.from(byDoc.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MATCH_COUNT)
    .map((r) => ({
      documentId: r.document_id,
      title: r.title,
      department: r.department as never,
      pageNumber: r.page_number,
      sectionTitle: r.section_title,
      similarity: r.similarity,
    }));

  return {
    grounding: sufficient ? 'sufficient' : 'insufficient',
    answer: sufficient ? answerResult.answer : NO_MATCH_ANSWER,
    sources: sufficient ? sources : [],
    reason: answerResult.reason,
    meta: { chunksSearched: filteredRows.length, provider: provider.name, embeddingTokens: 0, chatTokens: answerResult.tokenCount },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 検索順位ベース判定（LLM なし）
// ──────────────────────────────────────────────────────────────────────────────
async function searchRankCheck(
  question: string,
  client: SupabaseClient,
  expectedDocIds: string[],
  filterDocIds?: string[],
): Promise<{ pass: boolean; note: string; hitDocIds: string[] }> {
  const provider = getLlmProvider();
  const { vector } = await provider.embed({ text: question });

  const { data, error } = await client.rpc('search_document_chunks', {
    query_embedding: vector,
    match_count: filterDocIds ? SPEC4_FETCH_COUNT : MATCH_COUNT,
    department_filter: null,
    year_filter: null,
    client_filter: null,
  });
  if (error) throw new Error(`RPC error: ${error.message}`);

  let rows = (data ?? []) as SearchRow[];
  if (filterDocIds) {
    rows = rows.filter((r) => filterDocIds.includes(r.document_id)).slice(0, MATCH_COUNT);
  }
  const hitDocIds = [...new Set(rows.map((r) => r.document_id))];

  if (expectedDocIds.length === 0) {
    return {
      pass: hitDocIds.length === 0,
      note: hitDocIds.length === 0 ? 'PASS（0件）' : `FAIL（${hitDocIds.length}件ヒット）`,
      hitDocIds,
    };
  }

  const hits = expectedDocIds.filter((id) => hitDocIds.includes(id));
  const pass = hits.length === expectedDocIds.length;
  return {
    pass,
    note: pass ? `PASS（${hits.length}/${expectedDocIds.length}）` : `FAIL（${hits.length}/${expectedDocIds.length}）`,
    hitDocIds,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 出典ベース判定（LLM あり）
// ──────────────────────────────────────────────────────────────────────────────
const SPECULATIVE_PATTERN = /(たぶん|おそらく|思われる|かもしれ|であろう|でしょう|と推測)/;

async function citationCheck(
  question: string,
  client: SupabaseClient,
  no: number,
  expectedDocIds: string[],
  filterDocIds?: string[],
): Promise<{ pass: boolean; note: string; grounding: string }> {
  const result = filterDocIds
    ? await answerWithFilteredChunks(question, client, filterDocIds)
    : await answerQuestion(
        { question, filters: { department: null, createdYear: null, clientName: null } },
        client,
      );
  const sourceDocIds = result.sources.map((s) => s.documentId);

  if (no >= 1 && no <= 9) {
    if (expectedDocIds.length === 0) {
      return { pass: false, note: '期待文書なし（判定不能）', grounding: result.grounding };
    }
    const hits = expectedDocIds.filter((id) => sourceDocIds.includes(id));
    const requireAll = expectedDocIds.length >= 2;
    const pass = requireAll ? hits.length === expectedDocIds.length : hits.length > 0;
    return {
      pass,
      note: pass ? `${hits.length}/${expectedDocIds.length}件` : `${hits.length}/${expectedDocIds.length}件のみ`,
      grounding: result.grounding,
    };
  }

  if (no === 10 || no === 11) {
    if (result.grounding !== 'insufficient') {
      return { pass: false, note: `grounding=${result.grounding}（insufficient 期待）`, grounding: result.grounding };
    }
    if (SPECULATIVE_PATTERN.test(result.answer)) {
      return { pass: false, note: '推測表現あり', grounding: result.grounding };
    }
    return { pass: true, note: 'insufficient・推測表現なし', grounding: result.grounding };
  }

  if (no === 12) {
    const nonHr = result.sources.filter((s) => s.department !== 'hr');
    if (nonHr.length > 0) {
      return { pass: false, note: `RLS越境: hr以外 ${nonHr.length}件`, grounding: result.grounding };
    }
    return {
      pass: true,
      note: result.sources.length === 0 ? 'RLSブロック: 0件' : `hr部署のみ ${result.sources.length}件`,
      grounding: result.grounding,
    };
  }

  return { pass: false, note: `No.${no} 判定不能`, grounding: result.grounding };
}

// ──────────────────────────────────────────────────────────────────────────────
// main
// ──────────────────────────────────────────────────────────────────────────────
async function runScope(scope: Scope): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`スコープ: ${scope}`);
  console.log(`${'='.repeat(60)}`);

  const adminEmail = requireEnv('EVAL_ADMIN_EMAIL');
  const adminPass = requireEnv('EVAL_ADMIN_PASSWORD');
  const hrEmail = requireEnv('EVAL_HR_EMAIL');
  const hrPass = requireEnv('EVAL_HR_PASSWORD');

  const adminClient = await signIn(adminEmail, adminPass);
  const hrClient = await signIn(hrEmail, hrPass);

  const csv = await readFile('tests/case7-test-questions.csv', 'utf-8');
  const rows = parseCsv(csv);

  const fileIdMap = await loadFileIdMap(adminClient, scope);
  console.log(`[${scope}] fileIdMap: ${fileIdMap.size / 2}文書`);
  // spec4 スコープ: チャンクを spec4 文書に絞る用のユニーク document_id セット
  const spec4DocIds = scope === 'spec4' ? [...new Set(fileIdMap.values())] : undefined;

  type Row = {
    no: number; question: string;
    searchPass: boolean; searchNote: string;
    citPass: boolean; citNote: string; grounding: string;
  };
  const results: Row[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (idx > 0) {
      console.log(`  [wait ${REQUEST_INTERVAL_MS / 1000}s]`);
      await sleep(REQUEST_INTERVAL_MS);
    }
    console.log(`\n[${scope}] No.${row.no}: ${row.question.slice(0, 40)}...`);

    const client = row.no === 12 ? hrClient : adminClient;

    // 期待文書 ID を解決
    const expectedKeys = row.expected
      .split(/[\s/,]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith('case7'));
    const expectedDocIds = expectedKeys
      .map((k) => fileIdMap.get(k))
      .filter((v): v is string => !!v);

    // 検索順位ベース（Embedding のみ・LLM なし）
    let searchPass = false;
    let searchNote = 'エラー';
    if (row.no >= 1 && row.no <= 9) {
      try {
        const r = await searchRankCheck(row.question, client, expectedDocIds, spec4DocIds);
        searchPass = r.pass;
        searchNote = r.note;
      } catch (err) {
        searchNote = `例外: ${String(err).slice(0, 60)}`;
      }
    } else {
      searchNote = '対象外（LLM判定）';
      searchPass = true; // No.10-12 は LLM 側で判定
    }

    // 出典ベース（LLM あり）
    // spec4 スコープかつ No.1-9 のみ filterDocIds を渡す（No.10-12 はハルシネーション・RLS テストのため絞り込まない）
    const citFilterDocIds = (row.no >= 1 && row.no <= 9) ? spec4DocIds : undefined;
    let citPass = false;
    let citNote = 'エラー';
    let grounding = '';
    try {
      const r = await citationCheck(row.question, client, row.no, expectedDocIds, citFilterDocIds);
      citPass = r.pass;
      citNote = r.note;
      grounding = r.grounding;
    } catch (err) {
      citNote = `例外: ${String(err).slice(0, 60)}`;
    }

    console.log(`  検索順位: ${searchPass ? 'PASS' : 'FAIL'} ${searchNote}`);
    console.log(`  出典ベース: ${citPass ? 'PASS' : 'FAIL'} ${citNote} grounding=${grounding}`);

    results.push({ no: row.no, question: row.question, searchPass, searchNote, citPass, citNote, grounding });
  }

  // ──── サマリ ────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${scope}] サマリ`);

  // No.1-9: Recall@5
  const ret = results.filter((r) => r.no >= 1 && r.no <= 9);
  const searchPassCount = ret.filter((r) => r.searchPass).length;
  const citPassCount = ret.filter((r) => r.citPass).length;
  const searchRecall = (searchPassCount / ret.length * 100).toFixed(1);
  const citRecall = (citPassCount / ret.length * 100).toFixed(1);

  console.log(`Recall@5 No.1-9:`);
  console.log(`  検索順位ベース（要件§22）: ${searchPassCount}/${ret.length} = ${searchRecall}% ${Number(searchRecall) >= 80 ? '✓ 達成' : '✗ 未達'}`);
  console.log(`  出典ベース（運用指標）:     ${citPassCount}/${ret.length} = ${citRecall}% ${Number(citRecall) >= 80 ? '✓ 達成' : '✗ 未達'}`);

  // No.10-11: ハルシネーション
  const hall = results.filter((r) => r.no === 10 || r.no === 11);
  const hallPass = hall.filter((r) => r.citPass).length;
  console.log(`ハルシネーション No.10-11: ${hallPass}/${hall.length}`);

  // No.12: RLS
  const rls = results.find((r) => r.no === 12);
  console.log(`RLS越境 No.12: ${rls?.citPass ? 'PASS' : 'FAIL'} ${rls?.citNote ?? 'N/A'}`);

  // 詳細行
  console.log(`\nNo. | 検索順位 | 出典ベース | 備考`);
  console.log(`----|----------|------------|----`);
  for (const r of results) {
    const s = r.no <= 9 ? (r.searchPass ? 'PASS' : 'FAIL') : '—   ';
    const c = r.citPass ? 'PASS' : 'FAIL';
    console.log(`${String(r.no).padStart(3)} | ${s.padEnd(8)} | ${c.padEnd(10)} | ${r.citNote}`);
  }
}

async function main() {
  const arg = process.argv[2] as Scope | undefined;
  if (arg && arg !== 'spec4' && arg !== 'all') {
    console.error('引数は spec4 または all を指定してください');
    process.exit(1);
  }

  const scopes: Scope[] = arg ? [arg] : ['spec4', 'all'];

  for (let i = 0; i < scopes.length; i++) {
    if (i > 0) {
      console.log('\n[スコープ間 20秒 待機（LLM RPM 保護）]');
      await sleep(20_000);
    }
    await runScope(scopes[i]);
  }

  console.log('\n[完了]');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
