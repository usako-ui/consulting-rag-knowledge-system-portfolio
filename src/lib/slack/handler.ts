/**
 * Slack イベントの非同期処理本体
 *
 * 参照：requirements.md §18, agent-brief.md §3.6
 *
 * フロー：
 *   1. Route Handler で即時ACK済み。ここは fire-and-forget で呼ばれる
 *   2. Slack ユーザーを user_profiles に紐付け（メール一致）
 *   3. 未登録 / 停止中 → 案内メッセージを DM/スレッドに送信して終了
 *   4. RAG を実行しつつ、30 秒経過で「Web 版はこちら」を先行送信
 *   5. RAG 完了後、Block Kit で回答＋出典を送信
 *   6. audit_log に検索実行を記録（details.source='slack'／Web 側は details.source フィールドなし）
 *
 * ★ Slack Events API は 3 秒以内 ACK 必須 → 本関数を await せず呼ぶこと
 * ★ どのブランチでも例外は握り潰し（Slack へエラーメッセージ送信）、
 *   Route Handler に伝播させない（ACK 済みのため何もできない）
 */

import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { serverEnv } from '@/lib/env';
import type { SlackAppMentionEvent, SlackMessageEvent } from './types';
import {
  formatAnswerBlocks,
  formatError,
  formatNotRegistered,
  formatWebFallback,
} from './formatter';
import { formatRateLimit } from './formatter-rate-limit';
import { postMessage } from './client';
import { resolveSlackUser } from './user-resolver';
import { runRagForSlackUser } from './rag-runner';
import { RagError } from '@/lib/rag/errors';
import { recordSearchFailure } from '@/lib/admin/search-failure-log';

/** Web 誘導タイムアウト（ms）。環境変数 SLACK_FALLBACK_MS で調整可。デフォルト 30 秒（要件 §18） */
const WEB_FALLBACK_MS = serverEnv.slackFallbackMs();

/** 監査ログ用：質問文の保存長（Web と同じ 50 文字上限・architecture.md §12B.4） */
const AUDIT_QUESTION_MAX_CHARS = 50;

/**
 * event_id 冪等化のルックバック時間（QA SHOULD-1・T-D4Q-1）
 *   audit_log から直近 X 分の event_id 重複を検知して二重回答を防ぐ。
 *   Slack のリトライは高々数秒間隔・数分程度で終わるため 10 分に設定。
 */
const EVENT_ID_LOOKBACK_MINUTES = 10;

/**
 * app_mention の text から Bot メンション文字列を除去して素の質問だけ取り出す。
 *   例："<@U01ABC> RAG って何？" → "RAG って何？"
 */
function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

export interface HandleEventInput {
  event: SlackAppMentionEvent | SlackMessageEvent;
  /** 冪等化・監査用の event_id（Slack Envelope から渡す） */
  eventId?: string;
}

export async function handleSlackEvent(input: HandleEventInput): Promise<void> {
  const { event, eventId } = input;

  // 質問文の抽出（app_mention はメンション除去、DM はそのまま）
  const rawText = typeof event.text === 'string' ? event.text : '';
  const question = event.type === 'app_mention' ? stripMention(rawText) : rawText.trim();

  // 空メッセージや subtype 付きメッセージ（bot_message / channel_join 等）は無視
  if (!question || event.subtype) return;
  if (!event.user) return; // ユーザー ID がない Bot イベントは無視

  // ---- event_id 冪等化（QA SHOULD-1・T-D4Q-1） ----
  // Route Handler の X-Slack-Retry-Num で殆どは弾けるが、Slack 側が異なる経路で
  // 同一 event_id を再送する可能性・アプリ再起動によるリトライ扱い等の
  // エッジケースを最終防衛する。
  if (eventId && (await isDuplicateEventId(eventId))) {
    console.warn('[SLACK_HANDLER] duplicate event_id detected, skipping');
    return;
  }

  const channel = event.channel;
  // スレッド返信推奨（元発言に対する thread を維持）
  const threadTs = event.thread_ts ?? event.ts;

  // ---- ユーザー解決 ----
  let resolveResult;
  try {
    resolveResult = await resolveSlackUser(event.user);
  } catch (err) {
    console.error('[SLACK_HANDLER] resolveSlackUser failed:', (err as Error).message);
    await safePost(channel, threadTs, formatError());
    return;
  }

  if (!resolveResult.ok) {
    // deleted_slack_user / is_bot は無応答で即時終了（削除済み or Bot への応答は不要）
    if (resolveResult.reason === 'deleted_slack_user' || resolveResult.reason === 'is_bot') {
      console.warn(`[SLACK_HANDLER] skipped: ${resolveResult.reason}`);
      return;
    }
    if (resolveResult.reason === 'not_registered' || resolveResult.reason === 'no_email') {
      await safePost(channel, threadTs, formatNotRegistered());
    } else {
      // suspended
      await safePost(channel, threadTs, {
        text: 'アカウントが現在利用停止中です。管理者にご連絡ください。',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'アカウントが現在利用停止中です。管理者にご連絡ください。',
            },
          },
        ],
      });
    }
    return;
  }

  const authUser = resolveResult.user;

  // ---- 30秒タイムアウトの Web 誘導 ----
  let webFallbackSent = false;
  const fallbackTimer = setTimeout(() => {
    webFallbackSent = true;
    safePost(channel, threadTs, formatWebFallback()).catch(() => {
      /* 既にログ出力済み */
    });
  }, WEB_FALLBACK_MS);

  // ---- RAG 実行 ----
  try {
    const result = await runRagForSlackUser(question, authUser);
    clearTimeout(fallbackTimer);

    // タイムアウト発火後に遅れて届いた本回答は、先頭にフォロー文言を付ける
    // （architecture.md §12C.3・Day6 Phase 7 で仕様確定・2026-10-01）
    const payload = formatAnswerBlocks(result, { isFollowup: webFallbackSent });
    await safePost(channel, threadTs, payload);

    // 監査ログ（source='slack'・質問は 50 文字 truncate・event_id を含める）
    await recordAudit(authUser, question, result, 'slack', eventId);
    // API 使用量ログ
    await recordUsage(result);
  } catch (err) {
    clearTimeout(fallbackTimer);
    const errMsg = (err as Error).message ?? '';
    const ragCode = err instanceof RagError ? err.code : 'unknown';
    const isRateLimit =
      ragCode === 'rate_limit' || /429|rate.?limit|quota|too many requests/i.test(errMsg);

    // G-7: 検索失敗を記録（fire-and-forget・失敗しても応答を返す）
    void recordSearchFailure({
      actorId: authUser.id,
      actorEmail: authUser.email,
      errorCode: isRateLimit ? 'rate_limit' : ragCode,
      source: 'slack',
      eventId,
    });

    if (isRateLimit) {
      console.warn('[SLACK_HANDLER] rate_limit detected, using rate-limit message');
      await safePost(channel, threadTs, formatRateLimit());
    } else {
      console.error('[SLACK_HANDLER] RAG failed:', errMsg);
      await safePost(channel, threadTs, formatError());
    }
  }
}

