/**
 * Slack 用の 429（レートリミット）向けメッセージ
 * 参照：requirements.md §15・§18、Web 側 rag/errors.ts の toUserMessage('rate_limit') と整合
 */

import { publicEnv } from '@/lib/env';

/**
 * 429（AI 利用制限）時の Slack メッセージ
 *
 * 非エンジニアでも直感的に理解できるよう、「何が起きたか」「なぜ起きたか」
 * 「どうすればよいか」の 3 点を平易な日本語で説明する（技術用語は使わない）。
 * 分あたり制限（数分で解除）と日あたり制限（当日は解除されない）の両方に配慮。
 */
export function formatRateLimit(): { text: string; blocks: unknown[] } {
  const url = publicEnv.webAppUrl();
  const text = `AI サービス側で一時的に利用制限がかかっています。数分後に再メンションしていただき、それでも改善しない場合は管理者にご連絡ください。Web 版：${url}`;
  return {
    text,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `AI サービス側で一時的に利用制限がかかっています。\n（短時間に多くの質問が届いた場合や、当日の利用量が上限に達した場合に発生します）\n\n*対応方法：*\n1. まず数分ほど時間をおいてから、再度メンションしてみてください\n2. それでも同じ状態が続く場合は、当日は利用が難しい可能性があります → 管理者にご連絡ください\n\n急ぎの場合は Web 版もご利用いただけます → <${url}|Web版>`,
        },
      },
    ],
  };
}
