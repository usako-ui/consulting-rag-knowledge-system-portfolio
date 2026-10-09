/**
 * 管理者ダッシュボード用の集計データ取得
 * 参照：requirements.md §11・§17・§19・§24
 *        architecture.md §7（API 使用量ゲージの根拠・PM 判断記録）
 *
 * ★ service_role で全部署横断集計を行う（RLS バイパスするため、呼び出し側で必ず認可確認後に呼ぶ）
 *
 * ★ 月間予算（monthly_api_budget_tokens）は system_settings から読む。
 *   Google 公式が Free tier 数値を非公開のため「管理者が設定する月間予算」を 100% とする
 *   （PM 判断・2026-09-30・詳細は architecture.md §7）。
 */

import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { Department } from '@/lib/auth/session';

export type OverallStatus = 'ok' | 'notice' | 'action_required';

export interface DashboardTask {
  id: string;
  severity: 'action_required' | 'notice';
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}

export interface DashboardData {
  overallStatus: OverallStatus;
  tasks: DashboardTask[];
  documentsByDepartment: Array<{ department: Department; count: number }>;
  searchCount24h: number;
  ingestionSummary: {
    processing: number;
    retrying: number;
    failed: number;
    successToday: number;
  };
  usage: {
    /** 当月のトークン累計 */
    monthTokens: number;
    /** 当月のリクエスト累計（表示専用・予算計算対象外） */
    monthRequests: number;
    /**
     * 管理者が設定した月間予算（tokens）。system_settings.monthly_api_budget_tokens から取得。
     * Phase 5.3 で UI から変更可能。プロバイダ非依存（Gemini/Claude 切替に影響しない）。
     */
    monthTokenBudget: number;
    /** パーセント（0-100+）。予算に対する使用比率 */
    tokenPercent: number;
    /** 4段階 */
    band: 'green' | 'yellow' | 'orange' | 'red';
    /** 最終計測時刻（api_usage_log.max(occurred_at)） null=当月データなし */
    lastMeasuredAt: string | null;
  };
}

const DEPARTMENTS: Department[] = ['strategy', 'business', 'it', 'hr', 'sales', 'management'];

