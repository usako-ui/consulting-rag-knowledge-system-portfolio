/**
 * ユーザー管理の Client / Server 共通の型・enum
 *   - `server-only` を含まないので、Client Component からも import 可能
 *   - Auth 操作・DB 操作等の副作用ロジックは `users.ts` 側（server-only）に置く
 */

import type { AccountStatus, Department, UserRole } from '@/lib/auth/session';

export const DEPARTMENTS: Department[] = [
  'strategy',
  'business',
  'it',
  'hr',
  'sales',
  'management',
];

export const USER_ROLES: UserRole[] = ['general', 'admin'];

export const ACCOUNT_STATUSES: AccountStatus[] = [
  'active',
  'suspended_leave',
  'suspended_retired',
  'pending_deletion',
];

/** 退職時保持期間（要件 §3：候補 30 日／90 日／1 年） */
export const RETIREMENT_RETENTION_DAYS = [30, 90, 365] as const;
export type RetirementRetentionDays = (typeof RETIREMENT_RETENTION_DAYS)[number];
export const DEFAULT_RETIREMENT_RETENTION_DAYS: RetirementRetentionDays = 90;

export interface AdminUserRecord {
  id: string;
  email: string;
  department: Department;
  role: UserRole;
  accountStatus: AccountStatus;
  retirementRetentionDeadline: string | null;
  passwordChanged: boolean;
  createdAt: string;
  updatedAt: string;
}
