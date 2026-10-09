-- upload-complete サーバー側 dispatch 失敗を audit_log に記録するための audit_action 追加
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'dispatch_failed';
