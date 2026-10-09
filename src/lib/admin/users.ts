/**
 * 管理者用ユーザー管理ロジック
 * 参照：requirements.md §3（休職・退職：30/90/365 日）・§4（サーバー側二重防御）・§16（ログ機密情報禁止）
 *       tasks.md Day6 Phase 4.2・PM 追加安全策
 *       architecture.md §12D（Phase 4.2 で追記予定：一時PW生成方式・rollback 方針・セッション扱い）
 *
 * ★ 平文パスワードの取り扱い方針（重要）
 *   - DB に保存しない（Supabase Auth の bcrypt hash のみ）
 *   - サーバーログ・エラーログに出さない（本ファイルでは平文を含む Error を投げない）
 *   - 監査ログに含めない（details には `{ initiated_by: 'admin' }` のみ）
 *   - API レスポンスにのみ 1 度だけ含める。Route Handler 側で Cache-Control: no-store を付ける
 *
 * ★ 一時パスワード生成方式（PM 判断・2026-10-01）
 *   - 56 文字集合：a-z(25, `l` 除外) + A-Z(23, `I,L,O` 除外) + 2-9(8, `0,1` 除外)
 *   - 14 文字：エントロピー 14 × log2(56) ≈ 81.3 ビット（bcrypt に対して十分）
 *   - 事後検証：小文字・大文字・数字が最低 1 文字ずつ含まれる（Supabase Password Strength `lower_upper_letters_digits` を満たす）
 *   - 満たさなければ再生成（最大 20 回）。生成では `crypto.randomInt` を使いバイアスなし
 *   - Supabase 側で拒否された場合は関数呼び出しレイヤーで最大 3 回再試行
 *
 * ★ Auth と user_profiles の 2 段書き込みロールバック方針（PM 追加事項 1）
 *   - createUser: auth.admin.createUser → user_profiles.insert の順
 *   - profiles.insert が失敗した場合、auth.admin.deleteUser(id) で auth 側を巻き戻す
 *   - 巻き戻しも失敗した場合、原因を Error に含めて上位に投げる（管理者に手動対応を促す）
 *   - 監査ログ記録は最後（成功時のみ）
 *
 * ★ セッション無効化方針（PM 追加事項 4）
 *   - password 変更・状態変更後：`auth.admin.signOut(userId, 'global')` を best-effort で呼ぶ
 *     - Supabase JS v2 は user_id 単位の signOut(scope='global') を提供
 *     - 失敗しても業務操作は成功扱い（refresh_token 回転で次回リフレッシュ時に失効するため）
 *   - 状態変更（active 以外）は requireUser() が毎リクエストで account_status を再検証するため
 *     次のリクエストで自動的にログイン不可になる（session.ts L67-69）
 *   - Slack 経由：handler.ts が user_profiles を都度参照するため同様
 */

import 'server-only';
import { randomInt } from 'node:crypto';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAdminActionStrict } from '@/lib/audit/record';
import type { AccountStatus, AuthenticatedUser, Department, UserRole } from '@/lib/auth/session';
import {
  ACCOUNT_STATUSES,
  DEPARTMENTS,
  RETIREMENT_RETENTION_DAYS,
  USER_ROLES,
  type AdminUserRecord,
  type RetirementRetentionDays,
} from './users-shared';

// Client / Server 共通の型・enum は `users-shared` から直接 import してください。
// このファイル（server-only）は副作用ロジックのみをエクスポートします。

// -----------------------------------------------------------------------------
// 例外
// -----------------------------------------------------------------------------

export type UserOperationErrorCode =
  | 'validation'
  | 'conflict'
  | 'forbidden'
  | 'not_found'
  | 'password_generation'
  | 'internal';

export class UserOperationError extends Error {
  constructor(
    public code: UserOperationErrorCode,
    public userMessage: string,
    cause?: unknown,
  ) {
    super(userMessage);
    this.name = 'UserOperationError';
    if (cause !== undefined) {
      // Error.cause を使う（v18+）
      (this as unknown as { cause?: unknown }).cause = cause;
    }
  }
}

