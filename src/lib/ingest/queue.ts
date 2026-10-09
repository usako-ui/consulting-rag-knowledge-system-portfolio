/**
 * T-08 文書処理キュー（ingestion_log を単一実体として使う）
 *
 * 参照：requirements.md §14, architecture.md §3
 *
 * 5状態遷移：
 *   pending → processing → success
 *                        → failed（retry_count>=3）
 *                        → retrying（retry_count<3）→ processing → ...
 *
 * MVP は単一ランナーのみ（GHA cron / ローカル CLI どちらも同時に走らない前提）。
 * 将来の並列化を想定して pickup は id 単位で楽観ロック（updated_at チェック）にできる構造にする。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { IngestionStatus } from './types';

export interface IngestionLogRow {
  id: string;
  document_id: string | null;
  file_id: string;
  status: IngestionStatus;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  // Storage 直接アップロード対応（段階1追加）
  storage_path: string | null;
  content_hash: string | null;
  source: 'web' | 'testdocs';
  file_size_bytes: number | null;
  uploaded_by: string | null;
  department: string | null;
  title: string | null;
  created_year: number | null;
  client_name: string | null;
}

export const MAX_RETRY = 3;

/** キューに1件追加（同じ file_id で pending/processing がある場合は重複 enqueue を避ける） */
export async function enqueue(
  fileId: string,
  client?: SupabaseClient,
): Promise<{ id: string; wasNew: boolean }> {
  const supabase = client ?? getServiceRoleClient();

  const { data: existing } = await supabase
    .from('ingestion_log')
    .select('id, status')
    .eq('file_id', fileId)
    .in('status', ['pending', 'processing', 'retrying'])
    .maybeSingle();

  if (existing) {
    return { id: existing.id, wasNew: false };
  }

  const { data, error } = await supabase
    .from('ingestion_log')
    .insert({ file_id: fileId, status: 'pending', retry_count: 0 })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`enqueue 失敗: ${error?.message ?? 'no id returned'}`);
  }
  return { id: data.id, wasNew: true };
}

/**
 * 次に処理する 1 件を取り出し、processing に遷移させる。
 * MVP 単一ランナー前提のため、まず SELECT → UPDATE の2ステップで実装。
 * 該当がない場合は null を返す。
 */
export async function pickupNext(client?: SupabaseClient): Promise<IngestionLogRow | null> {
  const supabase = client ?? getServiceRoleClient();

  const { data: candidate, error: selErr } = await supabase
    .from('ingestion_log')
    .select('*')
    .in('status', ['pending', 'retrying'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selErr) throw new Error(`pickup select 失敗: ${selErr.message}`);
  if (!candidate) return null;

  const { data: updated, error: updErr } = await supabase
    .from('ingestion_log')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', candidate.id)
    .in('status', ['pending', 'retrying']) // 楽観ロック：他ランナーが先に処理中にしていたらスキップ
    .select('*')
    .single();

  if (updErr) {
    // 楽観ロック競合。次回ループで再取得
    return null;
  }
  return updated as IngestionLogRow;
}

export async function markSuccess(
  logId: string,
  documentId: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? getServiceRoleClient();
  const { error } = await supabase
    .from('ingestion_log')
    .update({
      status: 'success',
      document_id: documentId,
      error_message: null,
      error_code: null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', logId);
  if (error) throw new Error(`markSuccess 失敗: ${error.message}`);
}

/** 失敗確定 or 再試行にマーク。retry_count が返るので runner 側で状態判断可 */
export async function markFailure(
  logId: string,
  errorMessage: string,
  errorCode: string,
  retryable: boolean,
  client?: SupabaseClient,
): Promise<{ retryCount: number; nextStatus: IngestionStatus }> {
  const supabase = client ?? getServiceRoleClient();

  const { data: current, error: selErr } = await supabase
    .from('ingestion_log')
    .select('retry_count')
    .eq('id', logId)
    .single();

  if (selErr || !current) throw new Error(`markFailure select 失敗: ${selErr?.message ?? 'not found'}`);

  const nextRetryCount = current.retry_count + 1;
  // 要件 §15「3回失敗した場合、管理者へ通知」→ 3回目失敗で 'failed' 確定。
  // MAX_RETRY=3 の意味は「試行回数3回」（初回+2リトライ = 3回で終了）。
  const nextStatus: IngestionStatus =
    retryable && nextRetryCount < MAX_RETRY ? 'retrying' : 'failed';

  const patch: Record<string, unknown> = {
    status: nextStatus,
    retry_count: nextRetryCount,
    error_message: errorMessage.slice(0, 2000), // DB膨張防止
    error_code: errorCode,
  };
  if (nextStatus === 'failed') {
    patch.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from('ingestion_log').update(patch).eq('id', logId);
  if (error) throw new Error(`markFailure 失敗: ${error.message}`);
  return { retryCount: nextRetryCount, nextStatus };
}

/** 集計：現在のキュー状態内訳（管理者ダッシュボード用の下ごしらえ） */
export async function summarize(client?: SupabaseClient): Promise<Record<IngestionStatus, number>> {
  const supabase = client ?? getServiceRoleClient();
  const result: Record<IngestionStatus, number> = {
    pending: 0,
    processing: 0,
    success: 0,
    failed: 0,
    retrying: 0,
  };

  const { data, error } = await supabase
    .from('ingestion_log')
    .select('status');

  if (error) throw new Error(`summarize 失敗: ${error.message}`);
  for (const row of data ?? []) {
    const s = row.status as IngestionStatus;
    if (s in result) result[s]++;
  }
  return result;
}
