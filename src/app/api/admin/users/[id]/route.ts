/**
 * PATCH /api/admin/users/[id] … 部署／権限／状態の更新
 *
 * 参照：tasks.md Day6 Phase 4.2・PM 追加安全策
 *        requirements.md §3・§4
 *
 * ★ PM 指示（2026-10-01）：DELETE エンドポイントは作らない。削除予定化は
 *   `PATCH { accountStatus: 'pending_deletion' }` で行う。
 * ★ 自分自身の停止・削除予定化、最後の有効な管理者の無効化・降格は lib 側で 403 を返す。
 * ★ 退職への遷移時は retirementRetentionDays（30/90/365）を必須。
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError, requireAdmin } from '@/lib/auth/session';
import { apiError, unauthorizedToResponse } from '@/lib/api/error-response';
import { UserOperationError, updateUser } from '@/lib/admin/users';
import {
  ACCOUNT_STATUSES,
  DEPARTMENTS,
  RETIREMENT_RETENTION_DAYS,
  USER_ROLES,
  type RetirementRetentionDays,
} from '@/lib/admin/users-shared';
import type { AccountStatus, Department, UserRole } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapErrorToResponse(err: UserOperationError): NextResponse {
  switch (err.code) {
    case 'validation':
      return apiError('validation', err.userMessage);
    case 'conflict':
      return apiError('conflict', err.userMessage);
    case 'forbidden':
      return apiError('forbidden', err.userMessage);
    case 'not_found':
      return apiError('not_found', err.userMessage);
    case 'password_generation':
    case 'internal':
    default:
      return apiError('internal', err.userMessage);
  }
}

/** patch オブジェクトの型を最小限だけ検証（本体の enum 検証は lib 側でも実行される） */
function parsePatch(raw: unknown): {
  department?: Department;
  role?: UserRole;
  accountStatus?: AccountStatus;
  retirementRetentionDays?: RetirementRetentionDays;
} {
  if (!raw || typeof raw !== 'object') {
    throw new UserOperationError('validation', '入力内容を確認してください');
  }
  const src = raw as Record<string, unknown>;
  const out: {
    department?: Department;
    role?: UserRole;
    accountStatus?: AccountStatus;
    retirementRetentionDays?: RetirementRetentionDays;
  } = {};
  if (src.department !== undefined) {
    if (
      typeof src.department !== 'string' ||
      !DEPARTMENTS.includes(src.department as Department)
    ) {
      throw new UserOperationError('validation', '部署の値が正しくありません');
    }
    out.department = src.department as Department;
  }
  if (src.role !== undefined) {
    if (typeof src.role !== 'string' || !USER_ROLES.includes(src.role as UserRole)) {
      throw new UserOperationError('validation', '権限の値が正しくありません');
    }
    out.role = src.role as UserRole;
  }
  if (src.accountStatus !== undefined) {
    if (
      typeof src.accountStatus !== 'string' ||
      !ACCOUNT_STATUSES.includes(src.accountStatus as AccountStatus)
    ) {
      throw new UserOperationError('validation', 'アカウント状態の値が正しくありません');
    }
    out.accountStatus = src.accountStatus as AccountStatus;
  }
  if (src.retirementRetentionDays !== undefined) {
    if (
      typeof src.retirementRetentionDays !== 'number' ||
      !RETIREMENT_RETENTION_DAYS.includes(
        src.retirementRetentionDays as RetirementRetentionDays,
      )
    ) {
      throw new UserOperationError(
        'validation',
        '保持期間は 30 日・90 日・1 年（365 日）から選択してください',
      );
    }
    out.retirementRetentionDays = src.retirementRetentionDays as RetirementRetentionDays;
  }
  // まったく変更対象が無い場合
  if (Object.keys(out).length === 0) {
    throw new UserOperationError(
      'validation',
      '変更内容を指定してください（部署／権限／状態のいずれか）',
    );
  }
  return out;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    if (!UUID_RE.test(params.id)) {
      return apiError('validation', 'ユーザー ID の形式が正しくありません');
    }
    const actor = await requireAdmin();

    const body = await request.json().catch(() => null);
    const patch = parsePatch(body);

    const result = await updateUser({
      actor,
      targetId: params.id,
      patch,
    });

    return NextResponse.json({ ok: true, user: result.user });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedToResponse(err);
    if (err instanceof UserOperationError) return mapErrorToResponse(err);
    console.error('[admin/users PATCH] unexpected:', (err as Error).message);
    return apiError('internal');
  }
}