/** system_settings から数値設定を取得。未登録・無効値なら fallback を返す */
async function readNumericSetting(
  service: ReturnType<typeof getServiceRoleClient>,
  key: string,
  fallback: number,
): Promise<number> {
  const { data } = await service
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (!data?.value) return fallback;
  const parsed = Number(data.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** JST（+09:00）基準の当月開始 ISO 文字列を返す（架空案件クライアント＝日本のコンサル会社） */
function jstMonthStartIso(now: Date): string {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowInJst = new Date(now.getTime() + JST_OFFSET_MS);
  const jstYear = nowInJst.getUTCFullYear();
  const jstMonth = nowInJst.getUTCMonth();
  // JST の 1 日 00:00 は UTC 上では前日 15:00 の時刻
  const monthStartUtcMs = Date.UTC(jstYear, jstMonth, 1) - JST_OFFSET_MS;
  return new Date(monthStartUtcMs).toISOString();
}

export async function loadDashboardData(): Promise<DashboardData> {
  const service = getServiceRoleClient();
  const now = new Date();
  // JST 基準の月境界（日本業務システムのため・architecture.md §7.1 に明記）
  const monthStartIso = jstMonthStartIso(now);
  const day24hIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // 月間予算（PM 判断・プロバイダ非依存・system_settings から）
  // 未設定・0 の場合は 0 のまま UsageGauge に伝搬 →「予算未設定」として表示（0 除算防止）
  const monthTokenBudget = await readNumericSetting(service, 'monthly_api_budget_tokens', 0);

  // 部署別 documents 件数（is_active=true）
  const documentsByDepartment: Array<{ department: Department; count: number }> = [];
  const { data: docs } = await service
    .from('documents')
    .select('department')
    .eq('is_active', true);
  const docsMap = new Map<Department, number>();
  for (const dept of DEPARTMENTS) docsMap.set(dept, 0);
  for (const row of docs ?? []) {
    const dept = row.department as Department;
    docsMap.set(dept, (docsMap.get(dept) ?? 0) + 1);
  }
  for (const dept of DEPARTMENTS) {
    documentsByDepartment.push({ department: dept, count: docsMap.get(dept) ?? 0 });
  }

  // G-6: Gemini 障害確認（system_settings.gemini_last_check）
  const { data: geminiCheckRow } = await service
    .from('system_settings')
    .select('value')
    .eq('key', 'gemini_last_check')
    .maybeSingle();
  let geminiFailed = false;
  let geminiErrorCode: string | null = null;
  if (geminiCheckRow?.value) {
    try {
      const g = JSON.parse(geminiCheckRow.value as string) as {
        ok: boolean;
        errorCode?: string | null;
      };
      if (g && g.ok === false) {
        geminiFailed = true;
        geminiErrorCode = g.errorCode ?? null;
      }
    } catch {
      /* パース失敗は無視 */
    }
  }

  // G-7: 直近 24h の検索失敗（details.test=true のテスト行を除く）
  const { data: searchFailedRows } = await service
    .from('audit_log')
    .select('details')
    .eq('action_type', 'search_failed')
    .gte('created_at', day24hIso);
  const realSF = (searchFailedRows ?? []).filter(
    (r) => !(r.details as Record<string, unknown>)?.test,
  );
  const sfCount = {
    auth: realSF.filter((r) => (r.details as Record<string, unknown>)?.error_code === 'auth').length,
    rate_limit: realSF.filter((r) => (r.details as Record<string, unknown>)?.error_code === 'rate_limit').length,
    llm: realSF.filter((r) => (r.details as Record<string, unknown>)?.error_code === 'llm').length,
    db: realSF.filter((r) => (r.details as Record<string, unknown>)?.error_code === 'db').length,
    unknown: realSF.filter((r) =>
      !['auth', 'rate_limit', 'llm', 'db'].includes(
        String((r.details as Record<string, unknown>)?.error_code ?? ''),
      ),
    ).length,
  };

  // ingestion_log 集計（失敗の中の 429 も別途カウント）
  const { data: ingestRows } = await service
    .from('ingestion_log')
    .select('status, error_code, created_at');
  const ingestionSummary = { processing: 0, retrying: 0, failed: 0, successToday: 0 };
  let rateLimitFailures24h = 0;
  for (const row of ingestRows ?? []) {
    if (row.status === 'processing') ingestionSummary.processing++;
    else if (row.status === 'retrying') ingestionSummary.retrying++;
    else if (row.status === 'failed') {
      ingestionSummary.failed++;
      if (
        row.error_code === 'rate_limit' &&
        row.created_at &&
        row.created_at > day24hIso
      ) {
        rateLimitFailures24h++;
      }
    } else if (row.status === 'success' && row.created_at && row.created_at > day24hIso) {
      ingestionSummary.successToday++;
    }
  }

  // 直近 24h の検索件数
  const { count: searchCount24h } = await service
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('action_type', 'search')
    .gte('created_at', day24hIso);

  // 当月の API 使用量 + 最終計測時刻
  const { data: usageRows } = await service
    .from('api_usage_log')
    .select('request_count, token_count, occurred_at')
    .gte('occurred_at', monthStartIso)
    .order('occurred_at', { ascending: false });
  let monthTokens = 0;
  let monthRequests = 0;
  const lastMeasuredAt = usageRows && usageRows.length > 0 ? usageRows[0].occurred_at : null;
  for (const row of usageRows ?? []) {
    monthTokens += row.token_count ?? 0;
    monthRequests += row.request_count ?? 0;
  }
  // 予算 0 のときは band='green' 固定（0 除算防止）。UsageGauge が「予算未設定」表示で上書き
  const tokenPercent =
    monthTokenBudget > 0
      ? Math.round((monthTokens / monthTokenBudget) * 1000) / 10
      : 0;
  const band: DashboardData['usage']['band'] =
    monthTokenBudget <= 0
      ? 'green'
      : tokenPercent >= 100
        ? 'red'
        : tokenPercent >= 90
          ? 'orange'
          : tokenPercent >= 70
            ? 'yellow'
            : 'green';

  // 「対応が必要なタスク」を組み立て
  const tasks: DashboardTask[] = [];

  // G-6: Gemini 障害（gemini_last_check.ok=false）
  if (geminiFailed) {
    const isAuthErr = geminiErrorCode === 'auth' || geminiErrorCode === 'authentication';
    tasks.push({
      id: 'gemini_check_failed',
      severity: 'action_required',
      title: 'AI サービスに接続できない状態です',
      description: isAuthErr
        ? 'Gemini API への認証に失敗しています（前回の接続確認が失敗しました）。APIキーや認証設定に問題がある可能性があります。開発・運用担当者に確認を依頼してください。設定画面で「確認する」を押して状態を更新できます。'
        : '前回の Gemini 接続確認が失敗しました。AI 検索・回答機能が使えない可能性があります。設定画面で「確認する」を押して状態を確認してください。改善しない場合は開発・運用担当者に確認を依頼してください。',
      actionLabel: '設定を見る',
      actionHref: '/admin/settings',
    });
  }

  // G-7: 検索失敗（種類ごと・「正常稼働中」と同時には出ない）
  if (sfCount.auth > 0) {
    tasks.push({
      id: 'search_failed_auth',
      severity: 'action_required',
      title: `検索機能で認証エラーが発生 ${sfCount.auth} 件（直近 24 時間）`,
      description:
        '検索・回答機能が AI サービスへの接続に失敗しています（APIキーや認証設定に問題がある可能性があります）。開発・運用担当者に確認を依頼してください。設定画面でも状態を確認できます。',
      actionLabel: '設定を見る',
      actionHref: '/admin/settings',
    });
  }
  if (sfCount.rate_limit > 0) {
    tasks.push({
      id: 'search_failed_rate_limit',
      severity: 'notice',
      title: `検索機能で AI 利用制限が発生 ${sfCount.rate_limit} 件（直近 24 時間）`,
      description:
        '検索・回答機能で AI サービス側の利用制限がかかりました（短時間に多くの質問が届いた場合や、当日の利用量が上限に達した場合に発生します）。しばらく待てば自動回復します。改善しない場合は開発・運用担当者に確認を依頼してください。',
      actionLabel: '監査ログを見る',
      actionHref: '/admin/audit-log',
    });
  }
  if (sfCount.llm > 0) {
    tasks.push({
      id: 'search_failed_llm',
      severity: 'notice',
      title: `AI 応答処理でエラーが発生 ${sfCount.llm} 件（直近 24 時間）`,
      description:
        '検索・回答機能で AI 側の処理に一時的な不調が発生しました（AI サービス側の問題の可能性があります）。しばらく待てば自動回復することが多いです。改善しない場合は開発・運用担当者に確認を依頼してください。',
      actionLabel: '監査ログを見る',
      actionHref: '/admin/audit-log',
    });
  }
  if (sfCount.db > 0) {
    tasks.push({
      id: 'search_failed_db',
      severity: 'action_required',
      title: `検索機能でデータベースエラーが発生 ${sfCount.db} 件（直近 24 時間）`,
      description:
        '検索・回答機能でデータベースへのアクセスに失敗しました。システムに問題が発生している可能性があります。開発・運用担当者に確認を依頼してください。',
      actionLabel: '監査ログを見る',
      actionHref: '/admin/audit-log',
    });
  }
  if (sfCount.unknown > 0) {
    tasks.push({
      id: 'search_failed_unknown',
      severity: 'action_required',
      title: `検索機能で予期しないエラーが発生 ${sfCount.unknown} 件（直近 24 時間）`,
      description:
        '検索・回答機能で原因不明のエラーが発生しました。監査ログで詳細を確認し、改善しない場合は開発・運用担当者に確認を依頼してください。',
      actionLabel: '監査ログを見る',
      actionHref: '/admin/audit-log',
    });
  }

  if (ingestionSummary.failed > 0) {
    tasks.push({
      id: 'ingestion_failed',
      severity: 'action_required',
      title: `取り込み失敗 ${ingestionSummary.failed} 件`,
      description: '再取り込みを実行するか、原因を確認してください。',
      actionLabel: '取り込み状況を見る',
      actionHref: '/admin/ingestion',
    });
  }
  // 429（レートリミット）の可視化：ingest 経路の 429 を直近 24h でカウント
  // 検索経路の 429 は G-7（search_failed_rate_limit タスク）で別途表示。
  // 誤解防止のためタイトルに「資料の取り込み処理で」と範囲を明記する。
  if (rateLimitFailures24h > 0) {
    tasks.push({
      id: 'rate_limit_failures',
      severity: 'action_required',
      title: `資料の取り込み処理で API 制限が発生 ${rateLimitFailures24h} 件（直近 24 時間）`,
      description:
        '資料取り込み（Embedding 生成）中に AI プロバイダ側で利用制限がかかり失敗しました。時間を空けて再取り込みするか、月間予算・利用ペースを確認してください。（Web/Slack 検索経路の同種エラーは現時点でこの一覧には出ません）',
      actionLabel: '取り込み状況を見る',
      actionHref: '/admin/ingestion',
    });
  }
  if (ingestionSummary.retrying > 0) {
    tasks.push({
      id: 'ingestion_retrying',
      severity: 'notice',
      title: `再試行中 ${ingestionSummary.retrying} 件`,
      description: '自動再試行を待機中です。3 回失敗すると失敗確定になります。',
      actionLabel: '状況を見る',
      actionHref: '/admin/ingestion',
    });
  }
  if (ingestionSummary.processing > 0) {
    tasks.push({
      id: 'ingestion_processing',
      severity: 'notice',
      title: `処理中 ${ingestionSummary.processing} 件`,
      description: '取り込みが進行中です。長時間停滞している場合は詳細を確認してください。',
      actionLabel: '状況を見る',
      actionHref: '/admin/ingestion',
    });
  }
  // 予算 0 の場合は 4 段階タスクを生成しない（未設定は UsageGauge 側で案内）
  if (monthTokenBudget > 0 && band === 'red') {
    tasks.push({
      id: 'api_usage_over',
      severity: 'action_required',
      title: `月間予算 100% 到達（${tokenPercent}%）`,
      description:
        '管理者が設定した月間予算に達しました。予算増額の判断や翌月まで運用制限を検討してください。',
      actionLabel: '設定を見る',
      actionHref: '/admin/settings',
    });
  } else if (monthTokenBudget > 0 && band === 'orange') {
    tasks.push({
      id: 'api_usage_high',
      severity: 'action_required',
      title: `月間予算の高負荷（${tokenPercent}%）`,
      description: '設定予算の残りが 10% を切りました。運用継続の判断が必要です。',
      actionLabel: '設定を見る',
      actionHref: '/admin/settings',
    });
  } else if (monthTokenBudget > 0 && band === 'yellow') {
    tasks.push({
      id: 'api_usage_warn',
      severity: 'notice',
      title: `月間予算に注意（${tokenPercent}%）`,
      description: '設定予算の 70% 以上を消費しています。',
      actionLabel: '設定を見る',
      actionHref: '/admin/settings',
    });
  }

  const overallStatus: OverallStatus = tasks.some((t) => t.severity === 'action_required')
    ? 'action_required'
    : tasks.length > 0
      ? 'notice'
      : 'ok';

  return {
    overallStatus,
    tasks,
    documentsByDepartment,
    searchCount24h: searchCount24h ?? 0,
    ingestionSummary,
    usage: {
      monthTokens,
      monthRequests,
      monthTokenBudget,
      tokenPercent,
      band,
      lastMeasuredAt,
    },
  };
}
