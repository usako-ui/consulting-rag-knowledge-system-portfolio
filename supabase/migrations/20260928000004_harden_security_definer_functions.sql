-- ============================================================
-- 20260928000004_harden_security_definer_functions.sql
-- 目的：Supabase Advisors 対応（Day1・2026-09-28）
--   - function_search_path_mutable（set_updated_at）
--   - anon_security_definer_function_executable × 3
-- 参照：architecture.md §3（Advisors対応表）
-- ============================================================

-- set_updated_at の search_path を固定（WARN: function_search_path_mutable）
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- SECURITY DEFINER ヘルパー関数の EXECUTE を anon から剥奪
-- （authenticated のみに許可し、未ログインからの直接 RPC 呼び出しを防ぐ）
revoke execute on function public.current_user_department() from anon, public;
revoke execute on function public.current_user_role()       from anon, public;
revoke execute on function public.is_admin()                from anon, public;

grant execute on function public.current_user_department() to authenticated;
grant execute on function public.current_user_role()       to authenticated;
grant execute on function public.is_admin()                to authenticated;

comment on function public.current_user_department() is
  '現在ログイン中ユーザーの部署を返す。RLSポリシーから呼び出す想定。anonからは実行不可';
comment on function public.current_user_role() is
  '現在ログイン中ユーザーのロールを返す。RLSポリシーから呼び出す想定。anonからは実行不可';
comment on function public.is_admin() is
  '現在ログイン中ユーザーが管理者かを返す。RLSポリシーから呼び出す想定。anonからは実行不可';

-- search_document_chunks は認証済みユーザーのみ実行可能に
revoke execute on function public.search_document_chunks(vector, integer, department, integer, text) from anon, public;
grant execute on function public.search_document_chunks(vector, integer, department, integer, text) to authenticated;
