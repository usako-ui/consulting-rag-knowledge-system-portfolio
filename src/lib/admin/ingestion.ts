/**
 * 取り込み状況一覧と再取り込み（Phase 5.2）
 * 参照：requirements.md §13・§14・§15
 *       tasks.md Day6 Phase 5.2・PM 修正指示 A
 *
 * ★ 再取り込みの実処理方針（PM 修正指示 2026-10-01）
 *   - Vercel Hobby の 10 秒制限内で完結しない処理（Embedding 生成等）を Route Handler で直接呼ばない
 *   - Route Handler は「status を failed → retrying に更新するだけ」の予約型
 *   - 実処理のきっかけは次の 2 経路：
 *     1. 月次 cron（毎月 1 日 02:00 JST・ingest.yml）が retrying 対象も拾って処理
 *     2. 管理者が GitHub Actions `workflow_dispatch` を手動実行（即座に拾う）
 *   - 画面文言は「再取り込みを予約しました」と実態に合わせる
 *
 * ★ 対象状態（PM 修正指示 2026-10-01）
 *   - failed のみ対象（retrying/processing は 409）
 *   - 自動再試行 3 回も尽きた「失敗確定」のレコードを管理者判断で再キューイング
 */

import 'server-only';
import { z } from 'zod';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAdminActionStrict } from '@/lib/audit/record';
import type { AuthenticatedUser, Department } from '@/lib/auth/session';
import {
  INGESTION_STATUSES,
  PERMANENT_INGEST_ERROR_CODES,
  type IngestionLogRecord,
  type IngestionStatus,
} from './ingestion-shared';
import type { IngestErrorCode } from '@/lib/ingest/types';

export interface IngestionSummary {
  pending: number;
  processing: number;
  retrying: number;
  failed: number;
  successToday: number;
}

export interface IngestionListResult {
  rows: IngestionLogRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: IngestionSummary;
}

// -----------------------------------------------------------------------------
// 例外
// -----------------------------------------------------------------------------

export type IngestionOperationErrorCode =
  | 'validation'
  | 'conflict'
  | 'not_found'
  | 'internal';

export class IngestionOperationError extends Error {
  constructor(
    public code: IngestionOperationErrorCode,
    public userMessage: string,
    cause?: unknown,
  ) {
    super(userMessage);
    this.name = 'IngestionOperationError';
    if (cause !== undefined) {
      (this as unknown as { cause?: unknown }).cause = cause;
    }
  }
}

// -----------------------------------------------------------------------------
// 入力検証スキーマ
// -----------------------------------------------------------------------------

export const ingestionFilterSchema = z
  .object({
    status: z.enum(INGESTION_STATUSES).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.coerce.number().int().positive().max(10_000).default(1),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '開始日は終了日以前の日付を指定してください',
    path: ['from'],
  });

export type IngestionFilter = z.infer<typeof ingestionFilterSchema>;

// -----------------------------------------------------------------------------
// 一覧 + 集計
// -----------------------------------------------------------------------------

export const INGESTION_PAGE_SIZE = 20;

function jstDateToUtcIso(date: string, endOfDay = false): string {
  const [y, m, d] = date.split('-').map(Number);
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const base = Date.UTC(y, m - 1, d) - JST_OFFSET_MS;
  const target = endOfDay ? base + 24 * 60 * 60 * 1000 : base;
  return new Date(target).toISOString();
}

