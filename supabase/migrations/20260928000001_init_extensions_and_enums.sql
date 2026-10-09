-- ============================================================
-- 20260928000001_init_extensions_and_enums.sql
-- 目的：拡張機能の有効化と共通ENUM型の定義
-- 参照：architecture.md §3, requirements.md §3・§5・§14・§15
-- ============================================================

-- pgvector 拡張（ベクトル類似度検索用）
create extension if not exists vector;

-- 部署ENUM（6部署固定：戦略/業務/IT/人事/営業/管理）
-- 検証スコープは4部署（strategy/hr/it/sales）だが、権限ロジックは6部署分実装する（requirements.md §10）
do $$ begin
  create type department as enum (
    'strategy',    -- 戦略
    'business',    -- 業務
    'it',          -- IT
    'hr',          -- 人事
    'sales',       -- 営業
    'management'   -- 管理
  );
exception when duplicate_object then null; end $$;

-- ユーザーロール（一般 / 管理者）
do $$ begin
  create type user_role as enum ('general', 'admin');
exception when duplicate_object then null; end $$;

-- アカウント状態（有効 / 休職 / 退職一時停止 / 削除予定）
do $$ begin
  create type account_status as enum (
    'active',
    'suspended_leave',
    'suspended_retired',
    'pending_deletion'
  );
exception when duplicate_object then null; end $$;

-- 取り込み処理状態（要件 §14）
do $$ begin
  create type ingestion_status as enum (
    'pending',    -- 待機中
    'processing', -- 処理中
    'success',    -- 完了
    'failed',     -- 失敗
    'retrying'    -- 再試行中
  );
exception when duplicate_object then null; end $$;

-- 監査ログのアクション種別
do $$ begin
  create type audit_action as enum (
    'create',
    'update',
    'delete',
    'search',
    'setting_change',
    'login',
    'logout',
    'password_change'
  );
exception when duplicate_object then null; end $$;
