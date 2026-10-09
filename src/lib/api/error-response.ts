/**
 * Route Handler 用の共通エラーレスポンスヘルパー
 * 参照：requirements.md §4・§15, Phase 1 PM Item 1（API は 401/403 JSON 返却）
 *
 * middleware で /admin/* を保護済みだが、Route Handler 内でも requireAdmin() を呼び、
 * その throw を本ヘルパーで JSON 変換する運用（多層防御）。
 *
 * すべてのメッセージは非エンジニアでも理解できる平易な日本語（architecture.md §5.7.1 準拠）。
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError } from '@/lib/auth/session';

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'suspended'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'internal';

interface ApiErrorSpec {
  status: number;
  code: ApiErrorCode;
  message: string;
}

function spec(kind: ApiErrorCode, override?: string): ApiErrorSpec {
  switch (kind) {
    case 'unauthenticated':
      return { status: 401, code: kind, message: override ?? 'ログインが必要です' };
    case 'forbidden':
      return {
        status: 403,
        code: kind,
        message: override ?? 'この操作を行う権限がありません',
      };
    case 'suspended':
      return {
        status: 403,
        code: kind,
        message: override ?? 'このアカウントは現在利用できません。管理者にご連絡ください',
      };
    case 'not_found':
      return { status: 404, code: kind, message: override ?? '対象が見つかりませんでした' };
    case 'validation':
      return { status: 400, code: kind, message: override ?? '入力内容を確認してください' };
    case 'conflict':
      return {
        status: 409,
        code: kind,
        message: override ?? '現在の状態では操作できません。画面を再読み込みしてから再度お試しください',
      };
    case 'internal':
    default:
      return {
        status: 500,
        code: 'internal',
        message: override ?? '処理中にエラーが発生しました。時間をおいて再度お試しください',
      };
  }
}

/** 統一形式：`{ ok: false, error: string }` + HTTP ステータスコード */
export function apiError(kind: ApiErrorCode, override?: string): NextResponse {
  const s = spec(kind, override);
  return NextResponse.json({ ok: false, error: s.message }, { status: s.status });
}

/**
 * `UnauthorizedError` を捕まえて適切な JSON レスポンスに変換する。
 *   - `no_session` → 401 unauthenticated
 *   - `suspended`  → 403 suspended
 *   - `forbidden`  → 403 forbidden
 * Route Handler の try/catch の catch 節で `if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);`
 */
export function unauthorizedToResponse(err: UnauthorizedError): NextResponse {
  switch (err.reason) {
    case 'suspended':
      return apiError('suspended');
    case 'forbidden':
      return apiError('forbidden', 'この操作には管理者権限が必要です');
    case 'no_session':
    default:
      return apiError('unauthenticated');
  }
}
