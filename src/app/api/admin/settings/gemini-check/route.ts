/**
 * POST /api/admin/settings/gemini-check … Gemini 接続状態の確認
 *
 * 参照：tasks.md Day6 Phase 5.3・PM 修正指示 B
 *
 * ★ DB キャッシュ 5 分：クライアント連打・ページリロード・別タブでも同じ結果が返る
 * ★ api_usage_log 連動：ping で消費したトークンもゲージに反映される
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError, requireAdmin } from '@/lib/auth/session';
import { apiError, unauthorizedToResponse } from '@/lib/api/error-response';
import { performGeminiCheck } from '@/lib/admin/health-check';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await requireAdmin();
    const result = await performGeminiCheck();
    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    console.error('[admin/settings gemini-check] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}
