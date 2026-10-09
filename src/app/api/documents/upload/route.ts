/**
 * POST /api/documents/upload
 * ブラウザからのファイルアップロード（PDF・Word）
 *
 * 参照：requirements.md §5・§13, agent-brief.md §3.1（二重防御）
 *
 * フロー：
 *   1. requireUser() で認証
 *   2. multipart form-data から file・title・createdYear・clientName を取り出す
 *   3. 部署は user.department で強制（管理者は body の department を許容）
 *   4. サイズ・拡張子検証 → ingestOne() を呼び、成功可否を返す
 *   5. ingestion_log に success/failed を記録
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/session';
import { ingestOne } from '@/lib/ingest/pipeline';
import { IngestError, toUserMessage } from '@/lib/ingest/errors';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { serverEnv } from '@/lib/env';
import type { Department } from '@/lib/auth/session';

const DEPARTMENTS = ['strategy', 'business', 'it', 'hr', 'sales', 'management'] as const;

export const maxDuration = 60;

const metaSchema = z.object({
  title: z.string().min(1, 'タイトルを入力してください').max(200, 'タイトルは200文字以内で入力してください'),
  department: z.enum(DEPARTMENTS).optional(),
  createdYear: z
    .string()
    .transform((v) => (v.length === 0 ? null : Number.parseInt(v, 10)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 1900 && v <= 2100), '作成年は西暦4桁で入力してください')
    .nullable()
    .optional(),
  clientName: z.string().max(100).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { ok: false, error: 'ファイルが送信されていません' },
        { status: 400 },
      );
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'ファイルが選択されていません' },
        { status: 400 },
      );
    }

    if (!/\.(pdf|docx)$/i.test(file.name)) {
      return NextResponse.json(
        { ok: false, error: 'PDF または Word（.docx）形式のみアップロードできます' },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'ファイルの内容が空です（0バイト）。保存やエクスポートに失敗してファイルが作られなかった可能性があります。元のアプリで内容を確認し、正しく保存したファイルを再度アップロードしてください。',
        },
        { status: 400 },
      );
    }
    const maxSizeMb = serverEnv.maxFileSizeMb();
    if (file.size > maxSizeMb * 1024 * 1024) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      return NextResponse.json(
        {
          ok: false,
          error:
            `ファイルが大きすぎます（選択: ${sizeMB} MB / 上限: ${maxSizeMb} MB）。` +
            `このシステムは ${maxSizeMb} MB を超えるファイルを受け付けられません。` +
            `ファイルを分割・圧縮するか、管理者にご相談ください。`,
        },
        { status: 400 },
      );
    }

    const meta = metaSchema.safeParse({
      title: (form.get('title') as string) ?? '',
      department: (form.get('department') as string) ?? undefined,
      createdYear: (form.get('createdYear') as string) ?? '',
      clientName: (form.get('clientName') as string) ?? null,
    });
    if (!meta.success) {
      return NextResponse.json(
        { ok: false, error: meta.error.issues[0]?.message ?? '入力内容を確認してください' },
        { status: 400 },
      );
    }

    // 部署は一般ユーザーの場合は自部署に強制、管理者は指定可
    const targetDepartment: Department =
      user.role === 'admin' && meta.data.department ? meta.data.department : user.department;
    if (user.role !== 'admin' && meta.data.department && meta.data.department !== user.department) {
      return NextResponse.json(
        { ok: false, error: '他部署の資料をアップロードする権限がありません' },
        { status: 403 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const fileId = sanitizeFileId(file.name);

    const service = getServiceRoleClient();

    // 事前 ingestion_log（processing 状態）
    const { data: logRow } = await service
      .from('ingestion_log')
      .insert({
        file_id: fileId,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    try {
      const result = await ingestOne(
        {
          fileId,
          bytes,
          metadata: {
            department: targetDepartment,
            title: meta.data.title.trim(),
            fileId,
            createdYear: meta.data.createdYear ?? null,
            clientName: meta.data.clientName?.trim() || null,
            pageCount: null,
          },
        },
        { client: service },
      );

      if (logRow?.id) {
        await service
          .from('ingestion_log')
          .update({
            status: 'success',
            document_id: result.documentId,
            completed_at: new Date().toISOString(),
          })
          .eq('id', logRow.id);
      }

      // skipped_duplicate の場合、既存資料が論理削除済み（is_active=false）かどうかを判定
      // 判定結果をレスポンスに含め、UI 側で非エンジニア向けの案内文言を出し分ける
      // （PM Phase 4.1 追加確認 Item 2）
      let targetIsActive: boolean | null = null;
      if (result.kind === 'skipped_duplicate') {
        const { data: existing } = await service
          .from('documents')
          .select('is_active')
          .eq('id', result.documentId)
          .maybeSingle();
        targetIsActive = existing?.is_active ?? null;
      }

      await service.from('audit_log').insert({
        actor_id: user.id,
        actor_email: user.email,
        action_type: result.kind === 'skipped_duplicate' ? 'update' : 'create',
        target_type: 'document',
        target_id: result.documentId,
        target_department: targetDepartment,
        details: {
          source: 'web_upload',
          kind: result.kind,
          file_id: fileId,
          ...(result.kind === 'skipped_duplicate' ? { target_is_active: targetIsActive } : {}),
        },
      });

      return NextResponse.json({
        ok: true,
        kind: result.kind,
        documentId: result.documentId,
        // skipped の場合のみ target の is_active も返す（UI で「削除済み」と判別可能に）
        ...(result.kind === 'skipped_duplicate' ? { targetIsActive } : {}),
        // アップロード実行者のロール（一般 or 管理者）を UI 側で表示分岐に使う
        actorRole: user.role,
      });
    } catch (err) {
      const ingestErr = err instanceof IngestError ? err : null;
      if (logRow?.id) {
        await service
          .from('ingestion_log')
          .update({
            status: 'failed',
            error_code: ingestErr?.code ?? 'unknown',
            error_message: ingestErr?.message ?? 'unknown_error',
            completed_at: new Date().toISOString(),
          })
          .eq('id', logRow.id);
      }
      return NextResponse.json(
        { ok: false, error: toUserMessage(ingestErr?.code ?? 'unknown') },
        { status: 500 },
      );
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      const status = err.reason === 'suspended' ? 403 : 401;
      const message =
        err.reason === 'suspended' ? 'このアカウントは現在利用できません' : 'ログインが必要です';
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    return NextResponse.json(
      { ok: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

function sanitizeFileId(rawName: string): string {
  const base = rawName.replace(/\\/g, '/').split('/').pop() ?? rawName;
  return base.slice(0, 200);
}
