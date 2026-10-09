/**
 * RAG 用のエラー分類
 *
 * 参照：requirements.md §15（エラー処理・技術コード非表示）
 */

export type RagErrorCode = 'auth' | 'db' | 'llm' | 'rate_limit' | 'validation' | 'unknown';

export class RagError extends Error {
  constructor(
    public readonly code: RagErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RagError';
  }
}

/**
 * 例外を RagError に変換する。既知の 429/quota パターンを rate_limit として分類。
 * 参照：requirements.md §15（技術コードを表に出さない・分かりやすい文言）
 */
export function toRagError(err: unknown, defaultCode: RagErrorCode = 'unknown'): RagError {
  if (err instanceof RagError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  // Gemini API・Slack いずれも 429/quota/rate/limit の文字列を返すため広めに検知
  if (/429|rate.?limit|quota|too many requests/i.test(msg)) {
    return new RagError('rate_limit', msg);
  }
  return new RagError(defaultCode, msg);
}

/**
 * ユーザー向け日本語メッセージ（要件 §15）
 *
 * 非エンジニアの一般ユーザー・管理者が読んで直感的に理解できるよう、
 * 「何が起きたか」「なぜ起きたか（一時的か・恒久的か）」「どうすればよいか」の
 * 3 点を必ず含めること。技術用語（レートリミット・タイムアウト・エラーコード・429 等）は
 * 表面に出さず、平易な日本語で説明する。
 */
export function toUserMessage(code: RagErrorCode): string {
  switch (code) {
    case 'auth':
      return 'ログインが必要です。もう一度ログイン画面からサインインしてください。';
    case 'db':
      return 'データの検索に一時的に失敗しました（システム側で処理が一時的にできなかった可能性があります）。1〜2 分ほど時間をおいてから、もう一度検索してください。';
    case 'rate_limit':
      // 「レートリミット」「429」等の技術用語は使わず、「何が」「なぜ」「どうする」を平易に説明
      // 分あたり制限（数分待てば解除）と日あたり制限（当日は改善しない）の両方に配慮
      return 'AI サービス側で一時的に利用制限がかかっています（短時間に多くの質問が届いた場合や、当日の利用量が上限に達した場合に発生します）。まず数分ほど時間をおいて、もう一度検索してみてください。時間をおいても改善しない場合は当日は利用が難しい可能性があるため、管理者へご連絡ください。';
    case 'llm':
      return 'AI 側の処理に一時的な不調が発生しました（AI サービス側の問題の可能性があります）。しばらく時間をおいてから、もう一度検索してください。それでも改善しない場合は、管理者にご連絡ください。';
    case 'validation':
      return '入力内容に問題があります。質問文や選択項目を確認して、もう一度お試しください。';
    case 'unknown':
    default:
      return '予期しないエラーが発生しました。もう一度お試しいただき、それでも解決しない場合は管理者にご連絡ください。';
  }
}
