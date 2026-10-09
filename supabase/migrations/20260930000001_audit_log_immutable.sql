-- ============================================================
-- 20260930000001_audit_log_immutable.sql
-- 目的：audit_log を管理者を含め Web/API 経路から改ざん不能にする
-- 参照：requirements.md §16（監査ログ）, tasks.md Day6 Phase 1 PM Item 6
--
-- 変更前：audit_log_admin_only ポリシーが ALL に適用され、
--         管理者は UPDATE / DELETE も可能だった（改ざん余地あり）
-- 変更後：認証済みユーザーは SELECT のみ（管理者のみ）。INSERT/UPDATE/DELETE は
--         service_role からの直接呼び出し（RLS バイパス）以外できない。
--         これにより、Route Handler で service_role を使う経路（recordAdminAction 等）
--         と GHA 相乗り cleanup ジョブ以外からは絶対に変更・削除できなくなる。
-- ============================================================

-- 既存の ALL ポリシーを削除
drop policy if exists audit_log_admin_only on public.audit_log;

-- 管理者のみ SELECT 可能（改ざん防止のため read-only）
create policy audit_log_admin_select on public.audit_log
  for select
  using (public.is_admin());

-- INSERT/UPDATE/DELETE ポリシーは意図的に作成しない。
-- これにより：
--   * 認証済みユーザー（admin 含む）は INSERT/UPDATE/DELETE を実行できない
--   * service_role キーで接続したサーバーコード（recordAdminAction / 監査 cleanup ジョブ）のみ書き込み可能
--   * 監査ログの一貫性・改ざん防止を DB レベルで保証

comment on policy audit_log_admin_select on public.audit_log is
  '管理者のみ SELECT 可能。INSERT/UPDATE/DELETE は service_role でのみ可能（改ざん防止）';
