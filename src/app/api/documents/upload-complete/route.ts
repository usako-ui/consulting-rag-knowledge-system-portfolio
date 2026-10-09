/**
 * POST /api/documents/upload-complete
 * Storage アップロード完了通知 → ingestion_log に pending 登録
 *
 * 参照：requirements.md §13・§14, architecture.md §3
 *
 * フロー：
 *   1. requireUser() で認証
 *   2. storagePath が department/ で始まるか確認（部署改ざん防止）
 *   3. Storage からファイル全体をダウンロード
 *   4. SHA-256 をサーバー側で計算 → クライアント値と照合
 *   5. マジックバイト検証（PDF: %PDF- / DOCX: PK\x03\x04）
 *   6. .docx の場合：ZIP 爆弾チェック（エントリー数・展開後サイズ）
 *   7. 検証 NG → Storage からファイル削除 → エラー応答
 *   8. 検証 OK → ingestion_log に pending で INSERT → { logId } を返す
 *
 * maxDuration = 60：最大 20 MB のファイルを Storage からダウンロード + SHA-256 計算のため。
 */

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/session';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';
import { sha256Hex } from '@/lib/ingest/hash';
import { checkZipBomb } from '@/lib/ingest/zip-check';

export const maxDuration = 60;

/**
 * GHA ingest.yml を workflow_dispatch で起動する（fire-and-forget）
 * upload-complete サーバー側から呼ぶことで role 不問で実行できる。
 * 失敗時は console.error + audit_log(dispatch_failed) に記録。認証情報は記録しない。
 */
async function dispatchIngest({
  supabase,
  logId,
  fileId,
  userId,
  userEmail,
}: {
  supabase: SupabaseClient;
  logId: string;
  fileId: string;
  userId: string;
  userEmail: string;
}): Promise<void> {
  let httpStatus: number | null = null;
  try {
    const token = serverEnv.githubDispatchToken();
    const repo = serverEnv.githubRepo();
    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/ingest.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );
    if (ghRes.ok) return; // 成功（204 No Content）
    httpStatus = ghRes.status;
    const body = await ghRes.text().catch(() => '');
    console.error('[upload-complete] dispatch 失敗:', ghRes.status, body.slice(0, 100));
  } catch (err) {
    console.error('[upload-complete] dispatch エラー:', err instanceof Error ? err.message : err);
  }

  // 失敗時のみ audit_log に記録（登録自体は成功のまま）
  try {
    await supabase.from('audit_log').insert({
      actor_id: userId,
      actor_email: userEmail,
      action_type: 'dispatch_failed',
      target_type: 'workflow_dispatch',
      target_id: logId,
      target_department: null,
      details: {
        workflow: 'ingest.yml',
        ...(httpStatus !== null ? { http_status: httpStatus } : { error: 'fetch_exception' }),
        log_id: logId,
        file_id: fileId,
      },
    });
  } catch (e: unknown) {
    console.error('[upload-complete] audit_log dispatch_failed 記録失敗:', e instanceof Error ? e.message : e);
  }
}

const DEPARTMENTS = ['strategy', 'business', 'it', 'hr', 'sales', 'management'] as const;

const bodySchema = z.object({
  storagePath: z.string().min(1).max(500),
  sha256hex: z.string().regex(/^[0-9a-f]{64}$/),
  fileSize: z.number().int().positive(),
  filename: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  department: z.enum(DEPARTMENTS),
  createdYear: z.number().int().min(1900).max(2100).nullable().optional(),
  clientName: z.string().max(100).nullable().optional(),
  // bucket フィールドはクライアントから受け取るが、サーバー環境変数を優先する
  bucket: z.string().min(1).max(100).optional(),
});

