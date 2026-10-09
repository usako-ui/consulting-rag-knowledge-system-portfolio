-- ============================================================
-- 20260928000002_create_tables.sql
-- 目的：業務テーブルの作成
-- 参照：architecture.md §3, requirements.md §3〜§17
-- ============================================================

-- ------------------------------------------------------------
-- user_profiles：ユーザー・部署・ロール
-- ------------------------------------------------------------
-- Supabase Auth の auth.users を親とし、業務属性（部署・ロール等）はここで管理する
create table if not exists public.user_profiles (
  id                            uuid          primary key references auth.users(id) on delete cascade,
  email                         text          not null unique,
  department                    department    not null,
  role                          user_role     not null default 'general',
  account_status                account_status not null default 'active',
  retirement_retention_deadline date,                       -- 退職時保持期限（要件 §3）
  password_changed              boolean       not null default false,  -- 初回パスワード変更フラグ（要件 §3）
  created_at                    timestamptz   not null default now(),
  updated_at                    timestamptz   not null default now()
);

comment on table public.user_profiles is 'ユーザーの部署・ロール・アカウント状態（Supabase Auth拡張）';
comment on column public.user_profiles.retirement_retention_deadline is '退職時の保持期限。到達後、管理者が削除可能（要件 §3）';
comment on column public.user_profiles.password_changed is '初回ログイン後にパスワード変更済みかを示す（要件 §3）';

-- ------------------------------------------------------------
-- documents：文書マスタ（要件 §5）
-- ------------------------------------------------------------
create table if not exists public.documents (
  id            uuid        primary key default gen_random_uuid(),
  department    department  not null,
  title         text        not null,
  file_id       text        not null,     -- 元ファイル一意識別子（パス由来等）
  content_hash  text        not null,     -- 内容SHA-256ハッシュ
  created_year  integer,                  -- メタデータ：作成年
  client_name   text,                     -- メタデータ：客先名
  is_active     boolean     not null default true,  -- 現在有効な最新版か
  page_count    integer,
  file_size_bytes bigint,
  created_by    uuid        references public.user_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_by    uuid        references public.user_profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  -- 要件 §5：ファイル名だけで一意識別しない。file_id + content_hash で重複防止
  constraint documents_file_content_unique unique (file_id, content_hash)
);

create index if not exists documents_department_active_idx on public.documents (department) where is_active = true;
create index if not exists documents_created_year_idx on public.documents (created_year);
create index if not exists documents_client_name_idx on public.documents (client_name);

comment on table public.documents is '文書マスタ。ファイルID+内容ハッシュで一意識別（要件 §5）';

-- ------------------------------------------------------------
-- document_chunks：チャンク・Embedding（要件 §6・§7）
-- ------------------------------------------------------------
-- Gemini text-embedding-004 = 768次元
create table if not exists public.document_chunks (
  id             uuid        primary key default gen_random_uuid(),
  document_id    uuid        not null references public.documents(id) on delete cascade,
  department     department  not null,  -- RLSフィルタ用に非正規化
  title          text        not null,  -- 表示用に非正規化
  page_number    integer,
  section_title  text,
  content        text        not null,
  embedding      vector(768),
  created_at     timestamptz not null default now()
);

create index if not exists document_chunks_document_id_idx on public.document_chunks (document_id);
create index if not exists document_chunks_department_idx on public.document_chunks (department);
-- ベクトル検索用インデックス（ivfflat・コサイン距離）。データ登録後に本番相当パラメータで再作成想定
create index if not exists document_chunks_embedding_idx
  on public.document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

comment on table public.document_chunks is 'セクション単位チャンク＋Embedding（要件 §6）';
comment on column public.document_chunks.department is 'RLSフィルタ用に documents.department を非正規化';

-- ------------------------------------------------------------
-- ingestion_log：取り込みログ（要件 §13〜§15）
-- ------------------------------------------------------------
create table if not exists public.ingestion_log (
  id             uuid              primary key default gen_random_uuid(),
  document_id    uuid              references public.documents(id) on delete set null,
  file_id        text              not null,
  status         ingestion_status  not null default 'pending',
  error_message  text,              -- ユーザー本文・APIキーは記録しない（要件 §4・§16）
  error_code     text,              -- 内部エラー分類（英語カラム。UIには出さない）
  retry_count    integer           not null default 0,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz       not null default now()
);

create index if not exists ingestion_log_status_created_idx on public.ingestion_log (status, created_at desc);
create index if not exists ingestion_log_document_id_idx on public.ingestion_log (document_id);

comment on table public.ingestion_log is '文書取り込み処理のログ。3回まで自動リトライ、超過で管理者通知（要件 §15）';

-- ------------------------------------------------------------
-- api_usage_log：API利用量ログ（要件 §17）
-- ------------------------------------------------------------
create table if not exists public.api_usage_log (
  id             uuid        primary key default gen_random_uuid(),
  provider       text        not null,  -- 'gemini' | 'claude'
  api_type       text        not null,  -- 'llm' | 'embedding'
  request_count  integer     not null default 1,
  token_count    integer     not null default 0,
  occurred_at    timestamptz not null default now()
);

create index if not exists api_usage_log_occurred_idx on public.api_usage_log (occurred_at desc);
create index if not exists api_usage_log_provider_idx on public.api_usage_log (provider, api_type);

comment on table public.api_usage_log is 'API使用量集計用。ゲージ表示・アラート判定に使用（要件 §17）';

-- ------------------------------------------------------------
-- audit_log：監査ログ（要件 §16）
-- ------------------------------------------------------------
create table if not exists public.audit_log (
  id                uuid         primary key default gen_random_uuid(),
  actor_id          uuid         references public.user_profiles(id) on delete set null,
  actor_email       text,        -- actor削除後も追跡可能にするためスナップショット保持
  action_type       audit_action not null,
  target_type       text,        -- 'document' | 'user' | 'setting' | 'search_query' 等
  target_id         uuid,
  target_department department,
  details           jsonb        not null default '{}'::jsonb,  -- 機密情報は含めない（要件 §16）
  ip_address        inet,
  created_at        timestamptz  not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);
create index if not exists audit_log_action_type_idx on public.audit_log (action_type);

comment on table public.audit_log is '監査ログ。デフォルト30日保存、設定可（要件 §16）。資料本文・APIキーは記録しない';

-- ------------------------------------------------------------
-- system_settings：システム設定（ログ保存期間等）
-- ------------------------------------------------------------
create table if not exists public.system_settings (
  key         text        primary key,
  value       text        not null,
  updated_by  uuid        references public.user_profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

comment on table public.system_settings is '管理者がUIから変更する設定値。環境変数はデフォルト値としてのみ使用（requirements.md §33）';

-- 初期値：ログ保存日数（デフォルト30）
insert into public.system_settings (key, value)
values ('log_retention_days', '30')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- updated_at 自動更新トリガー
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();
