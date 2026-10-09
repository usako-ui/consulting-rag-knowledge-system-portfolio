/**
 * POST /api/admin/ingestion/[id]/retry … 取り込み失敗の再取り込み予約
 *
 * 参照：tasks.md Day6 Phase 5.2・PM 修正指示 A
 *       requirements.md §13・§14・§15
 *
 * ★ Vercel Hobby 10 秒制限：Route Handler では status 更新のみを行い、
 *   実処理は GHA runner に任せる（Embedding 生成を直接呼ばない）。
 * ★ 対象状態は failed のみ・retrying/processing/success/pending は 409 で拒否。
 * ★ 楽観ロック：status='failed' の WHERE 句で UPDATE し、0 件なら 409。
 * ★ 監査ログ：recordAdminActionStrict・失敗時は compensating で status を元に戻す。
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError, requireAdmin } from '@/lib/auth/session';
import { apiError, unauthorizedToResponse } from '@/lib/api/error-response';
import { IngestionOperationError, retryIngestion } from '@/lib/admin/ingestion';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapErrorToResponse(err: IngestionOperationError): NextResponse {
  switch (err.code) {
    case 'validation':
      return apiError('validation', err.userMessage);
    case 'conflict':
      return apiError('conflict', err.userMessage);
    case 'not_found':
      return apiError('not_found', err.userMessage);
    case 'internal':
    default:
      return apiError('internal', err.userMessage);
  }
}

export async function POST(_request: Request, { params }: Params) {
  try {
    if (!UUID_RE.test(params.id)) {
      return apiError('validation', '取り込みログ ID の形式が正しくありません');
    }
    const actor = await requireAdmin();
    const result = await retryIngestion({ actor, targetId: params.id });
    return NextResponse.json({
      ok: true,
      id: result.id,
      newStatus: result.newStatus,
      retryCount: result.retryCount,
      previousRetryCount: result.previousRetryCount,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    if (err instanceof IngestionOperationError) return mapErrorToResponse(err);
    console.error('[admin/ingestion retry] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}
