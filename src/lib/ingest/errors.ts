/**
 * 取り込みパイプライン用の内部エラー分類
 *
 * 参照：requirements.md §15（エラー処理）, CLAUDE.md §6
 *
 * 方針：
 *  - error_code は英語（ingestion_log.error_code に記録・DB分析用）
 *  - error_message はユーザー本文・APIキー・トークン等の機密情報を絶対に含めない
 *  - スタックトレース・秘匿情報はマスキングしてから記録
 */

import type { IngestErrorCode } from './types';

export class IngestError extends Error {
  constructor(
    public readonly code: IngestErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

/** 例外を IngestError に正規化する。既知の秘匿情報パターンをマスキング */
export function toIngestError(err: unknown, defaultCode: IngestErrorCode = 'unknown'): IngestError {
  if (err instanceof IngestError) return err;

  const raw = err instanceof Error ? err.message : String(err);
  const masked = maskSecrets(raw);

  // 既知パターンからのコード推定
  let code: IngestErrorCode = defaultCode;
  let retryable = false;

  if (/rate|quota|limit|429|503/i.test(masked)) {
    code = 'rate_limit';
    retryable = true;
  } else if (/embedding|embed/i.test(masked)) {
    code = 'embedding_failed';
    retryable = true;
  } else if (/pdf|parse/i.test(masked)) {
    code = 'pdf_parse_failed';
    retryable = false;
  } else if (/word|docx|mammoth/i.test(masked)) {
    code = 'word_parse_failed';
    retryable = false;
  } else if (/ENOENT|not found|no such file/i.test(masked)) {
    code = 'file_not_found';
    retryable = false;
  } else if (/insert|violates|constraint|column|relation/i.test(masked)) {
    code = 'db_insert_failed';
    retryable = false; // スキーマ由来はリトライしても直らない
  } else if (/network|timeout|fetch|econn/i.test(masked)) {
    retryable = true;
  }

  return new IngestError(code, masked, retryable);
}

/**
 * ログ・DB書き込み前に秘匿情報をマスキング。
 * Gemini APIキー（AIza...）、SupabaseキーJWT形式、Bearer token 等を除去。
 */
export function maskSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[REDACTED_JWT]')
    .replace(/sb_(publishable|secret)_[A-Za-z0-9_-]{20,}/g, '[REDACTED_SUPABASE_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/gi, 'Bearer [REDACTED]')
    .replace(/xoxb-[0-9A-Za-z-]{20,}/g, '[REDACTED_SLACK_TOKEN]');
}

/**
 * ユーザー向け日本語メッセージ（UI 表示用）。技術コードは含めない（要件 §15）
 *
 * 非エンジニアの一般ユーザー・管理者が読んで直感的に理解できるよう、
 * 「何が起きたか」「なぜ起きたか」「どうすればよいか」を平易な日本語で示す。
 */
export function toUserMessage(code: IngestErrorCode): string {
  switch (code) {
    case 'pdf_parse_failed':
      return 'PDF のテキストを読み取れませんでした。ファイルが壊れているか、文字が画像になっている PDF（スキャンしたもの等）の可能性があります。同じファイルを再度アップロードしても同じ結果になります。文字が選択できる PDF に差し替えるか、管理者にご相談ください。';
    case 'word_parse_failed':
      return 'Word ファイルのテキストを読み取れませんでした。ファイルが壊れているか、パスワード保護されている可能性があります。同じファイルを再度アップロードしても同じ結果になります。ファイルを確認するか、管理者にご相談ください。';
    case 'zip_bomb_detected':
      return 'ファイルの内容が大きすぎるため、取り込めません。同じファイルを再度アップロードしても同じ結果になります。ファイルを分割・圧縮して再度アップロードするか、管理者にご相談ください。';
    case 'metadata_extraction_failed':
      return 'ファイル名から部署情報を判定できませんでした。ファイル名の形式（例：case7-doc1-strategy-xxx.pdf）を確認してください。';
    case 'embedding_failed':
      return 'AI が資料を読み取る処理に一時的な不調が発生しました（AI サービス側の問題の可能性があります）。しばらくしてから再度取り込んでください。';
    case 'rate_limit':
      return 'AI サービス側の当日の利用回数上限に達しました（プロバイダ側の一時的な制限です）。時間をおいて再度取り込むか、翌日以降に再試行してください。';
    case 'db_insert_failed':
      return 'データベースへの登録に失敗しました（一時的なシステム側の問題の可能性があります）。時間をおいて再度お試しいただき、それでも解決しない場合は管理者に連絡してください。';
    case 'file_not_found':
      return 'ファイルが見つかりませんでした。ファイルの配置を確認してください。';
    case 'unsupported_format':
      return 'このファイル形式には対応していません。現在は PDF（および Word）形式のみアップロードできます。';
    case 'unknown':
    default:
      return '資料の取り込み中に予期しないエラーが発生しました。もう一度お試しいただき、それでも解決しない場合は管理者にご連絡ください。';
  }
}