export async function listIngestionLogs(
  filter: IngestionFilter,
): Promise<IngestionListResult> {
  const service = getServiceRoleClient();
  const page = Math.max(1, filter.page);
  const offset = (page - 1) * INGESTION_PAGE_SIZE;

  // 一覧クエリ
  let query = service
    .from('ingestion_log')
    .select(
      `id, document_id, file_id, status, source, error_message, error_code, retry_count,
       started_at, completed_at, created_at,
       document:documents(title, department, is_active)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (filter.status) query = query.eq('status', filter.status);
  if (filter.from) query = query.gte('created_at', jstDateToUtcIso(filter.from, false));
  if (filter.to) query = query.lt('created_at', jstDateToUtcIso(filter.to, true));

  query = query.range(offset, offset + INGESTION_PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) {
    throw new IngestionOperationError(
      'internal',
      '取り込み状況の取得に失敗しました',
      error,
    );
  }

  const rows: IngestionLogRecord[] = (data ?? []).map((row) => {
    const doc = (row as { document?: unknown }).document;
    return {
      id: row.id as string,
      documentId: (row.document_id as string | null) ?? null,
      fileId: row.file_id as string,
      status: row.status as IngestionStatus,
      source: ((row.source as string) === 'web' ? 'web' : 'testdocs') as 'web' | 'testdocs',
      errorMessage: (row.error_message as string | null) ?? null,
      errorCode: (row.error_code as string | null) ?? null,
      retryCount: (row.retry_count as number) ?? 0,
      startedAt: (row.started_at as string | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
      createdAt: row.created_at as string,
      document: doc
        ? {
            title: ((doc as { title?: string | null }).title as string | null) ?? null,
            department:
              ((doc as { department?: Department | null }).department as Department | null) ??
              null,
            isActive:
              ((doc as { is_active?: boolean | null }).is_active as boolean | null) ?? null,
          }
        : undefined,
    };
  });

  // 状態別集計（別クエリ・小さいテーブル前提）
  const summary = await loadIngestionSummary();

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / INGESTION_PAGE_SIZE));

  return {
    rows,
    totalCount,
    page,
    pageSize: INGESTION_PAGE_SIZE,
    totalPages,
    summary,
  };
}

export async function loadIngestionSummary(): Promise<IngestionSummary> {
  const service = getServiceRoleClient();
  const day24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await service
    .from('ingestion_log')
    .select('status, created_at');

  const summary: IngestionSummary = {
    pending: 0,
    processing: 0,
    retrying: 0,
    failed: 0,
    successToday: 0,
  };
  for (const row of data ?? []) {
    const status = row.status as IngestionStatus;
    if (status === 'pending') summary.pending++;
    else if (status === 'processing') summary.processing++;
    else if (status === 'retrying') summary.retrying++;
    else if (status === 'failed') summary.failed++;
    else if (
      status === 'success' &&
      row.created_at &&
      (row.created_at as string) > day24hIso
    ) {
      summary.successToday++;
    }
  }
  return summary;
}

// -----------------------------------------------------------------------------
// 再取り込み
// -----------------------------------------------------------------------------

export interface RetryIngestionInput {
  actor: AuthenticatedUser;
  targetId: string;
}

export interface RetryIngestionResult {
  id: string;
  previousStatus: IngestionStatus;
  newStatus: 'retrying';
  /** リセット後の retry_count（常に 0） */
  retryCount: number;
  /** リセット前の retry_count（監査ログ・UI 補足用） */
  previousRetryCount: number;
}

/**
 * 対象 ingestion_log の status を failed → retrying に更新する（予約型）。
 * 実処理は次回の GHA runner が retrying 対象を拾って実行する。
 *
 * - **対象限定**：failed のみ（retrying/processing/success/pending は 409）
 * - **楽観ロック**：UPDATE WHERE id=? AND status='failed' RETURNING id → 0 件なら 409
 * - **retry_count は 0 にリセット**：手動再取り込みは「管理者が原因を直してやり直す」場面想定。
 *   既存の自動リトライ機構（最大 3 回）を再度フルで使えるようにする（architecture.md §12E 参照）。
 *   要件§15「同じ処理は最大 3 回まで自動再試行」は "1 回のサイクル" に対する制限として維持される。
 * - **監査ログ**：recordAdminActionStrict で action='update' + target_type='ingestion_job'
 *   + details に previous_retry_count と new_retry_count=0 を記録（平文・機密は含めない）
 */
export async function retryIngestion(
  input: RetryIngestionInput,
): Promise<RetryIngestionResult> {
  const service = getServiceRoleClient();

  // 現状スナップショット（表示用の previousStatus / 存在チェック）
  const { data: snapshot, error: fetchErr } = await service
    .from('ingestion_log')
    .select('id, status, source, file_id, error_code, retry_count')
    .eq('id', input.targetId)
    .maybeSingle();
  if (fetchErr) {
    throw new IngestionOperationError(
      'internal',
      '取り込みログの取得に失敗しました',
      fetchErr,
    );
  }
  if (!snapshot) {
    throw new IngestionOperationError('not_found', '対象の取り込みログが見つかりませんでした');
  }

  const previousStatus = snapshot.status as IngestionStatus;
  const previousRetryCount = (snapshot.retry_count as number) ?? 0;
  const source = (snapshot.source as string) === 'web' ? 'web' : 'testdocs';

  // 対象状態チェック（failed のみ）
  if (previousStatus !== 'failed') {
    throw new IngestionOperationError(
      'conflict',
      previousStatus === 'retrying' || previousStatus === 'processing' || previousStatus === 'pending'
        ? '現在処理中または再試行待ちです。しばらくお待ちください'
        : previousStatus === 'success'
          ? 'この取り込みは既に完了しています'
          : 'この状態では再取り込みできません',
    );
  }

  // 恒久的なエラーは再取り込みしても改善しないため拒否
  const errorCode = snapshot.error_code as IngestErrorCode | null;
  if (errorCode && PERMANENT_INGEST_ERROR_CODES.has(errorCode)) {
    throw new IngestionOperationError(
      'conflict',
      '元のファイルを直して、もう一度アップロードしてください',
    );
  }

  // 楽観ロック UPDATE（status WHERE 句は変更しない・retry_count は 0 にリセット）
  const { data: updated, error: updateErr } = await service
    .from('ingestion_log')
    .update({
      status: 'retrying',
      retry_count: 0,
    })
    .eq('id', input.targetId)
    .eq('status', 'failed') // 楽観ロック：他で既に動いていれば 0 件
    .select('id');
  if (updateErr) {
    throw new IngestionOperationError(
      'internal',
      '再取り込みの予約に失敗しました',
      updateErr,
    );
  }
  if (!updated || updated.length === 0) {
    // 他プロセスが先に状態を変えた
    throw new IngestionOperationError(
      'conflict',
      '他の操作で状態が変わりました。画面を再読み込みしてから再度お試しください',
    );
  }

  // 監査ログ（strict・失敗時は compensating で status と retry_count を戻す）
  try {
    await recordAdminActionStrict({
      actor: input.actor,
      action: 'update',
      targetType: 'ingestion_job',
      targetId: input.targetId,
      details: {
        reingest: true,
        file_id: snapshot.file_id,
        source,
        previous_status: previousStatus,
        previous_error_code: snapshot.error_code,
        previous_retry_count: previousRetryCount,
        new_retry_count: 0,
      },
    });
  } catch (auditErr) {
    // compensating：status と retry_count を元に戻す
    await service
      .from('ingestion_log')
      .update({ status: 'failed', retry_count: previousRetryCount })
      .eq('id', input.targetId);
    throw new IngestionOperationError(
      'internal',
      '再取り込みの記録に失敗したため、予約を取り消しました。時間をおいて再度お試しください',
      auditErr,
    );
  }

  return {
    id: input.targetId,
    previousStatus,
    newStatus: 'retrying',
    retryCount: 0,
    previousRetryCount,
  };
}

// 表示用ユーティリティ（ラベル）は ingestion-shared.ts に移動済み（Client 用）
