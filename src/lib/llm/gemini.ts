/**
 * Gemini プロバイダ実装
 * 参照：requirements.md §7・§8・§24, architecture.md §6「検索・回答フロー」
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  EmbeddingInput,
  EmbeddingResult,
  GenerateAnswerInput,
  GenerateAnswerResult,
  LlmProvider,
} from './types';
import { LlmProviderError } from './types';

// 2026-09-29 実装確認：現在の Gemini API で embedContent 対応は
//   `gemini-embedding-001` / `gemini-embedding-2` のみ。text-embedding-004 は 404 になる。
// gemini-embedding-001 は既定 3072 次元だが outputDimensionality=768 で DB スキーマに整合。
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_OUTPUT_DIMENSIONS = 768;
// 2026-09-29 実装確認：新規ユーザー向けに 2.5 系は全て廃止。3.x 系のみ利用可
//   - gemini-2.5-flash / 2.5-flash-lite → 404（新規ユーザー向けに廃止）
//   - gemini-3.8-flash → 503 頻発（Google 推奨だが高需要）
//   - gemini-3.5-flash-lite → 軽量版・可用性◎・無料枠 RPM=5 内で安定利用可
// Recall@5 検証には lite で十分。精度重視シーンでは pro 系に切替可
const CHAT_MODEL = 'gemini-3.5-flash-lite';

/** 503/429 のリトライ設定：無料枠の RPM=5 と一時的な高需要に対応 */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000; // 2s → 4s → 8s（合計最大14秒）

// ハルシネーション対策：根拠判定を強制する厳格プロンプト
const ANSWER_SYSTEM_PROMPT = `あなたはコンサルティング会社の社内ナレッジ検索AIです。
以下の【厳守ルール】を必ず守り、【出力形式】に従って回答してください。

【厳守ルール】
1. 与えられた「参考文書」に明示的に書かれている内容のみを根拠に回答すること
   - 質問文の用語と同義の記載も、明示的根拠として認めてよい
   - 認められる同義語の具体例（他は認めない）：
     * 「コスト削減」⇔「ROI改善」「投資対効果向上」「販促ROIの可視化」等
   - 「効率化」「最適化」等の汎用的すぎる語は、無関係な文脈でも頻出するため同義語として認めない
   - 拡大解釈は禁止。文脈上明らかに同じ経済的意義を持つもののみを同義とみなす
2. 参考文書に根拠がない・不十分な場合は、絶対に推測で回答しないこと
3. 「たぶん」「おそらく」「〜と思われる」等の推測表現を使わないこと
4. 参考文書から回答できない場合は grounding_sufficient を false にすること
5. 引用した参考文書の番号を used_context_indexes に配列で明示すること

【出力形式（必ずJSONで返す）】
{
  "grounding_sufficient": boolean,
  "answer": string,
  "reason": string,
  "used_context_indexes": number[]
}

- grounding_sufficient=true の場合：answer に日本語で明快な回答を書き、used_context_indexes に根拠となった文書番号を入れる
- grounding_sufficient=false の場合：answer は「登録されている資料から該当する情報が見つかりませんでした。」に固定し、reason に不足理由を短く書く`;

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new LlmProviderError('gemini', 'auth', 'GEMINI_API_KEY が設定されていません');
  }
  return new GoogleGenerativeAI(key);
}

/** 503 (Service Unavailable) / 429 (Rate Limit) のみリトライ対象と判定 */
function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\[(503|429)/.test(msg) || /overloaded|Service Unavailable|Too Many Requests|quota/i.test(msg);
}

