/**
 * T-12 RAG 全体パイプライン（検索 → AI回答 → 出典整形）
 *
 * 参照：requirements.md §8（ハルシネーション対策 2 段判定）, architecture.md §12B.2
 *
 * 流れ：
 *   1. searchChunks() でベクトル検索（top-N）
 *   2. 検索結果0件 → 即「該当なし」応答（Chat API は呼ばない・課金削減）
 *   3. generateAnswer() で AI 側の根拠判定＋回答生成
 *   4. grounding_sufficient=false → 固定文言「該当なし」
 *   5. grounding_sufficient=true → 出典整形（used_context_indexes に該当するもののみ）
 *   6. 出典 0 件 かつ sufficient は矛盾 → 安全側に倒して insufficient
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getLlmProvider } from '@/lib/llm';
import { toRagError } from './errors';
import { searchChunks } from './search';
import { formatSources } from './sources';
import { NO_MATCH_ANSWER } from './types';
import type { RagAnswer, RagSearchInput } from './types';

export async function answerQuestion(
  input: RagSearchInput,
  client: SupabaseClient,
): Promise<RagAnswer> {
  try {
    const { chunks, embeddingTokens, provider: providerName } = await searchChunks(input, client);

    // 段階①：検索結果0件 → 即 insufficient（Chat API を呼ばない）
    if (chunks.length === 0) {
      return {
        grounding: 'insufficient',
        answer: NO_MATCH_ANSWER,
        sources: [],
        reason: '検索結果0件（権限内の対象文書に類似コンテンツなし）',
        meta: {
          chunksSearched: 0,
          provider: providerName,
          embeddingTokens,
          chatTokens: 0,
        },
      };
    }

    // 段階②：AI 側の根拠判定＋回答生成
    const provider = getLlmProvider();
    const answerResult = await provider.generateAnswer({
      question: input.question,
      contexts: chunks.map((c) => ({
        title: c.title,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle,
        content: c.content,
        similarity: c.similarity,
      })),
    });

    // 出典整形（AI が使ったコンテキストのみ）
    const sources = answerResult.groundingSufficient
      ? formatSources(chunks, answerResult.usedContextIndexes)
      : [];

    // 矛盾チェック：sufficient と言いつつ出典 0 件は不整合 → 安全側に倒す
    const finalGrounding =
      answerResult.groundingSufficient && sources.length > 0 ? 'sufficient' : 'insufficient';

    return {
      grounding: finalGrounding,
      answer: finalGrounding === 'sufficient' ? answerResult.answer : NO_MATCH_ANSWER,
      sources,
      reason:
        finalGrounding === 'insufficient' && answerResult.groundingSufficient
          ? '矛盾検知：AI は sufficient と判定したが出典が抽出できなかったため insufficient に降格'
          : answerResult.reason || `AI 根拠判定: ${answerResult.groundingSufficient}`,
      meta: {
        chunksSearched: chunks.length,
        provider: providerName,
        embeddingTokens,
        chatTokens: answerResult.tokenCount,
      },
    };
  } catch (err) {
    throw toRagError(err);
  }
}
