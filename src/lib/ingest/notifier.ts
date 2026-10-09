/**
 * 管理者通知（T-09：3回失敗時のエスカレーション）
 *
 * 参照：requirements.md §15・§19, architecture.md §7・§8
 *
 * MVP 方針：
 *   - Slack 通知は Day4 実装なのでまだ組まない
 *   - 「管理者Web画面での通知」= dashboard クエリで
 *     `SELECT * FROM ingestion_log WHERE status='failed' AND retry_count>=3`
 *     を表示する形（Day6 T-22 で実装）
 *   - Day2 段階では確実に stderr に構造化ログを出し、
 *     GitHub Actions のログでも検知可能にする
 *
 * ★ ここではエラー本文にマスキング済みの内容のみを渡す想定（呼び出し側で maskSecrets 済み）
 */

export interface AdminNotification {
  kind: 'ingestion_permanent_failure';
  logId: string;
  fileId: string;
  errorCode: string;
  errorMessage: string;
  retryCount: number;
}

export function notifyAdmin(notification: AdminNotification): void {
  const payload = {
    at: new Date().toISOString(),
    level: 'error',
    channel: 'admin_notification',
    ...notification,
  };
  // 構造化ログとして stderr に出力（GHA・ローカル双方で検知可能）
  // Day6 でダッシュボード連携時に置き換える
  console.error(`[ADMIN_NOTIFY] ${JSON.stringify(payload)}`);
}
