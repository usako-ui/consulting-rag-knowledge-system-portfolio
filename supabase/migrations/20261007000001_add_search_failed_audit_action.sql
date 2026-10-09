-- G-7: 検索失敗を audit_log に記録するための audit_action 追加
-- requirements.md §15・§19（G-6・G-7 解消策）
-- 既存の 'search' は成功記録に使用継続。'search_failed' を失敗専用として追加。
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'search_failed';
