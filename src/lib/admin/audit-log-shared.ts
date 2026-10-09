/**
 * 監査ログの Client / Server 共通の型・enum・ラベル
 *   - `server-only` を含まないので、Client Component からも import 可能
 */

import type { Department } from '@/lib/auth/session';

export const AUDIT_ACTION_TYPES = [
  'login',
  'logout',
  'search',
  'search_failed',
  'create',
  'update',
  'delete',
  'setting_change',
  'password_change',
] as const;
export type AuditActionType = (typeof AUDIT_ACTION_TYPES)[number];

export const AUDIT_TARGET_TYPES = [
  'user',
  'document',
  'setting',
  'ingestion_job',
  'session',
  'search_query',
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actionType: AuditActionType;
  targetType: AuditTargetType | string | null;
  targetId: string | null;
  targetDepartment: Department | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export const ACTION_TYPE_LABEL: Record<AuditActionType, string> = {
  login: 'ログイン',
  logout: 'ログアウト',
  search: '検索',
  search_failed: '検索の失敗',
  create: '新規作成',
  update: '更新',
  delete: '削除',
  setting_change: '設定変更',
  password_change: 'パスワード変更',
};

export const TARGET_TYPE_LABEL: Record<string, string> = {
  user: 'ユーザー',
  document: '資料',
  setting: '設定',
  ingestion_job: '取り込みジョブ',
  session: 'セッション',
  search_query: '検索',
};
