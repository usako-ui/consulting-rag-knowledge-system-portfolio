/**
 * POST /api/slack/events
 * Slack Events API 受信エンドポイント
 *
 * 参照：requirements.md §4・§18, agent-brief.md §3.6, architecture.md §12C
 *
 * 責務：
 *   1. 生ボディを取得（署名検証には JSON.parse 前の生文字列が必要）
 *   2. Signing Secret による HMAC-SHA256 署名検証 → 失敗なら 401
 *   3. url_verification（初回登録） → challenge をそのまま返す
 *   4. Slack の再送（X-Slack-Retry-Num ヘッダあり）は 200 で受けて処理しない（多重回答防止）
 *   5. app_mention / message.im のみ処理対象。それ以外は 200 で無視
 *   6. 即時 200 ACK を返し、handleSlackEvent() は fire-and-forget で継続
 *      （Hobby＋Fluid compute（既定で有効）は既定・上限とも 300 秒。§9・T-29 で確認）
 */

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifySlackSignature } from '@/lib/slack/verify';
import { handleSlackEvent } from '@/lib/slack/handler';
import type { SlackEventEnvelope } from '@/lib/slack/types';

// Node.js ランタイムを明示（node:crypto を使用）
export const runtime = 'nodejs';
// 動的レンダリング（キャッシュしない）
export const dynamic = 'force-dynamic';
// Vercel Hobby: デフォルト 300s・上限 300s。60s は余裕を持った保守的な値（T-29 で実測後見直し可）
export const maxDuration = 60;

export async function POST(request: Request) {
  const rawBody = await request.text();

  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');
  const retryNum = request.headers.get('x-slack-retry-num');

  const verify = verifySlackSignature({ timestamp, signature, rawBody });
  if (!verify.ok) {
    // ログに reason だけ残す（署名本体・timestamp・body は残さない）
    console.warn(`[SLACK_EVENTS] signature rejected: ${verify.reason}`);
    return new NextResponse('invalid signature', { status: 401 });
  }

  let envelope: SlackEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEventEnvelope;
  } catch {
    return new NextResponse('invalid json', { status: 400 });
  }

  // URL 検証（初回イベント購読登録時）
  //   Slack 仕様上 challenge は英数字のランダム文字列。任意文字列を無検証で
  //   反射させないよう、形式を厳格に検査してから返す（QA MUST-1・防御的入力検証）。
  if (envelope.type === 'url_verification' && typeof envelope.challenge === 'string') {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(envelope.challenge)) {
      console.warn('[SLACK_EVENTS] url_verification challenge の形式が不正');
      return new NextResponse('invalid challenge', { status: 400 });
    }
    return NextResponse.json({ challenge: envelope.challenge });
  }

  // 再送は多重回答を避けるため無視（200 で受け取っておく）
  if (retryNum) {
    return NextResponse.json({ ok: true, ignored: 'retry' });
  }

  if (envelope.type !== 'event_callback' || !envelope.event) {
    return NextResponse.json({ ok: true });
  }

  const inner = envelope.event;

  // Bot 自身の発言は無視（無限ループ防止）
  if (inner.bot_id) {
    return NextResponse.json({ ok: true, ignored: 'bot_message' });
  }

  // 処理対象は app_mention（チャンネル）と message.im（DM）のみ
  const isMention = inner.type === 'app_mention';
  const isDm = inner.type === 'message' && (inner as { channel_type?: string }).channel_type === 'im';
  if (!isMention && !isDm) {
    return NextResponse.json({ ok: true, ignored: 'unsupported_event_type' });
  }

  // ★ 即時 ACK し、以降は waitUntil で継続処理（@vercel/functions）
  //   Slack Events API は 3 秒以内 ACK 必須。waitUntil に渡すことで
  //   レスポンス返却後もランタイムが継続し、完了まで実行が保証される。
  //   handler 側で例外を握り潰し済みなので unhandledRejection は発生しない。
  waitUntil(
    handleSlackEvent({ event: inner, eventId: envelope.event_id }).catch((err) => {
      console.error('[SLACK_EVENTS] waitUntil failed:', (err as Error).message);
    }),
  );

  return NextResponse.json({ ok: true });
}
