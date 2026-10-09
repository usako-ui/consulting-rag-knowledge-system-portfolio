/**
 * POST /api/auth/change-password
 * 初回パスワード変更 or 任意パスワード変更
 * 参照：requirements.md §3
 *
 * 実行後、user_profiles.password_changed = true にする（初回変更フローの完了マーク）
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { UnauthorizedError, requireUser } from '@/lib/auth/session';

const changePasswordSchema = z.object({
  newPassword: z.string().min(10, 'パスワードは10文字以上で入力してください'),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
    if (error) {
      return NextResponse.json(
        { ok: false, error: 'パスワードの変更に失敗しました。しばらくしてから再度お試しください' },
        { status: 400 },
      );
    }

    // 初回変更フラグを true に
    const service = createSupabaseServiceRoleClient();
    await service
      .from('user_profiles')
      .update({ password_changed: true })
      .eq('id', user.id);

    await service.from('audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action_type: 'password_change',
      target_type: 'user',
      target_id: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: 'ログインが必要です' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
