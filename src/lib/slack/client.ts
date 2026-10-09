/**
 * Slack Web API の薄いラッパー
 *
 * 使う API は 2 つだけ（依存最小化のため SDK は入れない）：
 *   - chat.postMessage：回答・出典・誘導メッセージの送信
 *   - users.info：Slack ユーザーの email を取得（user_profiles との紐付け）
 *
 * ★ ログには Bot Token / email など機密情報を出力しない
 *   （CLAUDE.md §6・requirements.md §4「ログに APIキー・アクセストークンを保存しない」）
 */

import { serverEnv } from '@/lib/env';

const SLACK_API_BASE = 'https://slack.com/api';

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

async function callSlackApi<T extends SlackApiResponse>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${serverEnv.slackBotToken()}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as T;
  if (!data.ok) {
    // error 内容は method 名のみログに残す（token 等は含めない）
    throw new Error(`Slack API ${method} failed: ${data.error ?? 'unknown_error'}`);
  }
  return data;
}

export interface PostMessageInput {
  channel: string;
  text: string;
  /** 返信対象のスレッド ts。省略時はチャンネル直下に投稿 */
  threadTs?: string;
  /** Block Kit blocks。指定時は text はフォールバック用 */
  blocks?: unknown[];
}

/** チャンネル or DM に投稿する */
export async function postMessage(input: PostMessageInput): Promise<void> {
  const body: Record<string, unknown> = {
    channel: input.channel,
    text: input.text,
  };
  if (input.threadTs) body.thread_ts = input.threadTs;
  if (input.blocks) body.blocks = input.blocks;

  await callSlackApi('chat.postMessage', body);
}

interface UsersInfoResponse extends SlackApiResponse {
  user?: {
    id: string;
    profile?: { email?: string; real_name?: string };
    is_bot?: boolean;
    deleted?: boolean;
  };
}

export interface SlackUserSummary {
  email: string | null;
  deleted: boolean;
  isBot: boolean;
}

/**
 * Slack ユーザー情報を取得（email・deleted・is_bot をまとめて返す）
 *
 * QA SHOULD-2（T-D4Q-2）：deleted=true / is_bot=true のユーザーは
 * 呼び出し側で拒否する必要があるため、フラグを合わせて返す。
 * ★ email 本文はログに出さない（マスキング）
 *
 * ★ Slack API の仕様上、`users.info` は POST + application/json body では
 *   `user_not_found` を返す（chat.postMessage と挙動が異なる）ため、
 *   **GET + query string** で叩く必要がある。Day5 で修正（元は callSlackApi 経由で
 *   JSON body を送っていたが、それだと handler 経由の DM/mention が常に失敗していた）。
 */
export async function fetchSlackUserSummary(userId: string): Promise<SlackUserSummary> {
  const url = new URL(`${SLACK_API_BASE}/users.info`);
  url.searchParams.set('user', userId);
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${serverEnv.slackBotToken()}`,
    },
  });
  const data = (await res.json()) as UsersInfoResponse;
  if (!data.ok) {
    throw new Error(`Slack API users.info failed: ${data.error ?? 'unknown_error'}`);
  }
  const emailRaw = data.user?.profile?.email;
  return {
    email: typeof emailRaw === 'string' && emailRaw.length > 0 ? emailRaw : null,
    deleted: data.user?.deleted === true,
    isBot: data.user?.is_bot === true,
  };
}

/** 互換用：既存呼び出しがある場合は email のみ返す */
export async function fetchSlackUserEmail(userId: string): Promise<string | null> {
  return (await fetchSlackUserSummary(userId)).email;
}
