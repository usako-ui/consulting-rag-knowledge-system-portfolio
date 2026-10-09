-- ingestion_log に content_hash 列を追加
-- 取り込み前の重複判定（upload-url での SHA-256 チェック）に使用
alter table public.ingestion_log
  add column if not exists content_hash text;

-- 同一 content_hash が active 状態（pending / processing / retrying）で
-- 複数登録されないよう部分一意インデックスを設定（連打・同時送信の競合防止）
-- NULL は一意制約の対象外（明示的に除外）
create unique index if not exists ingestion_log_content_hash_active_idx
  on public.ingestion_log (content_hash)
  where content_hash is not null
    and status in ('pending', 'processing', 'retrying');
