/**
 * 監査ログ details の機密情報 sanitize（ネスト対応）
 * 参照：requirements.md §16
 *
 * サーバー側・テスト両方から使えるよう `server-only` を持たないファイルに分離。
 * 実行時に details 内の禁止キー（password / api_key / token / secret 等）を
 * `[REDACTED]` に置換する。実装者が誤って含めても最終防衛線として動作。
 */

const FORBIDDEN_KEYS = new Set([
  'password',
  'newpassword',
  'temporarypassword',
  'temppw',
  'plaintext',
  'apikey',
  'api_key',
  'token',
  'secret',
  'signing_secret',
  'authorization',
]);

export function sanitizeDeep(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((v) => sanitizeDeep(v));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        out[key] = '[REDACTED]';
        continue;
      }
      out[key] = sanitizeDeep(value);
    }
    return out;
  }
  return input;
}