async function safePost(
  channel: string,
  threadTs: string,
  payload: { text: string; blocks: unknown[] },
): Promise<void> {
  try {
    await postMessage({
      channel,
      threadTs,
      text: payload.text,
      blocks: payload.blocks,
    });
  } catch (err) {
    // Slack 側の送信失敗はもう何もできないためログのみ
    console.error('[SLACK_HANDLER] postMessage failed:', (err as Error).message);
  }
}

async function recordAudit(
  user: { id: string; email: string },
  question: string,
  result: Awaited<ReturnType<typeof runRagForSlackUser>>,
  source: 'slack' | 'web',
  eventId?: string,
): Promise<void> {
  try {
    const service = getServiceRoleClient();
    const details: Record<string, unknown> = {
      question: question.slice(0, AUDIT_QUESTION_MAX_CHARS),
      grounding: result.grounding,
      source_count: result.sources.length,
      chunks_searched: result.meta.chunksSearched,
      embedding_tokens: result.meta.embeddingTokens,
      chat_tokens: result.meta.chatTokens,
      source,
    };
    if (eventId) details.event_id = eventId;
    await service.from('audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action_type: 'search',
      target_type: 'search_query',
      target_department: null,
      details,
    });
  } catch (err) {
    console.error('[SLACK_HANDLER] audit_log insert failed:', (err as Error).message);
  }
}

/**
 * 直近の audit_log に同一 event_id の記録があれば重複と判定（T-D4Q-1）。
 *
 * ★ 非アトミック（SELECT→INSERT の間で競合しうる）だが、Slack のリトライは
 *   秒〜分単位で到着するため単一 Vercel ランナーでは実用上十分。
 *   厳格に一意性を保証したくなったら slack_processed_events テーブルの
 *   ユニーク制約に置き換える（Day7 セキュリティレビューで再検討）。
 */
async function isDuplicateEventId(eventId: string): Promise<boolean> {
  try {
    const service = getServiceRoleClient();
    const sinceIso = new Date(Date.now() - EVENT_ID_LOOKBACK_MINUTES * 60_000).toISOString();
    const { data, error } = await service
      .from('audit_log')
      .select('id')
      .eq('action_type', 'search')
      .contains('details', { event_id: eventId })
      .gte('created_at', sinceIso)
      .limit(1);
    if (error) {
      // 参照失敗時は「重複と判断してスキップする」より「今回処理する」を優先する
      // （安全側：応答が0件になるより二重回答した方が業務影響は小さい）
      console.warn('[SLACK_HANDLER] duplicate check failed, proceeding:', error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.warn(
      '[SLACK_HANDLER] duplicate check threw, proceeding:',
      (err as Error).message,
    );
    return false;
  }
}

async function recordUsage(
  result: Awaited<ReturnType<typeof runRagForSlackUser>>,
): Promise<void> {
  try {
    const service = getServiceRoleClient();
    const rows: Array<{
      provider: string;
      api_type: string;
      request_count: number;
      token_count: number;
    }> = [
      {
        provider: result.meta.provider,
        api_type: 'embedding',
        request_count: 1,
        token_count: result.meta.embeddingTokens,
      },
    ];
    if (result.meta.chatTokens > 0) {
      rows.push({
        provider: result.meta.provider,
        api_type: 'llm',
        request_count: 1,
        token_count: result.meta.chatTokens,
      });
    }
    await service.from('api_usage_log').insert(rows);
  } catch (err) {
    console.error('[SLACK_HANDLER] api_usage_log insert failed:', (err as Error).message);
  }
}
