/**
 * recordAdminAction の sanitize が入れ子にも効くことを確認する自動テスト
 *
 * 使い方：npm run test-audit-sanitize
 *
 * PM 追加確認 Item 7（Phase 1 完了報告への追記）
 */

import { sanitizeDeep } from '@/lib/audit/sanitize';

interface Case {
  name: string;
  input: unknown;
  expect: unknown;
}

const CASES: Case[] = [
  {
    name: 'トップレベル password → REDACTED',
    input: { password: 'plaintext-abc', ok: 'visible' },
    expect: { password: '[REDACTED]', ok: 'visible' },
  },
  {
    name: 'ネスト内 password → REDACTED',
    input: {
      target: { userId: 'u1', password: 'nested-plain' },
      note: 'ok',
    },
    expect: {
      target: { userId: 'u1', password: '[REDACTED]' },
      note: 'ok',
    },
  },
  {
    name: '配列内オブジェクトの api_key → REDACTED',
    input: {
      items: [
        { name: 'a', api_key: 'secret1' },
        { name: 'b', api_key: 'secret2' },
      ],
    },
    expect: {
      items: [
        { name: 'a', api_key: '[REDACTED]' },
        { name: 'b', api_key: '[REDACTED]' },
      ],
    },
  },
  {
    name: '大文字混じり NewPassword → REDACTED（大文字小文字非依存）',
    input: { NewPassword: 'plain-NEW' },
    expect: { NewPassword: '[REDACTED]' },
  },
  {
    name: 'authorization ヘッダ風文字列 → REDACTED',
    input: { authorization: 'Bearer xoxb-abc' },
    expect: { authorization: '[REDACTED]' },
  },
  {
    name: '複数階層 signing_secret → REDACTED',
    input: {
      slack: {
        config: {
          signing_secret: 'super-secret-32-chars',
          bot_id: 'B123',
        },
      },
    },
    expect: {
      slack: {
        config: {
          signing_secret: '[REDACTED]',
          bot_id: 'B123',
        },
      },
    },
  },
  {
    name: '禁止キーがない場合はそのまま',
    input: { question: '経営戦略', grounding: 'sufficient', source_count: 3 },
    expect: { question: '経営戦略', grounding: 'sufficient', source_count: 3 },
  },
  {
    name: '禁止キーの値が null でも REDACTED（不用意な平文入り込みを防ぐ）',
    input: { password: null },
    expect: { password: '[REDACTED]' },
  },
];

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  let passed = 0;
  let failed = 0;
  for (const c of CASES) {
    const got = sanitizeDeep(c.input);
    if (deepEqual(got, c.expect)) {
      console.log(`  PASS  ${c.name}`);
      passed++;
    } else {
      console.log(`  FAIL  ${c.name}`);
      console.log(`        expected: ${JSON.stringify(c.expect)}`);
      console.log(`        got     : ${JSON.stringify(got)}`);
      failed++;
    }
  }
  console.log(`\n---\nresult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