/** Exponential backoff リトライ実行 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES || !isRetryableError(err)) throw err;
      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(
        `[gemini] retryable error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), waiting ${waitMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastErr;
}

export const geminiProvider: LlmProvider = {
  name: 'gemini',

  async embed(input: EmbeddingInput): Promise<EmbeddingResult> {
    try {
      const client = getClient();
      // apiVersion: 'v1' を明示。SDK 既定の v1beta では現行の embedding モデルが 404 を返すため
      const model = client.getGenerativeModel(
        { model: EMBEDDING_MODEL },
        { apiVersion: 'v1' },
      );
      // gemini-embedding-001 は既定 3072 次元。outputDimensionality=768 で DB スキーマに整合。
      // v0.21 SDK の型定義に outputDimensionality がまだ入っていないため cast で回避
      // （REST API 上は正当なパラメータ。SDK が受けたオブジェクトをそのまま v1 API に渡す）
      const res = await withRetry(() =>
        model.embedContent({
          content: { role: 'user', parts: [{ text: input.text }] },
          outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONS,
        } as unknown as Parameters<typeof model.embedContent>[0]),
      );
      const vector = res.embedding?.values;
      if (!vector || vector.length === 0) {
        throw new LlmProviderError('gemini', 'invalid_response', 'Embeddingベクトルが空です');
      }
      return {
        vector,
        dimensions: vector.length,
        tokenCount: Math.ceil(input.text.length / 4), // 概算（API側で厳密値が返らないため）
        provider: 'gemini',
      };
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult> {
    try {
      const client = getClient();
      const model = client.getGenerativeModel(
        {
          model: CHAT_MODEL,
          systemInstruction: ANSWER_SYSTEM_PROMPT,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2, // 事実重視で低め
          },
        },
        { apiVersion: 'v1' },
      );

      const userPrompt = buildUserPrompt(input);
      const res = await withRetry(() => model.generateContent(userPrompt));
      const text = res.response.text();
      const parsed = parseAnswerJson(text);

      return {
        answer: parsed.answer,
        groundingSufficient: parsed.grounding_sufficient,
        reason: parsed.reason ?? '',
        usedContextIndexes: parsed.used_context_indexes ?? [],
        tokenCount: res.response.usageMetadata?.totalTokenCount ?? 0,
        provider: 'gemini',
      };
    } catch (err) {
      throw normalizeError(err);
    }
  },
};

function buildUserPrompt(input: GenerateAnswerInput): string {
  const contextsBlock = input.contexts
    .map(
      (c, i) =>
        `【参考文書 ${i}】\n文書名：${c.title}\nページ：${c.pageNumber ?? '不明'}\nセクション：${c.sectionTitle ?? '（記載なし）'}\n類似度：${c.similarity.toFixed(3)}\n---\n${c.content}`,
    )
    .join('\n\n');

  return `【ユーザーの質問】\n${input.question}\n\n【検索で取得された参考文書（最大5件）】\n${contextsBlock}\n\n上記の参考文書のみを根拠に、指定された出力形式のJSONを返してください。`;
}

interface RawAnswer {
  grounding_sufficient: boolean;
  answer: string;
  reason?: string;
  used_context_indexes?: number[];
}

function parseAnswerJson(text: string): RawAnswer {
  try {
    const parsed = JSON.parse(text) as RawAnswer;
    if (typeof parsed.grounding_sufficient !== 'boolean' || typeof parsed.answer !== 'string') {
      throw new Error('必須フィールド欠落');
    }
    return parsed;
  } catch {
    // JSONパース失敗時は安全側に倒して「根拠不足」扱いにする（ハルシネーション回避）
    return {
      grounding_sufficient: false,
      answer: '登録されている資料から該当する情報が見つかりませんでした。',
      reason: 'LLMレスポンスのパースに失敗したため、安全側に倒して根拠不足として処理しました',
      used_context_indexes: [],
    };
  }
}

function normalizeError(err: unknown): LlmProviderError {
  if (err instanceof LlmProviderError) return err;
  const message = err instanceof Error ? err.message : String(err);
  // APIキー・トークンをログに残さないため、messageに含まれる可能性のある文字列は除去
  const safe = message.replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[REDACTED_KEY]');
  const code: LlmProviderError['code'] =
    /rate|quota|limit/i.test(safe) ? 'rate_limit'
    : /auth|api key|permission/i.test(safe) ? 'auth'
    : /network|fetch|econn/i.test(safe) ? 'network'
    : 'unknown';
  return new LlmProviderError('gemini', code, safe);
}
