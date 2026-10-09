/**
 * T-14 Slack 署名検証（HMAC-SHA256）
 *
 * 参照：requirements.md §4・§18, CLAUDE.md §6
 *   - Signing Secret による HMAC-SHA256 で署名を検証
 *   - タイムスタンプが 5 分以上ズレている場合は拒否（リプレイ攻撃対策）
 *   - 比較は timingSafeEqual で行う（timing attack 対策）
 *   - 検証失敗時は Route Handler で 401 を返し、以降の処理を行わない（なりすまし拒否）
 *
 * ★ Slack Signing Secret 仕様：
 *   base = `v0:{X-Slack-Request-Timestamp}:{raw body}`
 *   signature = `v0=` + hex(HMAC-SHA256(base, signing_secret))
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/** 許容するタイムスタンプ差（秒）。5 分（Slack 公式推奨）。 */
const MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5;

export type SignatureVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_headers' | 'stale_timestamp' | 'invalid_signature' };

export interface SlackSignatureInput {
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  /** 現在時刻（秒）。テスト時に注入可能。default は Date.now()/1000 */
  nowSeconds?: number;
}

/**
 * Slack 署名を検証する。
 * ★ rawBody は JSON.parse 前の生文字列を渡すこと（parse すると署名が合わなくなる）。
 */
export function verifySlackSignature(input: SlackSignatureInput): SignatureVerifyResult {
  const { timestamp, signature, rawBody } = input;

  if (!timestamp || !signature) {
    return { ok: false, reason: 'missing_headers' };
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const secret = serverEnv.slackSigningSecret();
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;

  // 長さが違うと timingSafeEqual が例外を投げる → 事前チェック
  if (expected.length !== signature.length) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');

  return timingSafeEqual(expectedBuf, actualBuf) ? { ok: true } : { ok: false, reason: 'invalid_signature' };
}
