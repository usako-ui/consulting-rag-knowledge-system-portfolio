/**
 * POST /api/admin/settings/api-budget … 月間 API 予算（tokens）の変更
 *
 * 参照：tasks.md Day6 Phase 5.3・PM 修正指示 C
 *       architecture.md §7（月間予算の運用）
 *
 * ★ 既存の `src/lib/admin/settings.ts::updateMonthlyApiBudget` を呼ぶ
 *   内部で before/after スナップショット + recordAdminActionStrict + compensating transaction
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UnauthorizedError, requireAdmin } from '@/lib/auth/session';
import { apiError, unauthorizedToResponse } from '@/lib/api/error-response';
import { InvalidBudgetError, updateMonthlyApiBudget } from '@/lib/admin/settings';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  newValueTokens: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError('validation', '月間予算は 1 以上の整数で指定してください');
    }

    try {
      await updateMonthlyApiBudget({
        actor: { id: actor.id, email: actor.email },
        newValueTokens: parsed.data.newValueTokens,
      });
    } catch (err) {
      if (err instanceof InvalidBudgetError) {
        return apiError('validation', err.message);
      }
      throw err;
    }

    return NextResponse.json({ ok: true, newBudget: parsed.data.newValueTokens });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    console.error('[admin/settings api-budget] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}
