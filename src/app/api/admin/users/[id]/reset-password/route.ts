/**
 * POST /api/admin/users/[id]/reset-password … 一時パスワード再発行
 *
 * 参照：tasks.md Day6 Phase 4.2・PM 追加安全策・PM 追加事項 3（Cache-Control: no-store）
 *        requirements.md §3
 *
 * ★ 平文 PW は 1 度だけ JSON レスポンスに含める。Cache-Control: no-store を必ず付ける。
 * ★ 監査ログには平文 PW を含めない（lib/admin/users.ts で徹底）。
 * ★ best-effort でパスワード変更後に全セッションを signOut('global') させる（lib 側）。
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError, requireAdmin } from '@/lib/auth/session';
import { apiError, unauthorizedToResponse } from '@/lib/api/error-response';
import { UserOperationError, resetPassword } from '@/lib/admin/users';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapErrorToResponse(err: UserOperationError): NextResponse {
  switch (err.code) {
    case 'validation':
      return apiError('validation', err.userMessage);
    case 'conflict':
      return apiError('conflict', err.userMessage);
    case 'forbidden':
      return apiError('forbidden', err.userMessage);
    case 'not_found':
      return apiError('not_found', err.userMessage);
    case 'password_generation':
    case 'internal':
    default:
      return apiError('internal', err.userMessage);
  }
}

export async function POST(_request: Request, { params }: Params) {
  try {
    if (!UUID_RE.test(params.id)) {
      return apiError('validation', 'ユーザー ID の形式が正しくありません');
    }
    const actor = await requireAdmin();

    const result = await resetPassword({ actor, targetId: params.id });

    const res = NextResponse.json({
      ok: true,
      temporaryPassword: result.temporaryPassword,
      passwordChanged: result.passwordChanged,
      targetEmail: result.targetEmail,
    });
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    if (err instanceof UserOperationError) return mapErrorToResponse(err);
    console.error('[admin/users reset-password] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}
