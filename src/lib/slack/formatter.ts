/**
 * Slack 用の Block Kit フォーマッタ（回答 + 出典）
 *
 * 参照：requirements.md §9・§18, architecture.md §12B.3
 *   - 出典は最大 5 件（要件通り、AI が使った used_context_indexes のみ）
 *   - 元資料リンクは Web の資料確認ページ経由（Web 側でログイン + 権限チェック）
 *   - 絵文字は使わない（CLAUDE.md §6・requirements.md §11）
 */

import type { RagAnswer, RagSource } from '@/lib/rag/types';
import { publicEnv } from '@/lib/env';

const DEPT_LABEL: Record<string, string> = {
  strategy: '戦略',
  business: '業務',
  it: 'IT',
  hr: '人事',
  sales: '営業',
  management: '管理',
};

function documentLink(source: RagSource): string {
  const base = publicEnv.webAppUrl().replace(/\/$/, '');
  const params = new URLSearchParams();
  if (source.pageNumber !== null) params.set('page', String(source.pageNumber));
  const qs = params.toString();
  return `${base}/documents/${source.documentId}${qs ? `?${qs}` : ''}`;
}

function formatSourceLine(source: RagSource, index: number): string {
  const dept = DEPT_LABEL[source.department] ?? source.department;
  const page = source.pageNumber !== null ? ` p.${source.pageNumber}` : '';
  const section = source.sectionTitle ? ` / ${source.sectionTitle}` : '';
  return `${index + 1}. [${dept}] <${documentLink(source)}|${source.title}>${page}${section}`;
}

export interface FormatAnswerOptions {
  /**
   * true の場合、30 秒タイムアウト発火後に遅れて届いた「本回答」として
   * 「（お待たせしました）先程の質問への回答です。」の接頭文言を先頭に付与する。
   * 参照：architecture.md §12C.3・tasks.md Day6 Phase 7
   */
  isFollowup?: boolean;
}

/** RAG 回答を Slack Block Kit に整形 */
export function formatAnswerBlocks(
  answer: RagAnswer,
  options?: FormatAnswerOptions,
): { text: string; blocks: unknown[] } {
  const blocks: unknown[] = [];

  if (options?.isFollowup) {
    // タイムアウト後のフォローアップ：先頭に補助メッセージ
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '（お待たせしました）先程の質問への回答です。',
      },
    });
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*回答*\n${answer.answer}` },
  });

  if (answer.sources.length > 0) {
    blocks.push({ type: 'divider' });
    const list = answer.sources.map(formatSourceLine).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*出典（${answer.sources.length}件）*\n${list}` },
    });
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '出典リンクを開くには Web 版へのログインが必要です（部署権限は再検証されます）',
        },
      ],
    });
  }

  // Slack fallback text（通知等で使われる非 blocks 環境向け）
  const prefix = options?.isFollowup ? '（お待たせしました）先程の質問への回答です。\n\n' : '';
  const text =
    answer.sources.length > 0
      ? `${prefix}${answer.answer}\n\n出典: ${answer.sources.length}件`
      : `${prefix}${answer.answer}`;

  return { text, blocks };
}

/** 30 秒タイムアウト時の誘導メッセージ */
export function formatWebFallback(): { text: string; blocks: unknown[] } {
  const url = publicEnv.webAppUrl();
  const text = `Slack 上での応答に時間がかかっています。Web 版から続きを確認できます → ${url}`;
  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `応答に時間がかかっています。処理は続行中です。\n先に Web 版で検索する場合はこちら → <${url}|Web版を開く>`,
      },
    },
  ];
  return { text, blocks };
}

/** 未登録ユーザーへの案内 */
export function formatNotRegistered(): { text: string; blocks: unknown[] } {
  const url = publicEnv.webAppUrl();
  const text = `このアカウントは社内システムに未登録です。管理者にご連絡ください（Web版：${url}）。`;
  return {
    text,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `お使いの Slack アカウントは社内ナレッジ検索システムに未登録です。\n管理者に登録依頼をお願いします（Web 版：<${url}|管理者ログイン>）。`,
        },
      },
    ],
  };
}

/** 一般的なエラー通知（非エンジニアでも理解できる平易な文言・技術用語は使わない） */
export function formatError(): { text: string; blocks: unknown[] } {
  const url = publicEnv.webAppUrl();
  const text = `システム側で一時的な問題が発生しました。少し時間をおいて再度お試しください。Web 版：${url}`;
  return {
    text,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `システム側で一時的な問題が発生し、お応えできませんでした。\n（ネットワークまたは AI サービスの一時的な不調の可能性があります）\n少し時間をおいて再度メンションしていただくか、Web 版をご利用ください → <${url}|Web版>\n解決しない場合は、管理者にご連絡ください。`,
        },
      },
    ],
  };
}
