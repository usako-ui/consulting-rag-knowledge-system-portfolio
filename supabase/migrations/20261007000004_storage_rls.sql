-- ============================================================
-- 20261007000004_storage_rls.sql
-- 目的：rag-documents バケットへの直接クライアントアクセスを明示的に拒否
-- 参照：requirements.md §4（権限制御）, architecture.md §3（Storage 設計）
-- 承認：PM 2026-10-07（T-28 コードレビュー指摘対応）
-- ============================================================
--
-- Supabase Storage では storage.objects テーブルに対して RLS が有効化されており、
-- 許可ポリシーが存在しない行へのアクセスは PostgreSQL RLS の標準動作によって
-- デフォルトで拒否される。
--
-- このマイグレーションでは「明示的な拒否」ポリシーを追加し、以下の意図を明確にする：
--   - authenticated / anon ロールによる直接 SELECT/INSERT/UPDATE/DELETE を禁止
--   - アクセスを許可するのは以下のみ：
--     1. service_role（RLS をバイパス）:
--        サーバー側 API（upload-url・upload-complete・runner.ts）が使用
--     2. 署名付き URL（time-limited token）:
--        ブラウザが PUT でファイルをアップロードする際のみ使用
--
-- 注意：USING (false) は storage.objects の全行に適用される（バケット横断）。
--       本プロジェクトでは rag-documents のみを使用するため問題ない。
--       将来別バケットへの直接クライアントアクセスが必要な場合は、
--       その用途専用の許可ポリシーを別マイグレーションで追加すること。
-- ============================================================

create policy "rag_documents_deny_direct_access"
  on storage.objects
  for all to authenticated, anon
  using (false)
  with check (false);
