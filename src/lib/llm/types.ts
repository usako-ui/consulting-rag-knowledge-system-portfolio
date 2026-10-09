/**
 * LLM / Embedding プロバイダ抽象化インターフェース
 *
 * 参照：agent-brief.md §3.2, requirements.md §24, architecture.md §1
 * 目的：LLM_PROVIDER 環境変数だけでプロバイダ切替を完結させる（コード変更不要）
 *
 * ★プロバイダ固有の型・SDKはこの層より外に漏らさないこと（CLAUDE.md §5）
 */

export type LlmProviderName = 'gemini' | 'claude';

export interface EmbeddingInput {
  text: string;
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  tokenCount: number;
  provider: LlmProviderName;
}

export interface GenerateAnswerInput {
  question: string;
  contexts: Array<{
    title: string;
    pageNumber: number | null;
    sectionTitle: string | null;
    content: string;
    similarity: number;
  }>;
  language?: 'ja' | 'en';
}

/**
 * AI回答生成の結果
 * groundingSufficient=false のときは根拠不足として「該当なし」を返すこと（要件 §8）
 */
export interface GenerateAnswerResult {
  answer: string;
  groundingSufficient: boolean;
  reason: string;
  usedContextIndexes: number[];
  tokenCount: number;
  provider: LlmProviderName;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  embed(input: EmbeddingInput): Promise<EmbeddingResult>;
  generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult>;
}

export class LlmProviderError extends Error {
  constructor(
    public readonly provider: LlmProviderName,
    public readonly code: 'rate_limit' | 'auth' | 'network' | 'invalid_response' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
