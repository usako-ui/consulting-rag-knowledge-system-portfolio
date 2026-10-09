/**
 * T-11 RAG検索（権限内ベクトル検索）
 *
 * 参照：requirements.md §7, architecture.md §12B.1
 *
 * 流れ：
 *   1. 質問文を Gemini Embedding でベクトル化
 *   2. `search_document_chunks` RPC を呼び出し（security invoker で RLS が呼び出し元セッションに適用）
 *   3. top-N のチャンクを RagChunk[] に整形して返す
 *
 * ★ 引数の client は認証済みの Supabase セッションクライアント（Route Handler なら
 *   createSupabaseServerClient()、CLI なら signInWithPassword 済みクライアント）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getLlmProvider } from '@/lib/llm';
import { toRagError } from './errors';
import type { RagChunk, RagSearchInput } from './types';

const DEFAULT_MATCH_COUNT = 5;

export interface SearchResult {
  chunks: RagChunk[];
  embeddingTokens: number;
  provider: string;
}

export async function searchChunks(
  input: RagSearchInput,
  client: SupabaseClient,
): Promise<SearchResult> {
  try {
    const provider = getLlmProvider();
    const emb = await provider.embed({ text: input.question });

    const { data, error } = await client.rpc('search_document_chunks', {
      query_embedding: emb.vector,
      match_count: input.matchCount ?? DEFAULT_MATCH_COUNT,
      department_filter: input.filters.department,
      year_filter: input.filters.createdYear,
      client_filter: input.filters.clientName,
    });

    if (error) throw toRagError(error, 'db');

    const rows = (data ?? []) as Array<{
      chunk_id: string;
      document_id: string;
      department: RagChunk['department'];
      title: string;
      page_number: number | null;
      section_title: string | null;
      content: string;
      similarity: number;
    }>;

    const chunks: RagChunk[] = rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      department: row.department,
      title: row.title,
      pageNumber: row.page_number,
      sectionTitle: row.section_title,
      content: row.content,
      similarity: row.similarity,
    }));

    return { chunks, embeddingTokens: emb.tokenCount, provider: provider.name };
  } catch (err) {
    throw toRagError(err, 'llm');
  }
}
