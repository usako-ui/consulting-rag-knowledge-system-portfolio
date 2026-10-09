/**
 * POST /api/auth/login
 * ログインAPI（メール＋パスワード）
 * 参照：requirements.md §3
 *
 * レスポンスは初回パスワード変更が必要かどうかを含む（passwordChanged=false なら誘導）
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'メールアドレスとパスワードを正しく入力してください' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    // 技術的なエラーコードはユーザーに見せない（要件 §15）
    return NextResponse.json(
      { ok: false, error: 'メールアドレスまたはパスワードが正しくありません' },
      { status: 401 },
    );
  }

  // プロフィール取得（初回パスワード変更判定・アカウント状態確認）
  const service = createSupabaseServiceRoleClient();
  const { data: profile } = await service
    .from('user_profiles')
    .select('account_status, password_changed, role, department')
    .eq('id', data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { ok: false, error: 'アカウント情報が見つかりません。管理者にお問い合わせください' },
      { status: 403 },
    );
  }

  if (profile.account_status !== 'active') {
    await supabase.auth.signOut();
    return NextResponse.json(
      { ok: false, error: 'このアカウントは現在利用できません。管理者にお問い合わせください' },
      { status: 403 },
    );
  }

  // 監査ログ記録
  await service.from('audit_log').insert({
    actor_id: data.user.id,
    actor_email: parsed.data.email,
    action_type: 'login',
    target_type: 'session',
  });

  return NextResponse.json({
    ok: true,
    passwordChangeRequired: !profile.password_changed,
    role: profile.role,
    department: profile.department,
  });
}
