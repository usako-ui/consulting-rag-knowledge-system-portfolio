/**
 * Slack 署名検証のユニット検証スクリプト
 *
 * 参照：requirements.md §4・§18, tasks.md Day4 完了条件
 * 目的：SLACK_SIGNING_SECRET を用いて生成した正しい署名／不正署名／期限切れ TS を
 *      それぞれ渡し、期待される verdict が返ることを確認する。
 *
 * 実行：npm run test-slack-verify
 */

import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { verifySlackSignature } from '@/lib/slack/verify';

interface Case {
  name: string;
  input: {
    timestamp: string | null;
    signature: string | null;
    rawBody: string;
    nowSeconds?: number;
  };
  expect: { ok: boolean; reason?: string };
}

function sign(secret: string, ts: string, body: string): string {
  return `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
}

async function main() {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    console.error('SLACK_SIGNING_SECRET が未設定です（.env を確認）');
    process.exit(1);
  }

  const now = 1_700_000_000;
  const validTs = String(now - 10);
  const staleTs = String(now - 60 * 10); // 10 分前 → NG
  const body = JSON.stringify({ type: 'url_verification', challenge: 'x' });

  const cases: Case[] = [
    {
      name: '正しい署名 → ok',
      input: {
        timestamp: validTs,
        signature: sign(secret, validTs, body),
        rawBody: body,
        nowSeconds: now,
      },
      expect: { ok: true },
    },
    {
      name: '署名不一致 → invalid_signature',
      input: {
        timestamp: validTs,
        signature: `v0=${'0'.repeat(64)}`,
        rawBody: body,
        nowSeconds: now,
      },
      expect: { ok: false, reason: 'invalid_signature' },
    },
    {
      name: 'ヘッダ欠落 → missing_headers',
      input: {
        timestamp: null,
        signature: null,
        rawBody: body,
        nowSeconds: now,
      },
      expect: { ok: false, reason: 'missing_headers' },
    },
    {
      name: '10 分前 TS → stale_timestamp',
      input: {
        timestamp: staleTs,
        signature: sign(secret, staleTs, body),
        rawBody: body,
        nowSeconds: now,
      },
      expect: { ok: false, reason: 'stale_timestamp' },
    },
    {
      name: 'body 改ざん → invalid_signature',
      input: {
        timestamp: validTs,
        signature: sign(secret, validTs, body),
        rawBody: body + '_tampered',
        nowSeconds: now,
      },
      expect: { ok: false, reason: 'invalid_signature' },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    const got = verifySlackSignature(c.input);
    const okMatch = got.ok === c.expect.ok;
    const reasonMatch =
      c.expect.ok || (!got.ok && got.reason === c.expect.reason);

    if (okMatch && reasonMatch) {
      console.log(`  PASS  ${c.name}`);
      passed++;
    } else {
      console.log(`  FAIL  ${c.name}`);
      console.log(`        expected=${JSON.stringify(c.expect)} got=${JSON.stringify(got)}`);
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
