/**
 * Slack Events API の最小型定義（本案件で使用する範囲のみ）
 *
 * 参照：requirements.md §18, agent-brief.md §3.6
 *   - Bot が扱うのは app_mention（チャンネル）と message.im（DM）の 2 種類のみ
 *   - URL 検証（初回登録時の challenge）にも対応
 */

export type SlackEventCallbackType = 'event_callback' | 'url_verification';

/** Slack Events API のトップレベル JSON ペイロード */
export interface SlackEventEnvelope {
  type: SlackEventCallbackType;
  /** url_verification 時のみ含まれる */
  challenge?: string;
  /** event_callback 時のみ含まれる */
  event?: SlackInnerEvent;
  /** 冪等化キー */
  event_id?: string;
  team_id?: string;
  api_app_id?: string;
}

/** Bot が処理するイベント */
export type SlackInnerEvent = SlackAppMentionEvent | SlackMessageEvent;

export interface SlackAppMentionEvent {
  type: 'app_mention';
  user: string;
  text: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  event_ts?: string;
  bot_id?: string;
  subtype?: string;
}

export interface SlackMessageEvent {
  type: 'message';
  user?: string;
  text?: string;
  channel: string;
  channel_type?: 'im' | 'channel' | 'group' | 'mpim';
  ts: string;
  thread_ts?: string;
  event_ts?: string;
  bot_id?: string;
  subtype?: string;
}
