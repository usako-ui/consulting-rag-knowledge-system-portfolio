/**
 * DELETE /api/admin/documents/[id]   ... 論理削除（is_active=false）
 * PATCH  /api/admin/documents/[id]   ... is_active トグル（body.isActive）
 *
 * 参照：requirements.md §3・§4・§5（削除は管理者のみ・is_active 切替）
 *        tasks.md Day6 Phase 4.1
 *
 * ★ middleware で /api/admin/* を保護済み。ここでは Route Handler 側の二重防御として
 *   requireAdmin() を必ず呼ぶ（多層防御・Phase 1 PM Item 1 の運用ルール）。
 * ★ 削除／状態変更ともに recordAdminActionStrict で監査ログを記録。
 *   監査失敗時は業務操作を成功扱いにしない（PM Item 4）。
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UnauthorizedError, requireAdmin } from '@/lib/auth/session';
import { apiError, unauthorizedToResponse } from '@/lib/api/error-response';
import { recordAdminActionStrict } from '@/lib/audit/record';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { Department } from '@/lib/auth/session';

interface Params {
  params: { id: string };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchDocumentSnapshot(id: string) {
  const service = getServiceRoleClient();
  const { data, error } = await service
    .from('documents')
    .select('id, title, department, is_active, file_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    if (!UUID_RE.test(params.id)) {
      return apiError('validation', '資料 ID の形式が正しくありません');
    }
    const admin = await requireAdmin();

    const target = await fetchDocumentSnapshot(params.id);
    if (!target) {
      return apiError('not_found', '対象の資料が見つかりませんでした');
    }

    const wasActive = target.is_active === true;

    // 論理削除：is_active=false を強制セット
    const service = getServiceRoleClient();
    const { error: updateErr } = await service
      .from('documents')
      .update({ is_active: false, updated_by: admin.id })
      .eq('id', params.id);
    if (updateErr) {
      console.error('[admin/documents] delete update failed:', updateErr.message);
      return apiError('internal', '資料の削除に失敗しました。時間をおいて再度お試しください');
    }

    try {
      await recordAdminActionStrict({
        actor: admin,
        action: 'delete',
        targetType: 'document',
        targetId: target.id,
        targetDepartment: target.department as Department,
        details: {
          title: target.title,
          file_id: target.file_id,
          method: 'logical_delete',
          // 削除と一時無効化で details のキー名を揃える（PM Phase 4.1 追加確認 Item 1）
          before_active: wasActive,
          after_active: false,
        },
      });
    } catch (auditErr) {
      // 監査失敗時：is_active を復旧してから 500
      await service
        .from('documents')
        .update({ is_active: wasActive })
        .eq('id', params.id);
      console.error(
        '[admin/documents] audit failed after delete, reverted:',
        (auditErr as Error).message,
      );
      return apiError(
        'internal',
        '削除の記録に失敗したため、削除を取り消しました。時間をおいて再度お試しください',
      );
    }

    return NextResponse.json({ ok: true, kind: 'deleted', documentId: target.id });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    console.error('[admin/documents DELETE] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}

const patchSchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    if (!UUID_RE.test(params.id)) {
      return apiError('validation', '資料 ID の形式が正しくありません');
    }
    const admin = await requireAdmin();

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('validation', '入力内容を確認してください');
    }

    const target = await fetchDocumentSnapshot(params.id);
    if (!target) {
      return apiError('not_found', '対象の資料が見つかりませんでした');
    }

    if (target.is_active === parsed.data.isActive) {
      return apiError(
        'conflict',
        '対象の資料は既にその状態になっています。画面を再読み込みして最新の状態をご確認ください',
      );
    }

    const service = getServiceRoleClient();
    const { error: updateErr } = await service
      .from('documents')
      .update({ is_active: parsed.data.isActive, updated_by: admin.id })
      .eq('id', params.id);
    if (updateErr) {
      console.error('[admin/documents] patch update failed:', updateErr.message);
      return apiError('internal', '資料の状態変更に失敗しました');
    }

    try {
      await recordAdminActionStrict({
        actor: admin,
        action: 'update',
        targetType: 'document',
        targetId: target.id,
        targetDepartment: target.department as Department,
        details: {
          title: target.title,
          file_id: target.file_id,
          field: 'is_active',
          method: parsed.data.isActive ? 're_enable' : 'temporary_disable',
          // 削除と一時無効化で details のキー名を揃える（PM Phase 4.1 追加確認 Item 1）
          before_active: target.is_active,
          after_active: parsed.data.isActive,
        },
      });
    } catch (auditErr) {
      // compensating：is_active を戻す
      await service
        .from('documents')
        .update({ is_active: target.is_active })
        .eq('id', params.id);
      console.error(
        '[admin/documents] audit failed after patch, reverted:',
        (auditErr as Error).message,
      );
      return apiError(
        'internal',
        '状態変更の記録に失敗したため、変更を取り消しました。時間をおいて再度お試しください',
      );
    }

    return NextResponse.json({
      ok: true,
      kind: 'updated',
      documentId: target.id,
      isActive: parsed.data.isActive,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    console.error('[admin/documents PATCH] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}
