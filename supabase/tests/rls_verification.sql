-- ============================================================
-- supabase/tests/rls_verification.sql
-- 目的：Day1完了条件（tasks.md）「別部署の2ユーザーで互いのデータが見えないこと」
--       requirements.md §34 の監視SQLに準拠したRLS越境テスト
-- 実行方法：Supabase Dashboard の SQL Editor で、テスト用ユーザーとしてログイン中に実行
--            または psql で JWT を差し替えて実行
-- ============================================================

-- ------------------------------------------------------------
-- 準備：テスト用ユーザーを2人作成（Supabase Auth 経由で事前作成しておく）
-- 例：
--   alice@example.com / 部署 = 'strategy' / role = 'general'
--   bob@example.com   / 部署 = 'hr'       / role = 'general'
--   admin@example.com / 部署 = 'management' / role = 'admin'
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Test 1：alice (strategy) は strategy 部署の文書のみ見える
-- ------------------------------------------------------------
-- alice でログインした状態で以下を実行：
-- select department, count(*)
-- from public.documents
-- group by department;
-- → strategy の行のみが返ること（他部署は0件も含めて出てこない）

-- ------------------------------------------------------------
-- Test 2：alice は bob の部署（hr）の chunks を取得できない
-- ------------------------------------------------------------
-- alice でログインした状態：
-- select * from public.document_chunks where department = 'hr';
-- → 0件が返ること（RLSにより自動フィルタ）

-- ------------------------------------------------------------
-- Test 3：admin は全部署の文書が見える
-- ------------------------------------------------------------
-- admin でログインした状態：
-- select department, count(*)
-- from public.documents
-- group by department
-- order by department;
-- → 6部署すべてがカウントに現れる（データがある部署のみ表示）

-- ------------------------------------------------------------
-- Test 4：一般ユーザーは削除不可（RLS で拒否）
-- ------------------------------------------------------------
-- alice でログインした状態：
-- delete from public.documents where department = 'strategy';
-- → 0 rows affected（RLS により拒否）または権限エラー

-- ------------------------------------------------------------
-- Test 5：requirements.md §34 準拠 - 部署越境テスト
-- ------------------------------------------------------------
-- alice でログインし、bob のユーザーIDを直接指定：
-- select * from public.document_chunks
-- where department <> (select department from public.user_profiles where id = auth.uid());
-- → 0件（自部署以外は見えない）

-- ------------------------------------------------------------
-- Test 6：user_profiles の可視性
-- ------------------------------------------------------------
-- alice でログイン：
-- select id, email, department from public.user_profiles;
-- → alice 自身の1行のみ返ること

-- admin でログイン：
-- select id, email, department from public.user_profiles;
-- → 全ユーザーが返ること

-- ------------------------------------------------------------
-- Test 7：ヘルパー関数の動作確認
-- ------------------------------------------------------------
-- ログイン中の任意ユーザーで：
-- select
--   public.current_user_department() as my_dept,
--   public.current_user_role()       as my_role,
--   public.is_admin()                as am_i_admin;

-- ------------------------------------------------------------
-- 期待結果まとめ
-- ------------------------------------------------------------
-- | # | 実行者 | 期待結果                          |
-- |---|--------|-----------------------------------|
-- | 1 | alice  | strategy 部署のみ表示             |
-- | 2 | alice  | hr の chunks は 0件               |
-- | 3 | admin  | 全部署（データありのもの）が表示  |
-- | 4 | alice  | 削除失敗                          |
-- | 5 | alice  | 自部署以外の chunks は 0件        |
-- | 6 | alice  | 自分の profile 1行のみ            |
-- | 6 | admin  | 全 profile 表示                   |
-- | 7 | 任意   | 関数がユーザー属性を正しく返す    |