// -----------------------------------------------------------------------------
// 一時パスワード生成
// -----------------------------------------------------------------------------

/**
 * 56 文字集合：紛らわしい文字（l, 1, L, I, O, 0）を除外した英大文字・小文字・数字。
 * 順序に意味はないが、読みやすさのため小文字→大文字→数字の順に並べる。
 */
const TEMP_PW_CHARSET =
  'abcdefghijkmnopqrstuvwxyz' + // 25 chars（`l` 除外）
  'ABCDEFGHJKMNPQRSTUVWXYZ' + // 23 chars（`I, L, O` 除外）
  '23456789'; // 8 chars（`0, 1` 除外）

const TEMP_PW_LENGTH = 14;
const TEMP_PW_MAX_ATTEMPTS = 20;

/**
 * 一時パスワードを生成する。
 * Supabase Password Strength `lower_upper_letters_digits` を満たすまで再生成。
 * 20 回の再生成で満たさなかった場合は `password_generation` エラーを投げる。
 */
export function generateTemporaryPassword(): string {
  for (let attempt = 0; attempt < TEMP_PW_MAX_ATTEMPTS; attempt++) {
    let pw = '';
    for (let i = 0; i < TEMP_PW_LENGTH; i++) {
      pw += TEMP_PW_CHARSET.charAt(randomInt(TEMP_PW_CHARSET.length));
    }
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) {
      return pw;
    }
  }
  throw new UserOperationError(
    'password_generation',
    '一時パスワードの生成に失敗しました。時間をおいて再度お試しください',
  );
}

// -----------------------------------------------------------------------------
// バリデーション
// -----------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new UserOperationError('validation', 'メールアドレスを入力してください');
  }
  const trimmed = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) {
    throw new UserOperationError('validation', 'メールアドレスの形式が正しくありません');
  }
  return trimmed;
}

export function validateDepartment(raw: unknown): Department {
  if (typeof raw !== 'string' || !DEPARTMENTS.includes(raw as Department)) {
    throw new UserOperationError('validation', '部署の値が正しくありません');
  }
  return raw as Department;
}

export function validateRole(raw: unknown): UserRole {
  if (typeof raw !== 'string' || !USER_ROLES.includes(raw as UserRole)) {
    throw new UserOperationError('validation', '権限の値が正しくありません');
  }
  return raw as UserRole;
}

export function validateAccountStatus(raw: unknown): AccountStatus {
  if (typeof raw !== 'string' || !ACCOUNT_STATUSES.includes(raw as AccountStatus)) {
    throw new UserOperationError('validation', 'アカウント状態の値が正しくありません');
  }
  return raw as AccountStatus;
}

export function validateRetentionDays(raw: unknown): RetirementRetentionDays {
  if (typeof raw !== 'number' || !RETIREMENT_RETENTION_DAYS.includes(raw as RetirementRetentionDays)) {
    throw new UserOperationError('validation', '保持期間は 30 日・90 日・1 年（365 日）から選択してください');
  }
  return raw as RetirementRetentionDays;
}

// -----------------------------------------------------------------------------
// 一覧
// -----------------------------------------------------------------------------

