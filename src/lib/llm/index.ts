/**
 * LLMプロバイダ factory
 * 参照：agent-brief.md §3.2, requirements.md §33（環境変数 LLM_PROVIDER）
 *
 * 使用例（業務コードはこの層以下の実装詳細を知らない）：
 *   import { getLlmProvider } from '@/lib/llm';
 *   const provider = getLlmProvider();
 *   const embedding = await provider.embed({ text: 'query' });
 *   const answer = await provider.generateAnswer({ question, contexts });
 */

import { geminiProvider } from './gemini';
import { claudeProvider } from './claude';
import type { LlmProvider, LlmProviderName } from './types';

export type { LlmProvider, LlmProviderName } from './types';
export type {
  EmbeddingInput,
  EmbeddingResult,
  GenerateAnswerInput,
  GenerateAnswerResult,
} from './types';
export { LlmProviderError } from './types';

let cached: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (cached) return cached;

  const raw = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
  const name = normalizeProviderName(raw);

  cached = name === 'claude' ? claudeProvider : geminiProvider;
  return cached;
}

function normalizeProviderName(raw: string): LlmProviderName {
  if (raw === 'gemini' || raw === 'claude') return raw;
  throw new Error(
    `LLM_PROVIDER の値が不正です: "${raw}"。'gemini' または 'claude' を指定してください`,
  );
}

/** テスト用：キャッシュをリセット */
export function resetLlmProviderForTest(): void {
  cached = null;
}
