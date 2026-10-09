/**
 * POST /api/documents/upload-url
 * Storage 直接アップロード用署名 URL 発行
 *
 * 参照：requirements.md §2・§13, architecture.md §3（Storage 設計）
 *
 * フロー：
 *   1. requireUser() で認証
 *   2. filename・fileSize・sha256hex・title・department を検証
 *   3. documents.content_hash で重複チェック（重複なら URL 発行せず案内）
 *   4. UUID ベースのパスを生成し、署名付きアップロード URL（有効期限 600 秒）を発行
 *   5. { kind: 'new', signedUrl, storagePath, token, bucket } を返す
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/session';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { serverEnv } from '@/lib/env';
import type { Department } from '@/lib/auth/session';

const DEPARTMENTS = ['strategy', 'business', 'it', 'hr', 'sales', 'management'] as const;

const bodySchema = z.object({
  filename: z.string().min(1).max(200),
  fileSize: z.number().int().positive(),
  sha256hex: z.string().regex(/^[0-9a-f]{64}$/, 'SHA-256 形式が正しくありません'),
  title: z.string().min(1, 'タイトルを入力してください').max(200, 'タイトルは200文字以内で入力してください'),
  department: z.enum(DEPARTMENTS).optional(),
  createdYear: z.number().int().min(1900).max(2100).nullable().optional(),
  clientName: z.string().max(100).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const json = await request.json().catch(() => null);
    if (!json) {
      return NextResponse.json({ ok: false, error: 'リクエストが不正です' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' },
        { status: 400 },
      );
    }
    const { filename, fileSize, sha256hex, title, createdYear, clientName } = parsed.data;

    // 拡張子チェック
    if (!/\.(pdf|docx)$/i.test(filename)) {
      return NextResponse.json(
        { ok: false, error: 'PDF または Word（.docx）ファイルのみアップロードできます' },
        { status: 400 },
      );
    }

    // サイズチェック
    const maxSizeMb = serverEnv.maxFileSizeMb();
    if (fileSize > maxSizeMb * 1024 * 1024) {
      const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
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

    // 部署決定（管理者は指定可、一般ユーザーは自部署に強制）
    const targetDepartment: Department =
      user.role === 'admin' && parsed.data.department
        ? parsed.data.department
        : user.department;

    if (
      user.role !== 'admin' &&
      parsed.data.department &&
      parsed.data.department !== user.department
    ) {
      return NextResponse.json(
        { ok: false, error: '他部署の資料をアップロードする権限がありません' },
        { status: 403 },
      );
    }

    const supabase = getServiceRoleClient();

    // ① ingestion_log 内の active ハッシュ重複チェック（取り込み待ち・処理中の同一内容）
    const { data: activeByHash } = await supabase
      .from('ingestion_log')
      .select('id')
      .eq('content_hash', sha256hex)
      .in('status', ['pending', 'processing', 'retrying'])
      .maybeSingle();

    if (activeByHash) {
      return NextResponse.json({
        ok: true,
        kind: 'in_flight_hash',
        message: '同じ内容のファイルが、すでに取り込み待ちです。取り込みが終わるまでお待ちください。',
      });
    }

    // ② ingestion_log 内の pending ファイル名重複チェック（同名・別内容が待機中）
    const fileId = filename.slice(0, 200);
    const { data: pendingByFileId } = await supabase
      .from('ingestion_log')
      .select('id')
      .eq('file_id', fileId)
      .eq('status', 'pending')
      .maybeSingle();

    if (pendingByFileId) {
      return NextResponse.json({
        ok: true,
        kind: 'in_flight_filename',
        message:
          '同じファイル名の資料が取り込み待ちです。' +
          '古いファイルの取り込みが終わってから、再度アップロードしてください。',
      });
    }

    // ③ SHA-256 重複チェック（documents.content_hash と照合 — 取り込み済み）
    const { data: existing } = await supabase
      .from('documents')
      .select('id, is_active, title')
      .eq('content_hash', sha256hex)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ok: true,
        kind: 'duplicate',
        documentId: existing.id,
        isActive: existing.is_active as boolean,
      });
    }

    // Storage パス生成（UUID ベース、元ファイル名は DB に別途保存）
    const ext = /\.pdf$/i.test(filename) ? 'pdf' : 'docx';
    const uuid = crypto.randomUUID();
    const storagePath = `${targetDepartment}/${uuid}.${ext}`;

    // 署名付きアップロード URL 発行（有効期限 600 秒 = 10 分）
    const bucket = serverEnv.storageBucket();
    const { data: urlData, error: urlErr } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath);

    if (urlErr || !urlData) {
      console.error('[upload-url] 署名URL生成失敗:', urlErr?.message);
      return NextResponse.json(
        { ok: false, error: 'アップロードの準備に失敗しました。しばらく待って再度お試しください' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      kind: 'new',
      signedUrl: urlData.signedUrl,
      storagePath,
      token: urlData.token,
      bucket,
      // ブラウザが upload-complete に転送するメタデータ
      meta: {
        filename,
        fileSize,
        sha256hex,
        title,
        department: targetDepartment,
        createdYear: createdYear ?? null,
        clientName: clientName?.trim() || null,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      const status = err.reason === 'suspended' ? 403 : 401;
      const message =
        err.reason === 'suspended' ? 'このアカウントは現在利用できません' : 'ログインが必要です';
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    return NextResponse.json({ ok: false, error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
