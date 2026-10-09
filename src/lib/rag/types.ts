/**
 * RAG検索・回答パイプラインの型定義
 *
 * 参照：requirements.md §7・§8・§9, architecture.md §12B
 */

import type { Department } from '@/lib/auth/session';

export interface RagFilters {
  department: Department | null;   // 一般ユーザーは自部署のみ、管理者は null=全部署
  createdYear: number | null;
  clientName: string | null;
}

export interface RagSearchInput {
  question: string;
  filters: RagFilters;
  /** 検索する候補数（要件 §7 では最大5件）。default 5 */
  matchCount?: number;
}

/** search_document_chunks RPC の返り値をマッピング */
export interface RagChunk {
  chunkId: string;
  documentId: string;
  department: Department;
  title: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  content: string;
  similarity: number;
}

export interface RagSource {
  documentId: string;
  title: string;
  department: Department;
  pageNumber: number | null;
  sectionTitle: string | null;
  similarity: number;
}

/** 回答の根拠十分性 */
export type RagGrounding = 'sufficient' | 'insufficient';

export interface RagAnswer {
  grounding: RagGrounding;
  answer: string;
  sources: RagSource[];
  /** デバッグ用：根拠不足の理由 or 使用したコンテキストの説明 */
  reason: string;
  meta: {
    chunksSearched: number;
    provider: string;
    embeddingTokens: number;
    chatTokens: number;
  };
}

/** ハルシネーション対策：根拠不足時の固定メッセージ（要件 §8） */
export const NO_MATCH_ANSWER = '登録されている資料から該当する情報が見つかりませんでした。';