export async function listUsers(): Promise<AdminUserRecord[]> {
  const service = getServiceRoleClient();
  const { data, error } = await service
    .from('user_profiles')
    .select(
      'id, email, department, role, account_status, retirement_retention_deadline, password_changed, created_at, updated_at',
    )
    .order('created_at', { ascending: false });
  if (error) {
    throw new UserOperationError('internal', 'ユーザー一覧の取得に失敗しました', error);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    department: row.department as Department,
    role: row.role as UserRole,
    accountStatus: row.account_status as AccountStatus,
    retirementRetentionDeadline: (row.retirement_retention_deadline as string | null) ?? null,
    passwordChanged: row.password_changed as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

// -----------------------------------------------------------------------------
// 新規作成
// -----------------------------------------------------------------------------

export interface CreateUserInput {
  actor: Pick<AuthenticatedUser, 'id' | 'email'>;
  email: string;
  department: Department;
  role: UserRole;
}

export interface CreateUserResult {
  user: AdminUserRecord;
  temporaryPassword: string;
}

/**
 * 新規ユーザー作成
 *   1. email 重複チェック（user_profiles）
 *   2. 一時 PW 生成
 *   3. auth.admin.createUser（Supabase 側でポリシー拒否なら最大 3 回再生成）
 *   4. user_profiles.insert（失敗時は auth を巻き戻す）
 *   5. 監査ログ（平文 PW 含めない）
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const email = validateEmail(input.email);
  const department = validateDepartment(input.department);
  const role = validateRole(input.role);

  const service = getServiceRoleClient();

  // Step 1: email 重複チェック
  const { data: existing } = await service
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    throw new UserOperationError('conflict', '同じメールアドレスのユーザーが既に登録されています');
  }

  // Step 2-3: 一時PW 生成 + Supabase Auth 作成（拒否時最大 3 回再生成）
  let temporaryPassword = '';
  let createdAuthId: string | null = null;
  let lastAuthError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    temporaryPassword = generateTemporaryPassword();
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
    });
    if (!error && data.user) {
      createdAuthId = data.user.id;
      break;
    }
    lastAuthError = error;
    // 「A user with this email address has already been registered」等は再試行しても無駄なので即中断
    const msg = String(error?.message ?? '').toLowerCase();
    if (msg.includes('already') || msg.includes('exist')) {
      throw new UserOperationError(
        'conflict',
        '同じメールアドレスのユーザーが既に登録されています',
        error,
      );
    }
    // password ポリシー起因のみ再試行対象
    if (!msg.includes('password')) break;
  }
  if (!createdAuthId) {
    throw new UserOperationError(
      'internal',
      'ユーザーの認証情報の作成に失敗しました。時間をおいて再度お試しください',
      lastAuthError,
    );
  }

  // Step 4: user_profiles.insert（失敗時は auth をロールバック）
  const nowIso = new Date().toISOString();
  const { data: profileRow, error: insertErr } = await service
    .from('user_profiles')
    .insert({
      id: createdAuthId,
      email,
      department,
      role,
      account_status: 'active',
      password_changed: false,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(
      'id, email, department, role, account_status, retirement_retention_deadline, password_changed, created_at, updated_at',
    )
    .single();
  if (insertErr || !profileRow) {
    // ロールバック
    const { error: deleteErr } = await service.auth.admin.deleteUser(createdAuthId);
    if (deleteErr) {
      throw new UserOperationError(
        'internal',
        'ユーザーの登録に失敗し、認証情報の巻き戻しにも失敗しました。管理者に確認を依頼してください',
        { insertErr, deleteErr },
      );
    }
    throw new UserOperationError(
      'internal',
      'ユーザーの登録に失敗したため、認証情報を巻き戻しました。時間をおいて再度お試しください',
      insertErr,
    );
  }

  // Step 5: 監査ログ（平文 PW 含めない）
  try {
    await recordAdminActionStrict({
      actor: input.actor,
      action: 'create',
      targetType: 'user',
      targetId: createdAuthId,
      targetDepartment: department,
      details: {
        target_email: email,
        target_department: department,
        target_role: role,
        initiated_by: 'admin',
        // ★ 平文 PW は絶対に含めない
      },
    });
  } catch (auditErr) {
    // compensating：profile と auth の両方を巻き戻す
    await service.from('user_profiles').delete().eq('id', createdAuthId);
    await service.auth.admin.deleteUser(createdAuthId).catch(() => {});
    throw new UserOperationError(
      'internal',
      'ユーザー作成の記録に失敗したため、作成を取り消しました。時間をおいて再度お試しください',
      auditErr,
    );
  }

  return {
    user: {
      id: profileRow.id as string,
      email: profileRow.email as string,
      department: profileRow.department as Department,
      role: profileRow.role as UserRole,
      accountStatus: profileRow.account_status as AccountStatus,
      retirementRetentionDeadline: (profileRow.retirement_retention_deadline as string | null) ?? null,
      passwordChanged: profileRow.password_changed as boolean,
      createdAt: profileRow.created_at as string,
      updatedAt: profileRow.updated_at as string,
    },
    temporaryPassword,
  };
}

// -----------------------------------------------------------------------------
// 状態・属性の更新
// -----------------------------------------------------------------------------

export interface UpdateUserInput {
  actor: AuthenticatedUser;
  targetId: string;
  patch: {
    department?: Department;
    role?: UserRole;
    accountStatus?: AccountStatus;
    /** account_status='suspended_retired' への遷移時のみ利用 */
    retirementRetentionDays?: RetirementRetentionDays;
  };
}

