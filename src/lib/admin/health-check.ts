/**
 * 接続状態の確認（Phase 5.3）
 * 参照：requirements.md §12・tasks.md Day6 Phase 5.3
 *       PM 修正指示 B（Gemini は DB キャッシュ 5 分・api_usage_log 連動・環境変数非表示）
 *
 * ★ Supabase / Slack はサーバー側で 3 秒タイムアウト・失敗しても画面が開く
 * ★ Gemini はボタン押下時のみ実行・前回結果を system_settings.gemini_last_check に保存
 *   同時刻から 5 分以内の再実行は API 呼び出しなしで保存値を返す
 */

import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { getLlmProvider } from '@/lib/llm';
import { serverEnv } from '@/lib/env';

export type HealthStatus = 'ok' | 'error' | 'unknown';

export interface SupabaseHealth {
  status: HealthStatus;
  latencyMs: number | null;
}

export interface SlackHealth {
  status: HealthStatus;
  latencyMs: number | null;
}

export interface GeminiHealth {
  status: HealthStatus;
  latencyMs: number | null;
  model: string | null;
  checkedAt: string | null;
  /** 保存値のそのまま返却か（キャッシュヒット）、新規実行か */
  cached: boolean;
  /** 失敗時のエラーコード（接続成功時は null） */
  errorCode: string | null;
}

export const GEMINI_CACHE_TTL_MS = 5 * 60 * 1000;
const GEMINI_SETTINGS_KEY = 'gemini_last_check';
const SUPABASE_SLACK_TIMEOUT_MS = 3000;

// -----------------------------------------------------------------------------
// Supabase：軽量クエリで接続確認・3 秒タイムアウト
// -----------------------------------------------------------------------------

export async function checkSupabase(): Promise<SupabaseHealth> {
  const started = Date.now();
  try {
    const service = getServiceRoleClient();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPABASE_SLACK_TIMEOUT_MS);
    try {
      // 最軽量のクエリ（1 行だけ・HEAD）
      const { error } = await service
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .abortSignal(controller.signal);
      clearTimeout(timeout);
      if (error) {
        return { status: 'error', latencyMs: Date.now() - started };
      }
      return { status: 'ok', latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { status: 'error', latencyMs: null };
  }
}

// -----------------------------------------------------------------------------
// Slack：auth.test で接続確認・3 秒タイムアウト
// -----------------------------------------------------------------------------

export async function checkSlack(): Promise<SlackHealth> {
  const started = Date.now();
  try {
    const token = serverEnv.slackBotToken();
    if (!token) {
      return { status: 'unknown', latencyMs: null };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPABASE_SLACK_TIMEOUT_MS);
    try {
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: '',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latency = Date.now() - started;
      if (!res.ok) return { status: 'error', latencyMs: latency };
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      return { status: data?.ok ? 'ok' : 'error', latencyMs: latency };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { status: 'error', latencyMs: null };
  }
}

// -----------------------------------------------------------------------------
// Gemini：DB キャッシュ 5 分・ボタン押下時のみ実行
// -----------------------------------------------------------------------------

interface GeminiCheckRecord {
  at: string;
  ok: boolean;
  latencyMs: number;
  model: string;
  errorCode: string | null;
}

/**
 * system_settings の gemini_last_check を読む。パース失敗や未登録は null。
 */
export async function getLastGeminiCheck(): Promise<GeminiCheckRecord | null> {
  const service = getServiceRoleClient();
  const { data } = await service
    .from('system_settings')
    .select('value')
    .eq('key', GEMINI_SETTINGS_KEY)
    .maybeSingle();
  if (!data?.value) return null;
  try {
    const parsed = JSON.parse(data.value as string) as GeminiCheckRecord;
    if (!parsed.at || typeof parsed.ok !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Gemini に embed("ping") を 1 回投げて、結果を system_settings.gemini_last_check に保存する。
 * 保存は service_role で upsert（system_settings_write_service_role_only ポリシー下）。
 *
 * 5 分以内の既存結果がある場合は API 呼び出しなしで保存値を返す（キャッシュヒット・PM 修正指示 B）。
 *
 * api_usage_log 書き込みは `provider.embed` の既存経路（pipeline.ts と同じ記録ロジック）を
 * 本関数で複製する。将来の集計時に `details.source='health_check'` 等で区別したい場合は、
 * api_usage_log にカラムを追加する MVP 外対応が必要（v1.0 候補）。
 */
export async function performGeminiCheck(options?: {
  /** true の場合、キャッシュを無視して必ず API を叩く（デバッグ用・UI からは呼ばない） */
  bypassCache?: boolean;
}): Promise<GeminiHealth> {
  const service = getServiceRoleClient();
  const now = Date.now();

  if (!options?.bypassCache) {
    const last = await getLastGeminiCheck();
    if (last) {
      const lastMs = new Date(last.at).getTime();
      if (!Number.isNaN(lastMs) && now - lastMs < GEMINI_CACHE_TTL_MS) {
        return {
          status: last.ok ? 'ok' : 'error',
          latencyMs: last.latencyMs,
          model: last.model,
          checkedAt: last.at,
          cached: true,
          errorCode: last.errorCode,
        };
      }
    }
  }

  // 新規実行：embed("ping") を 1 回
  const provider = getLlmProvider();
  const started = Date.now();
  let record: GeminiCheckRecord;
  try {
    const res = await provider.embed({ text: 'ping' });
    const latencyMs = Date.now() - started;
    record = {
      at: new Date().toISOString(),
      ok: true,
      latencyMs,
      model: provider.name === 'gemini' ? 'gemini-embedding-001' : provider.name,
      errorCode: null,
    };
    // api_usage_log に 1 件記録（source は現状未対応・v1.0 候補）
    await service
      .from('api_usage_log')
      .insert({
        provider: provider.name,
        api_type: 'embedding',
        request_count: 1,
        token_count: res.tokenCount,
      })
      .then(({ error }) => {
        if (error) {
          console.warn('[health-check] api_usage_log insert failed (non-fatal):', error.message);
        }
      });
  } catch (err) {
    const latencyMs = Date.now() - started;
    const errCode =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code ?? 'unknown')
        : 'unknown';
    record = {
      at: new Date().toISOString(),
      ok: false,
      latencyMs,
      model: provider.name === 'gemini' ? 'gemini-embedding-001' : provider.name,
      errorCode: errCode,
    };
  }

  // system_settings に upsert
  const { error: upsertErr } = await service.from('system_settings').upsert({
    key: GEMINI_SETTINGS_KEY,
    value: JSON.stringify(record),
  });
  if (upsertErr) {
    console.warn('[health-check] gemini_last_check upsert failed (non-fatal):', upsertErr.message);
  }

  return {
    status: record.ok ? 'ok' : 'error',
    latencyMs: record.latencyMs,
    model: record.model,
    checkedAt: record.at,
    cached: false,
    errorCode: record.errorCode,
  };
}
