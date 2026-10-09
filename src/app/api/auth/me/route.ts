/**
 * GET /api/auth/me
 * 現在のセッションユーザーの部署・ロール等を返す（フロント側の初期表示・ガード用）
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError, requireUser } from '@/lib/auth/session';

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        department: user.department,
        role: user.role,
        passwordChangeRequired: !user.passwordChanged,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      const status = err.reason === 'suspended' ? 403 : 401;
      const message =
        err.reason === 'suspended'
          ? 'このアカウントは現在利用できません'
          : 'ログインが必要です';
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    return NextResponse.json({ ok: false, error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
