/**
 * Claude プロバイダ実装（骨組み）
 *
 * 参照：requirements.md §24
 * 位置づけ：本番切替時に有効化。MVP検証中は LLM_PROVIDER=gemini を使用するため、
 *           本ファイルはインターフェース遵守と将来切替の疎通のみを担う。
 * 実装は本番契約時に完成させる（SDKインストール込み）。
 */

import type {
  EmbeddingInput,
  EmbeddingResult,
  GenerateAnswerInput,
  GenerateAnswerResult,
  LlmProvider,
} from './types';
import { LlmProviderError } from './types';

export const claudeProvider: LlmProvider = {
  name: 'claude',

  async embed(_input: EmbeddingInput): Promise<EmbeddingResult> {
    // Claude API 側に埋め込み専用APIはないため、本番でも Gemini Embedding 継続または
    // 別プロバイダ（Voyage AI 等）を採用する方針。ここでは明示的にエラーを投げる。
    throw new LlmProviderError(
      'claude',
      'unknown',
      'Claudeプロバイダの Embedding は未実装です。本番切替時に別プロバイダを検討してください',
    );
  },

  async generateAnswer(_input: GenerateAnswerInput): Promise<GenerateAnswerResult> {
    // 本番契約後に @anthropic-ai/sdk をインストールし、以下の方針で実装する：
    // - claude-sonnet-4-6 等をデフォルトに使用
    // - system プロンプトは gemini.ts の ANSWER_SYSTEM_PROMPT と共通化する
    // - tool_use ではなく response_format=json_object 相当（system指示＋厳格パース）で担保
    // - grounding_sufficient=false の分岐は同じロジックを流用
    throw new LlmProviderError(
      'claude',
      'unknown',
      'Claudeプロバイダの generateAnswer は未実装です。本番契約時に有効化してください',
    );
  },
};
