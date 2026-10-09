-- ============================================================
-- 20261007000002_add_storage_columns.sql
-- 目的：Storage 直接アップロード対応（段階1）
-- 参照：requirements.md §2・§13・§14, architecture.md §3
-- 承認：PM 2026-10-07
-- ============================================================

-- ------------------------------------------------------------
-- ingestion_log：Storage アップロード管理列追加
-- ------------------------------------------------------------
alter table public.ingestion_log
  add column if not exists storage_path    text,
  add column if not exists source          text        not null default 'testdocs',
  add column if not exists file_size_bytes bigint,
  add column if not exists uploaded_by     uuid        references public.user_profiles(id) on delete set null,
  add column if not exists department      department,
  add column if not exists title           text,
  add column if not exists created_year    integer,
  add column if not exists client_name     text;

comment on column public.ingestion_log.storage_path    is 'Storage アップロード経路のみ設定。testdocs 経路では null';
comment on column public.ingestion_log.source          is 'testdocs（GHA ローカル）または web（ブラウザアップロード）';
comment on column public.ingestion_log.file_size_bytes is 'アップロード時のファイルサイズ（バイト）';
comment on column public.ingestion_log.uploaded_by     is 'web アップロード実行者の user_profiles.id';
comment on column public.ingestion_log.department      is 'web アップロード時のメタデータ（GHA 側で documents に渡す）';
comment on column public.ingestion_log.title           is 'web アップロード時のメタデータ';
comment on column public.ingestion_log.created_year    is 'web アップロード時のメタデータ';
comment on column public.ingestion_log.client_name     is 'web アップロード時のメタデータ';

-- ------------------------------------------------------------
-- documents：原本 Storage パス
-- ------------------------------------------------------------
alter table public.documents
  add column if not exists storage_path text;

comment on column public.documents.storage_path is '原本ファイルの Storage パス（web アップロード経路のみ）';

-- ------------------------------------------------------------
-- ingestion_log RLS 更新：web アップロード pending 行も本人が読めるよう拡張
-- （旧ポリシーは document_id が null の pending 行を一般ユーザーが閲覧できなかった）
-- ------------------------------------------------------------
drop policy if exists ingestion_log_select_own_dept_or_admin on public.ingestion_log;
create policy ingestion_log_select_own_dept_or_admin on public.ingestion_log
  for select
  using (
    public.is_admin()
    or uploaded_by = auth.uid()
    or exists (
      select 1 from public.documents d
      where d.id = ingestion_log.document_id
        and d.department = public.current_user_department()
    )
  );

-- ------------------------------------------------------------
-- Supabase Storage バケット作成
-- file_size_limit = 20971520 (20MB)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rag-documents',
  'rag-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;
