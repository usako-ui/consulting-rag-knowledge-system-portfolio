/**
 * T-13 出典整形ロジック
 *
 * 参照：requirements.md §7・§9, architecture.md §12B.3
 *
 * ルール：
 *   1. AI が返した used_context_indexes に該当するチャンクのみを対象にする
 *      （AI が根拠として使っていない検索結果は出典に含めない）
 *   2. 同一 document_id のチャンクは、最も類似度が高いものに統合
 *   3. 類似度降順でソート
 *   4. 最大5件（要件§7）
 *   5. 5件未満なら無関係な資料を無理に埋めない
 */

import type { RagChunk, RagSource } from './types';

const MAX_SOURCES = 5;

export function formatSources(chunks: RagChunk[], usedContextIndexes: number[]): RagSource[] {
  // 1. インデックスの範囲チェック＋対応するチャンクを抽出
  const used = usedContextIndexes
    .filter((i) => Number.isInteger(i) && i >= 0 && i < chunks.length)
    .map((i) => chunks[i]);

  if (used.length === 0) return [];

  // 2. document_id ごとに最も類似度の高いチャンクに統合
  const byDoc = new Map<string, RagChunk>();
  for (const c of used) {
    const existing = byDoc.get(c.documentId);
    if (!existing || c.similarity > existing.similarity) {
      byDoc.set(c.documentId, c);
    }
  }

  // 3. 類似度降順 → 最大5件
  return Array.from(byDoc.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_SOURCES)
    .map((c) => ({
      documentId: c.documentId,
      title: c.title,
      department: c.department,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle,
      similarity: c.similarity,
    }));
}
