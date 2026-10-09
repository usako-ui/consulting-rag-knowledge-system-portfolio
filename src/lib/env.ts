/**
 * 環境変数の一元アクセス
 * 参照：requirements.md §33
 *
 * ★ このモジュール以外から process.env を直接参照しないこと（マスキング・型安全のため）
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`環境変数 ${name} が未設定です。.env を確認してください`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

/** サーバー側でのみ参照（クライアントバンドルに露出させない） */
export const serverEnv = {
  supabaseUrl: () => required('SUPABASE_URL'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  geminiApiKey: () => required('GEMINI_API_KEY'),
  slackBotToken: () => required('SLACK_BOT_TOKEN'),
  slackSigningSecret: () => required('SLACK_SIGNING_SECRET'),
  logRetentionDaysDefault: () => Number(optional('LOG_RETENTION_DAYS', '30')),
  // 要件§2 の本番基準は 20MB。検証環境（Vercel Hobby Route Handler経由）は環境変数で 4 に上書きする
  maxFileSizeMb: () => Number(optional('MAX_FILE_SIZE_MB', '20')),
  githubDispatchToken: () => required('GITHUB_DISPATCH_TOKEN'),
  githubRepo: () => required('GITHUB_REPO'),
  storageBucket: () => optional('SUPABASE_STORAGE_BUCKET', 'rag-documents'),
  slackFallbackMs: () => {
    const raw = optional('SLACK_FALLBACK_MS', '');
    const v = Number(raw);
    // 未設定・空文字・非数値・1000未満・30000超はすべて 30000 にフォールバック
    // （打ち間違いで本番の Slack 応答が止まらないよう throw しない設計）
    if (!Number.isFinite(v) || v < 1_000 || v > 30_000) return 30_000;
    return v;
  },
};

/** クライアント（ブラウザ）と共有される公開値のみ */
export const publicEnv = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  /**
   * Slack 誘導リンク・出典リンク等で使う Web の公開 URL。
   *
   * 本番（NODE_ENV=production）で未設定 or localhost の場合は throw する
   * （QA SHOULD-3：Vercel デプロイ時の設定漏れで Slack 上に localhost リンクが
   *  露出することを防ぐ）。開発時は http://localhost:3000 にフォールバック。
   */
  webAppUrl: () => {
    const raw = process.env.WEB_APP_URL;
    const value = raw && raw.length > 0 ? raw : 'http://localhost:3000';
    if (process.env.NODE_ENV === 'production' && (!raw || /^https?:\/\/localhost/i.test(value))) {
      throw new Error(
        '環境変数 WEB_APP_URL が本番環境で未設定または localhost です。' +
          'Slack 誘導リンクが破綻するため、Vercel の環境変数を確認してください',
      );
    }
    return value;
  },
};
