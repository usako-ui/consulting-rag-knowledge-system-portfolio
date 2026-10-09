/**
 * Next.js middleware
 * - Supabase セッションクッキーのリフレッシュ
 * - /admin/* および /api/admin/* を管理者以外からブロック（サーバー側二重防御の入口）
 *
 * 参照：@supabase/ssr 標準パターン, requirements.md §4（サーバー側認可）
 *
 * ★ middleware は最初の壁。実 Route Handler でも requireAdmin() を必ず呼ぶこと（多層防御）
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const ADMIN_PATH_RE = /^\/(admin|api\/admin)(\/|$)/;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const { data: authData } = await supabase.auth.getUser();

  // /admin/* および /api/admin/* の一括保護
  if (ADMIN_PATH_RE.test(request.nextUrl.pathname)) {
    if (!authData?.user) {
      // API はステータスコード返却・ページは /login へリダイレクト
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { ok: false, error: 'ログインが必要です' },
          { status: 401 },
        );
      }
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // 管理者判定は user_profiles.role を service_role 側で確認せず、
    // ここでは anon で user_profiles を SELECT（RLS：本人 or 管理者のみ SELECT 可）
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, account_status')
      .eq('id', authData.user.id)
      .maybeSingle();

    const isActiveAdmin =
      profile?.role === 'admin' && profile.account_status === 'active';
    if (!isActiveAdmin) {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { ok: false, error: 'この操作には管理者権限が必要です' },
          { status: 403 },
        );
      }
      const homeUrl = new URL('/', request.url);
      return NextResponse.redirect(homeUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Slack webhook・静的ファイルは除外
    '/((?!api/slack|_next/static|_next/image|favicon.ico).*)',
  ],
};
