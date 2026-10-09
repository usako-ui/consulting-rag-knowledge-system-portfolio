/**
 * POST /api/admin/users … 新規ユーザー作成
 *
 * 参照：tasks.md Day6 Phase 4.2・PM 追加安全策・PM 追加事項 3（Cache-Control: no-store）
 *        requirements.md §3・§4・§16
 *
 * ★ 一覧取得は `/admin/users` の Server Component が `listUsers()` を直接呼ぶ設計。
 *   GET エンドポイントは公開しない（不要な露出面を減らす方針・Phase 1 二重防御運用）。
 *
 * ★ DELETE は作らない（PM 指示・2026-10-01）。`account_status='pending_deletion'` への
 *   遷移は PATCH で行い、UI 上は「削除予定にする」と表記する。
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError, requireAdmin } from '@/lib/auth/session';
import { apiError, unauthorizedToResponse } from '@/lib/api/error-response';
import { UserOperationError, createUser } from '@/lib/admin/users';

export const dynamic = 'force-dynamic';

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

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return apiError('validation', '入力内容を確認してください');
    }
    const { email, department, role } = body as Record<string, unknown>;

    const result = await createUser({
      actor: { id: actor.id, email: actor.email },
      email: (email ?? '') as string,
      department: department as never,
      role: role as never,
    });

    // ★ 一時パスワードを含むレスポンス：キャッシュ・ログ保存を全面禁止
    const res = NextResponse.json(
      {
        ok: true,
        user: result.user,
        // 平文 PW はここで 1 度だけ返す
        temporaryPassword: result.temporaryPassword,
      },
      { status: 201 },
    );
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    if (err instanceof UserOperationError) return mapErrorToResponse(err);
    console.error('[admin/users POST] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}
