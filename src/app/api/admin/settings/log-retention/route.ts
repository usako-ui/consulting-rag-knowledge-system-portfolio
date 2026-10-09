/**
 * POST /api/admin/settings/log-retention … ログ保存期間の変更
 * GET  /api/admin/settings/log-retention/preview?days=N … 削除対象件数のプレビュー
 *
 * 参照：tasks.md Day6 Phase 6・PM 修正指示 D
 *       requirements.md §16
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UnauthorizedError, requireAdmin } from '@/lib/auth/session';
import { apiError, unauthorizedToResponse } from '@/lib/api/error-response';
import {
  InvalidRetentionError,
  LOG_RETENTION_DAYS_CHOICES,
  countLogsToDelete,
  updateLogRetentionDays,
} from '@/lib/admin/log-retention';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  newValueDays: z.number().int(),
});

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        'validation',
        '保存期間は 30 日・90 日・1 年（365 日）から選択してください',
      );
    }
    if (
      !LOG_RETENTION_DAYS_CHOICES.includes(
        parsed.data.newValueDays as (typeof LOG_RETENTION_DAYS_CHOICES)[number],
      )
    ) {
      return apiError(
        'validation',
        '保存期間は 30 日・90 日・1 年（365 日）から選択してください',
      );
    }

    try {
      await updateLogRetentionDays({
        actor: { id: actor.id, email: actor.email },
        newValueDays: parsed.data.newValueDays as (typeof LOG_RETENTION_DAYS_CHOICES)[number],
      });
    } catch (err) {
      if (err instanceof InvalidRetentionError) {
        return apiError('validation', err.message);
      }
      throw err;
    }

    return NextResponse.json({ ok: true, newRetentionDays: parsed.data.newValueDays });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    console.error('[admin/settings log-retention] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const daysStr = url.searchParams.get('days');
    const days = daysStr ? Number(daysStr) : NaN;
    if (
      !Number.isFinite(days) ||
      !LOG_RETENTION_DAYS_CHOICES.includes(days as (typeof LOG_RETENTION_DAYS_CHOICES)[number])
    ) {
      return apiError('validation', '保存期間の指定が正しくありません');
    }
    const toDelete = await countLogsToDelete(days);
    return NextResponse.json({ ok: true, days, toDelete });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    console.error('[admin/settings log-retention GET] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}