async function fetchUserSnapshot(id: string): Promise<AdminUserRecord | null> {
  const service = getServiceRoleClient();
  const { data } = await service
    .from('user_profiles')
    .select(
      'id, email, department, role, account_status, retirement_retention_deadline, password_changed, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    email: data.email as string,
    department: data.department as Department,
    role: data.role as UserRole,
    accountStatus: data.account_status as AccountStatus,
    retirementRetentionDeadline: (data.retirement_retention_deadline as string | null) ?? null,
    passwordChanged: data.password_changed as boolean,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

/** 他に active な admin が 1 名以上いるかどうか */
async function hasOtherActiveAdmin(excludeId: string): Promise<boolean> {
  const service = getServiceRoleClient();
  const { count } = await service
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('account_status', 'active')
    .neq('id', excludeId);
  return (count ?? 0) > 0;
}

/**
 * 退職期限を計算（JST の当日 + N 日の 00:00:00 の date）
 * `date` 型カラム（timezone なし）なので YYYY-MM-DD 形式で返す
 */
function computeRetirementDeadline(now: Date, days: RetirementRetentionDays): string {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowInJst = new Date(now.getTime() + JST_OFFSET_MS);
  nowInJst.setUTCDate(nowInJst.getUTCDate() + days);
  const y = nowInJst.getUTCFullYear();
  const m = String(nowInJst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nowInJst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface UpdateUserResult {
  user: AdminUserRecord;
}

/**
 * ユーザー属性・状態を更新する。
 *   - 自分自身の active 以外への遷移を拒否（403）
 *   - 最後の active な admin の active 剥奪・admin ロール剥奪を拒否（403）
 *   - suspended_retired への遷移時は retirement_retention_deadline をセット
 *   - active への復帰時は retirement_retention_deadline を null にクリア
 *   - Auth 側の状態変更後は best-effort で signOut('global') を呼ぶ
 *   - 変更前後をスナップショットで監査ログに記録（Rollback 可能）
 */
export async function updateUser(input: UpdateUserInput): Promise<UpdateUserResult> {
  const service = getServiceRoleClient();

  const target = await fetchUserSnapshot(input.targetId);
  if (!target) {
    throw new UserOperationError('not_found', '対象のユーザーが見つかりませんでした');
  }

  const nextDepartment = input.patch.department ?? target.department;
  const nextRole = input.patch.role ?? target.role;
  const nextStatus = input.patch.accountStatus ?? target.accountStatus;

  // 変更点がない場合
  if (
    nextDepartment === target.department &&
    nextRole === target.role &&
    nextStatus === target.accountStatus
  ) {
    throw new UserOperationError(
      'conflict',
      '変更内容がありません。項目を変更してから保存してください',
    );
  }

  // ---- ガード 1: 自分自身の停止・削除予定化・降格拒否 ----
  if (input.actor.id === target.id) {
    if (nextStatus !== 'active') {
      throw new UserOperationError(
        'forbidden',
        '自分自身のアカウントを停止・削除予定にすることはできません',
      );
    }
    if (target.role === 'admin' && nextRole !== 'admin') {
      throw new UserOperationError(
        'forbidden',
        '自分自身の管理者権限を外すことはできません',
      );
    }
  }

  // ---- ガード 2: 最後の active な admin の active 剥奪・admin 降格拒否 ----
  const targetWasActiveAdmin = target.role === 'admin' && target.accountStatus === 'active';
  const becomesInactiveAdmin =
    targetWasActiveAdmin && (nextStatus !== 'active' || nextRole !== 'admin');
  if (becomesInactiveAdmin) {
    const hasBackup = await hasOtherActiveAdmin(target.id);
    if (!hasBackup) {
      throw new UserOperationError(
        'forbidden',
        '最後の管理者を停止・降格することはできません。先に別の管理者を作成してください',
      );
    }
  }

  // ---- retirement_retention_deadline の決定 ----
  let nextDeadline: string | null = target.retirementRetentionDeadline;
  if (nextStatus === 'suspended_retired') {
    // 退職への遷移時のみプルダウン値を必須にする
    // すでに retired 状態で他属性のみ変更する場合は据え置き
    if (target.accountStatus !== 'suspended_retired') {
      const days = input.patch.retirementRetentionDays;
      if (!days) {
        throw new UserOperationError(
          'validation',
          '退職に伴う保持期間（30 日・90 日・1 年）を選択してください',
        );
      }
      validateRetentionDays(days);
      nextDeadline = computeRetirementDeadline(new Date(), days);
    } else if (input.patch.retirementRetentionDays) {
      // すでに retired 中に期間を変更する場合
      const days = validateRetentionDays(input.patch.retirementRetentionDays);
      nextDeadline = computeRetirementDeadline(new Date(), days);
    }
  } else if (nextStatus === 'active') {
    // 復帰時は必ず null クリア
    nextDeadline = null;
  } else if (nextStatus === 'suspended_leave' || nextStatus === 'pending_deletion') {
    // 休職・削除予定は退職期限を持たない（要件 §3 は「退職」のみ保持期限）
    nextDeadline = null;
  }

  // ---- 更新実行 ----
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await service
    .from('user_profiles')
    .update({
      department: nextDepartment,
      role: nextRole,
      account_status: nextStatus,
      retirement_retention_deadline: nextDeadline,
      updated_at: nowIso,
    })
    .eq('id', target.id);
  if (updateErr) {
    throw new UserOperationError('internal', 'ユーザーの更新に失敗しました', updateErr);
  }

  // ---- 監査ログ（失敗時はスナップショットへ復元） ----
  try {
    await recordAdminActionStrict({
      actor: input.actor,
      action: 'update',
      targetType: 'user',
      targetId: target.id,
      targetDepartment: nextDepartment,
      details: {
        target_email: target.email,
        before: {
          department: target.department,
          role: target.role,
          account_status: target.accountStatus,
          retirement_retention_deadline: target.retirementRetentionDeadline,
        },
        after: {
          department: nextDepartment,
          role: nextRole,
          account_status: nextStatus,
          retirement_retention_deadline: nextDeadline,
        },
      },
    });
  } catch (auditErr) {
    // 復元
    await service
      .from('user_profiles')
      .update({
        department: target.department,
        role: target.role,
        account_status: target.accountStatus,
        retirement_retention_deadline: target.retirementRetentionDeadline,
        updated_at: target.updatedAt,
      })
      .eq('id', target.id);
    throw new UserOperationError(
      'internal',
      '更新の記録に失敗したため、変更を取り消しました。時間をおいて再度お試しください',
      auditErr,
    );
  }

  // ---- best-effort：状態が active でなくなった場合は全セッションを無効化 ----
  if (nextStatus !== 'active') {
    await bestEffortSignOutGlobal(target.id);
  }

  const updated = await fetchUserSnapshot(target.id);
  if (!updated) {
    throw new UserOperationError('internal', '更新後のユーザー情報を取得できませんでした');
  }
  return { user: updated };
}

// -----------------------------------------------------------------------------
// パスワード再発行
// -----------------------------------------------------------------------------

export interface ResetPasswordInput {
  actor: AuthenticatedUser;
  targetId: string;
}

export interface ResetPasswordResult {
  temporaryPassword: string;
  passwordChanged: false;
  targetEmail: string;
}

/**
 * パスワード再発行
 *   - 新しい一時 PW を生成
 *   - auth.admin.updateUserById で反映（Supabase 側で refresh_token 回転）
 *   - user_profiles.password_changed=false に戻す（初回パスワード変更フロー再誘導）
 *   - best-effort で signOut('global') も試行（既存 access_token も失効させる）
 *   - 監査ログには平文 PW を含めない
 */
export async function resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResult> {
  const service = getServiceRoleClient();

  const target = await fetchUserSnapshot(input.targetId);
  if (!target) {
    throw new UserOperationError('not_found', '対象のユーザーが見つかりませんでした');
  }

  // Supabase 側で拒否された場合の最大 3 回再試行
  let temporaryPassword = '';
  let lastAuthError: unknown = null;
  let ok = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    temporaryPassword = generateTemporaryPassword();
    const { error } = await service.auth.admin.updateUserById(target.id, {
      password: temporaryPassword,
    });
    if (!error) {
      ok = true;
      break;
    }
    lastAuthError = error;
    const msg = String(error.message ?? '').toLowerCase();
    if (!msg.includes('password')) break;
  }
  if (!ok) {
    throw new UserOperationError(
      'internal',
      'パスワードの再発行に失敗しました。時間をおいて再度お試しください',
      lastAuthError,
    );
  }

  // 初回パスワード変更フローに戻す
  const { error: profileErr } = await service
    .from('user_profiles')
    .update({
      password_changed: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);
  if (profileErr) {
    // profile 側の失敗は業務失敗扱い。ただし Auth 側の PW は既に変わっているため、
    // roll-forward はできない。管理者に「PW は変更済み・profile 更新失敗」を伝える
    throw new UserOperationError(
      'internal',
      'パスワード再発行後にユーザー情報の更新に失敗しました。管理者に確認を依頼してください',
      profileErr,
    );
  }

  // 監査ログ（平文 PW 含めない）
  try {
    await recordAdminActionStrict({
      actor: input.actor,
      action: 'password_change',
      targetType: 'user',
      targetId: target.id,
      targetDepartment: target.department,
      details: {
        target_email: target.email,
        initiated_by: 'admin',
        // ★ 平文 PW は絶対に含めない
      },
    });
  } catch (auditErr) {
    // 監査失敗時は「PW は既に変わっている」ため roll-back は難しい
    // → password_changed のみ true に戻すのも不整合。ここは正直に管理者へ通知
    throw new UserOperationError(
      'internal',
      'パスワード再発行の記録に失敗しました。管理者に確認を依頼してください',
      auditErr,
    );
  }

  // best-effort で既存セッション全体を無効化
  await bestEffortSignOutGlobal(target.id);

  return {
    temporaryPassword,
    passwordChanged: false,
    targetEmail: target.email,
  };
}

// -----------------------------------------------------------------------------
// セッション無効化ヘルパー
// -----------------------------------------------------------------------------

/**
 * Supabase JS v2 の admin API で対象ユーザーの全セッションを無効化する。
 * 失敗しても業務操作は成功扱いにする（呼び出し元で catch しない）。
 *
 * ★ 保険的な措置：
 *   - requireUser() が毎リクエストで account_status を再検証するため、状態変更後は
 *     signOut を呼ばなくても次のリクエストで拒否される
 *   - パスワード変更は Supabase Auth 側で refresh_token を自動回転するため、
 *     access_token 有効期限（デフォルト 1 時間）内は継続利用可能。signOut で即失効させる
 */
async function bestEffortSignOutGlobal(userId: string): Promise<void> {
  const service = getServiceRoleClient();
  try {
    // v2 の型定義に signOut(userId, scope) が含まれない環境向け：as で回避
    const admin = service.auth.admin as unknown as {
      signOut?: (jwt: string, scope?: 'global' | 'local') => Promise<{ error: unknown }>;
    };
    if (typeof admin.signOut === 'function') {
      await admin.signOut(userId, 'global');
    }
  } catch (err) {
    console.warn(
      '[admin/users] bestEffortSignOutGlobal failed (non-fatal):',
      (err as Error).message,
    );
  }
}
