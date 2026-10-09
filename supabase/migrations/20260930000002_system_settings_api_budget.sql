-- ============================================================
-- 20260930000002_system_settings_api_budget.sql
-- 目的：管理者ダッシュボードの API 使用量ゲージ用「月間予算」を system_settings に登録
-- 参照：requirements.md §17（API使用量）・§24（プロバイダ非依存構成）
--        architecture.md §7・§0.5, tasks.md Day6 Phase 3 PM 判断（選択肢 B 採用）
--
-- 設計方針（2026-09-30 PM 判断）：
--   - Google 公式が Free tier の RPM/TPM/RPD/月間 数値を非公開のため、
--     「管理者が設定する月間予算」を 100% とするゲージに変更する
--   - キー名はプロバイダ非依存（monthly_api_budget_tokens）
--     将来 Claude API へ切替時も、Gemini でも同キーで運用可能
--   - 初期値は開発環境用の仮の値。運用時はクライアントと相談して調整する
-- ============================================================

-- 月間予算（トークン数）。0-69%緑 / 70-89%黄 / 90-99%橙 / 100%赤
insert into public.system_settings (key, value)
values ('monthly_api_budget_tokens', '1000000')
on conflict (key) do nothing;

comment on column public.system_settings.value is
  'monthly_api_budget_tokens は管理者が設定する月間 API 使用量の予算（tokens 単位・プロバイダ非依存）。ゲージの 100% 基準として使用。';
