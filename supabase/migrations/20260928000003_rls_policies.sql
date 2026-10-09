-- ============================================================
-- 20260928000003_rls_policies.sql
-- 目的：Row Level Security（RLS）ポリシーの実装
-- 参照：architecture.md §2・§3, requirements.md §4
-- 方針：一般ユーザーは自部署のみ／管理者は全部署。ただし RLS 単独に依存せず、
--       サーバー側でも認可チェックを行う二重防御（CLAUDE.md §6）。
-- ============================================================

-- ------------------------------------------------------------
-- ヘルパー関数：現在ログイン中ユーザーの部署 / ロール
-- security definer で auth.uid() を解決し、user_profiles を参照
-- ------------------------------------------------------------
create or replace function public.current_user_department()
returns department
language sql
stable
security definer
set search_path = public
as $$
  select department from public.user_profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.user_profiles where id = auth.uid()), false);
$$;

-- ============================================================
-- user_profiles
-- ============================================================
alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select_self_or_admin on public.user_profiles;
create policy user_profiles_select_self_or_admin on public.user_profiles
  for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists user_profiles_update_self_or_admin on public.user_profiles;
create policy user_profiles_update_self_or_admin on public.user_profiles
  for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- INSERT は管理者のみ（ユーザー登録は管理画面から）
drop policy if exists user_profiles_insert_admin on public.user_profiles;
create policy user_profiles_insert_admin on public.user_profiles
  for insert
  with check (public.is_admin());

-- DELETE は管理者のみ
drop policy if exists user_profiles_delete_admin on public.user_profiles;
create policy user_profiles_delete_admin on public.user_profiles
  for delete
  using (public.is_admin());

-- ============================================================
-- documents
-- ============================================================
alter table public.documents enable row level security;

drop policy if exists documents_select_own_dept_or_admin on public.documents;
create policy documents_select_own_dept_or_admin on public.documents
  for select
  using (department = public.current_user_department() or public.is_admin());

drop policy if exists documents_insert_own_dept_or_admin on public.documents;
create policy documents_insert_own_dept_or_admin on public.documents
  for insert
  with check (department = public.current_user_department() or public.is_admin());

drop policy if exists documents_update_own_dept_or_admin on public.documents;
create policy documents_update_own_dept_or_admin on public.documents
  for update
  using (department = public.current_user_department() or public.is_admin())
  with check (department = public.current_user_department() or public.is_admin());

-- DELETE は管理者のみ（要件 §5）
drop policy if exists documents_delete_admin_only on public.documents;
create policy documents_delete_admin_only on public.documents
  for delete
  using (public.is_admin());

-- ============================================================
-- document_chunks
-- ============================================================
alter table public.document_chunks enable row level security;

drop policy if exists document_chunks_select_own_dept_or_admin on public.document_chunks;
create policy document_chunks_select_own_dept_or_admin on public.document_chunks
  for select
  using (department = public.current_user_department() or public.is_admin());

-- INSERT/UPDATE/DELETE はサーバー側（service_role）から実施
drop policy if exists document_chunks_insert_admin on public.document_chunks;
create policy document_chunks_insert_admin on public.document_chunks
  for insert
  with check (public.is_admin());

drop policy if exists document_chunks_update_admin on public.document_chunks;
create policy document_chunks_update_admin on public.document_chunks
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists document_chunks_delete_admin on public.document_chunks;
create policy document_chunks_delete_admin on public.document_chunks
  for delete
  using (public.is_admin());

-- ============================================================
-- ingestion_log
-- ============================================================
alter table public.ingestion_log enable row level security;

-- 一般ユーザーは自部署の文書に紐づくログのみ閲覧可
drop policy if exists ingestion_log_select_own_dept_or_admin on public.ingestion_log;
create policy ingestion_log_select_own_dept_or_admin on public.ingestion_log
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = ingestion_log.document_id
        and d.department = public.current_user_department()
    )
  );

-- INSERT/UPDATEはサーバー側（service_role）で実施
drop policy if exists ingestion_log_write_admin on public.ingestion_log;
create policy ingestion_log_write_admin on public.ingestion_log
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- api_usage_log
-- ============================================================
alter table public.api_usage_log enable row level security;

-- 閲覧は管理者のみ（要件 §17）
drop policy if exists api_usage_log_admin_only on public.api_usage_log;
create policy api_usage_log_admin_only on public.api_usage_log
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- audit_log
-- ============================================================
alter table public.audit_log enable row level security;

-- 閲覧は管理者のみ（要件 §16）
drop policy if exists audit_log_admin_only on public.audit_log;
create policy audit_log_admin_only on public.audit_log
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- system_settings
-- ============================================================
alter table public.system_settings enable row level security;

drop policy if exists system_settings_read_all on public.system_settings;
create policy system_settings_read_all on public.system_settings
  for select
  using (auth.uid() is not null);

drop policy if exists system_settings_write_admin on public.system_settings;
create policy system_settings_write_admin on public.system_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 権限内ベクトル検索用のRPC（RLSを経由して検索）
-- サーバー側のRAG検索APIから呼び出す。呼び出し側でも認可チェックすること。
-- ============================================================
create or replace function public.search_document_chunks(
  query_embedding vector(768),
  match_count     integer default 5,
  department_filter department default null,
  year_filter     integer default null,
  client_filter   text default null
)
returns table (
  chunk_id      uuid,
  document_id   uuid,
  department    department,
  title         text,
  page_number   integer,
  section_title text,
  content       text,
  similarity    real
)
language sql
stable
security invoker  -- 呼び出し元セッションのRLSを適用（越境防止）
set search_path = public
as $$
  select
    c.id            as chunk_id,
    c.document_id,
    c.department,
    c.title,
    c.page_number,
    c.section_title,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  inner join public.documents d on d.id = c.document_id and d.is_active = true
  where
    (department_filter is null or c.department = department_filter)
    and (year_filter is null or d.created_year = year_filter)
    and (client_filter is null or d.client_name = client_filter)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.search_document_chunks is
  '権限内ベクトル検索。security invoker により RLS が適用され、部署越境が自動で防止される';
