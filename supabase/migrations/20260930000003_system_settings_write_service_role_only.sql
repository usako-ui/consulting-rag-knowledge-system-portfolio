-- ============================================================
-- 20260930000003_system_settings_write_service_role_only.sql
-- 目的：system_settings への書き込みを service_role 経由のみに制限
-- 参照：requirements.md §12・§16, tasks.md Day6 Phase 3 PM Item 7
--
-- 変更前：
--   * SELECT: 認証済み全員（system_settings_read_all）
--   * ALL:    管理者のみ（system_settings_write_admin）
--     → 管理者は anon 経由で直接 update 可能・updateMonthlyApiBudget（監査ログ付き）
--        をバイパスできてしまう
--
-- 変更後：
--   * SELECT: 認証済み全員（維持）
--   * INSERT/UPDATE/DELETE: 認証済みクライアントからは不可（policy を持たない）
--     → service_role キー経由の Route Handler（updateMonthlyApiBudget 等）のみ変更可能
--     → 変更は必ず recordAdminActionStrict の監査ログ記録を通る
-- ============================================================

drop policy if exists system_settings_write_admin on public.system_settings;

comment on table public.system_settings is
  '管理者がUIから変更する設定値。読み取りは認証済み全員可・書き込みは service_role のみ（updateMonthlyApiBudget 等の Route Handler 経由・監査ログ強制）';
