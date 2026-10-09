/**
 * ログ保存期間の Client / Server 共通定数
 */
export const LOG_RETENTION_DAYS_CHOICES = [30, 90, 365] as const;
export type LogRetentionDays = (typeof LOG_RETENTION_DAYS_CHOICES)[number];
export const DEFAULT_LOG_RETENTION_DAYS: LogRetentionDays = 30;

export function logRetentionLabel(days: number): string {
  if (days === 365) return '1 年（365 日）';
  return `${days} 日`;
}
