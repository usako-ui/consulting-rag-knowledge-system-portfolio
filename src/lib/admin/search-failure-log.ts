/**
 * 検索失敗の audit_log 記録（G-7）
 * requirements.md §15・§19
 *
 * - action_type = 'search_failed'（DB enum 追加済み: migration 20261007000001）
 * - details には error_code / source / event_id のみ格納
 *   （質問文・資料本文・APIキー・スタックトレースは禁止）
 * - 連続失敗は同種別・同経路で 1 分に 1 件まで記録（ログ肥大化防止）
 * - 記録失敗は例外を握り潰して利用者への応答を守る
 */

import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

const DEDUP_WINDOW_MS = 60_000;

async function canRecord(errorCode: string, source: 'web' | 'slack'): Promise<boolean> {
  try {
    const service = getServiceRoleClient();
    const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data } = await service
      .from('audit_log')
      .select('id')
      .eq('action_type', 'search_failed')
      .contains('details', { error_code: errorCode, source })
      .gte('created_at', sinceIso)
      .limit(1);
    return !data || data.length === 0;
  } catch {
    return true;
  }
}

export interface RecordSearchFailureParams {
  actorId: string;
  actorEmail: string;
  errorCode: string;
  source: 'web' | 'slack';
  eventId?: string;
  /** テスト用フラグ。true のときダッシュボード集計から除外される */
  isTest?: boolean;
}

export async function recordSearchFailure(params: RecordSearchFailureParams): Promise<void> {
  try {
    if (!params.isTest && !(await canRecord(params.errorCode, params.source))) return;
    const service = getServiceRoleClient();
    const details: Record<string, unknown> = {
      error_code: params.errorCode,
      source: params.source,
    };
    if (params.eventId) details.event_id = params.eventId;
    if (params.isTest) details.test = true;
    await service.from('audit_log').insert({
      actor_id: params.actorId,
      actor_email: params.actorEmail,
      action_type: 'search_failed',
      target_type: 'search_query',
      details,
    });
  } catch {
    // 記録失敗は無視（利用者への応答を守る）
  }
}