// PDF: %PDF-
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
// DOCX（ZIP）: PK\x03\x04
const DOCX_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function checkMagicBytes(bytes: Uint8Array, ext: string): boolean {
  if (ext === 'pdf') return PDF_MAGIC.every((b, i) => bytes[i] === b);
  return DOCX_MAGIC.every((b, i) => bytes[i] === b);
}

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
    const { storagePath, sha256hex, fileSize, filename, title, department, createdYear, clientName } = parsed.data;

    // バケット名はサーバー側環境変数から取得（クライアント指定を無視）
    const bucketName = serverEnv.storageBucket();

    // 部署チェック（改ざん防止）
    if (user.role !== 'admin' && department !== user.department) {
      return NextResponse.json(
        { ok: false, error: '他部署の資料をアップロードする権限がありません' },
        { status: 403 },
      );
    }

    // storagePath のパス形式チェック（ディレクトリトラバーサル防止）
    if (storagePath.includes('..') || storagePath.startsWith('/')) {
      return NextResponse.json({ ok: false, error: 'リクエストが不正です' }, { status: 400 });
    }

    // storagePath 先頭の部署チェック（他部署のファイルを自部署に混入させる攻撃の防止）
    if (!storagePath.startsWith(department + '/')) {
      return NextResponse.json({ ok: false, error: 'リクエストが不正です' }, { status: 400 });
    }

    const supabase = getServiceRoleClient();

    // Storage からファイル全体をダウンロード（SHA-256・マジックバイト・ZIP 検証に使用）
    const { data: signedUrlData, error: signedUrlErr } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 60);

    if (signedUrlErr || !signedUrlData) {
      return NextResponse.json(
        { ok: false, error: 'アップロードされたファイルを確認できませんでした。再度お試しください' },
        { status: 400 },
      );
    }

    const dlRes = await fetch(signedUrlData.signedUrl);
    if (!dlRes.ok) {
      return NextResponse.json(
        { ok: false, error: 'アップロードされたファイルを確認できませんでした。再度お試しください' },
        { status: 400 },
      );
    }

    const fileBytes = Buffer.from(await dlRes.arrayBuffer());

    // SHA-256 サーバー側検証（クライアントが偽のハッシュを送った場合に拒否）
    const serverHash = sha256Hex(fileBytes);
    if (serverHash !== sha256hex) {
      await supabase.storage.from(bucketName).remove([storagePath]);
      return NextResponse.json(
        { ok: false, error: 'ファイルの内容が一致しませんでした。再度アップロードしてください' },
        { status: 400 },
      );
    }

    // マジックバイト検証
    const ext = /\.pdf$/i.test(storagePath) ? 'pdf' : 'docx';
    if (!checkMagicBytes(fileBytes, ext)) {
      await supabase.storage.from(bucketName).remove([storagePath]);
      return NextResponse.json(
        {
          ok: false,
          error:
            'ファイルの内容が選択した形式と一致しませんでした。正しいファイルを選択してください',
        },
        { status: 400 },
      );
    }

    // .docx の ZIP 爆弾チェック（展開後サイズ・エントリー数）
    if (ext === 'docx') {
      const maxFileSizeMb = serverEnv.maxFileSizeMb();
      const zipResult = checkZipBomb(fileBytes, {
        maxEntries: 1000,
        maxUncompressedMb: maxFileSizeMb * 10,
      });
      if (!zipResult.ok) {
        await supabase.storage.from(bucketName).remove([storagePath]);
        return NextResponse.json({ ok: false, error: zipResult.error }, { status: 400 });
      }
    }

    // ingestion_log に pending で登録
    const fileId = filename.slice(0, 200);
    const { data: logRow, error: logErr } = await supabase
      .from('ingestion_log')
      .insert({
        file_id: fileId,
        status: 'pending',
        retry_count: 0,
        source: 'web',
        storage_path: storagePath,
        content_hash: sha256hex,
        file_size_bytes: fileSize,
        uploaded_by: user.id,
        department,
        title,
        created_year: createdYear ?? null,
        client_name: clientName?.trim() || null,
      })
      .select('id')
      .single();

    if (logErr || !logRow) {
      console.error('[upload-complete] ingestion_log insert 失敗:', logErr?.message);
      return NextResponse.json(
        { ok: false, error: '取り込み登録に失敗しました。しばらく待って再度お試しください' },
        { status: 500 },
      );
    }

    // 監査ログ
    await supabase.from('audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action_type: 'create',
      target_type: 'ingestion_log',
      target_id: logRow.id,
      target_department: department,
      details: {
        source: 'web_upload_storage',
        file_id: fileId,
        storage_path: storagePath,
        file_size_bytes: fileSize,
      },
    });

    // GHA を即時起動（fire-and-forget）
    // pending 新規登録成功時のみここに到達するため、重複・既存資料案内時は呼ばれない
    waitUntil(dispatchIngest({ supabase, logId: logRow.id, fileId, userId: user.id, userEmail: user.email }));

    return NextResponse.json({ ok: true, logId: logRow.id });
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
