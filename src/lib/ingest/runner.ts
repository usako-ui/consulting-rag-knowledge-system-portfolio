/**
 * T-08 + T-09 キュー消費ループ＋自動リトライ
 *
 * 参照：requirements.md §14・§15, agent-brief.md §3.7
 *
 * 流れ：
 *   1. pickupNext() で1件取得（processingに遷移）
 *   2. testdocs/{file_id} からファイル読込＋メタデータ抽出
 *   3. ingestOne() 実行
 *   4. 成功 → markSuccess()
 *   5. 失敗 → markFailure()：retryable かつ retry_count<=3 なら 'retrying' に戻る
 *      → 次のループで再度 pickup 対象になる
 *   6. 3回失敗確定時 notifyAdmin() で管理者通知
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { IngestError, maskSecrets, toIngestError } from './errors';
import { extractMetadata } from './metadata';
import { notifyAdmin } from './notifier';
import { ingestOne } from './pipeline';
import { MAX_RETRY, markFailure, markSuccess, pickupNext, summarize } from './queue';
import type { Department } from './types';

export interface RunQueueOptions {
  testdocsDir: string;
  client?: SupabaseClient;
  /** 上限件数（無限ループ防止）。デフォルト 100 */
  maxProcess?: number;
}

export interface RunQueueResult {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  finalSummary: Record<string, number>;
}

export async function runQueue(options: RunQueueOptions): Promise<RunQueueResult> {
  const supabase = options.client ?? getServiceRoleClient();
  const maxProcess = options.maxProcess ?? 100;

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let retried = 0;

  while (processed < maxProcess) {
    const row = await pickupNext(supabase);
    if (!row) break;
    processed++;

    try {
      let bytes: Buffer;
      let meta: { department: Department; title: string; createdYear: number | null; clientName: string | null };
      let storagePath: string | null = null;

      if (row.source === 'web' && row.storage_path) {
        // web アップロード経路: Storage からダウンロード
        const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'rag-documents';
        const { data: fileData, error: dlErr } = await supabase.storage
          .from(bucket)
          .download(row.storage_path);
        if (dlErr || !fileData) {
          throw toIngestError(
            dlErr ?? new Error('Storage download returned no data'),
            'file_not_found',
          );
        }
        bytes = Buffer.from(await fileData.arrayBuffer());
        storagePath = row.storage_path;
        meta = {
          department: (row.department ?? 'management') as Department,
          title: row.title ?? row.file_id,
          createdYear: row.created_year ?? null,
          clientName: row.client_name ?? null,
        };
      } else {
        // testdocs 経路: ローカルファイル読み込み
        const filePath = join(options.testdocsDir, row.file_id);
        bytes = await readFile(filePath).catch((err) => {
          throw toIngestError(err, 'file_not_found');
        });
        meta = await extractMetadata(filePath, options.testdocsDir);
      }

      const result = await ingestOne(
        {
          fileId: row.file_id,
          bytes,
          storagePath,
          metadata: {
            department: meta.department,
            title: meta.title,
            fileId: row.file_id,
            createdYear: meta.createdYear,
            clientName: meta.clientName,
            pageCount: null,
          },
        },
        { client: supabase },
      );

      await markSuccess(row.id, result.documentId, supabase);
      succeeded++;
      const summary =
        result.kind === 'created'
          ? `新規登録 (chunks=${result.chunkCount})`
          : result.kind === 'updated'
            ? `更新（旧版無効化）(chunks=${result.chunkCount})`
            : '既存と同一（スキップ）';
      console.log(`[ingest] success file_id=${row.file_id} → ${summary}`);
    } catch (err) {
      const iErr = err instanceof IngestError ? err : toIngestError(err);
      const maskedMsg = maskSecrets(iErr.message);
      const { retryCount, nextStatus } = await markFailure(
        row.id,
        maskedMsg,
        iErr.code,
        iErr.retryable,
        supabase,
      );
      if (nextStatus === 'failed') {
        failed++;
        notifyAdmin({
          kind: 'ingestion_permanent_failure',
          logId: row.id,
          fileId: row.file_id,
          errorCode: iErr.code,
          errorMessage: maskedMsg,
          retryCount,
        });
        console.log(
          `[ingest] failed (permanent) file_id=${row.file_id} code=${iErr.code} retry=${retryCount}/${MAX_RETRY}`,
        );
      } else {
        retried++;
        console.log(
          `[ingest] failed (will retry) file_id=${row.file_id} code=${iErr.code} retry=${retryCount}/${MAX_RETRY}`,
        );
      }
    }
  }

  const finalSummary = await summarize(supabase);
  return { processed, succeeded, failed, retried, finalSummary };
}
