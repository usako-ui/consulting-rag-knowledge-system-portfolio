/**
 * T-06 文書取り込みパイプライン（単一ファイル分の処理）
 *
 * 参照：
 *   requirements.md §5（識別・更新検出）・§6（チャンキング）・§13（取り込み）
 *   architecture.md §3（DB）・§6（データフロー）
 *   agent-brief.md §3.3〜§3.4（設計パターン）
 *
 * 処理フロー：
 *   1. content_hash を計算
 *   2. (file_id, content_hash) が documents に既存 → skipped_duplicate（冪等・T-07）
 *   3. 同 file_id で異なる hash → 旧 documents.is_active=false（T-07 更新検出）
 *   4. テキスト抽出（PDF: src/lib/ingest/pdf.ts / Word: src/lib/ingest/word.ts）
 *   5. セクション単位チャンキング（src/lib/ingest/chunker.ts）
 *   6. 各チャンクを Gemini Embedding でベクトル化（LLM ラッパー経由）
 *   7. documents + document_chunks を service_role で挿入
 *   8. api_usage_log に Embedding 呼び出し回数・トークン数を記録
 *
 * ★ RLS バイパスするため呼び出し側で認可済みであること（CLI or 管理者API）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getLlmProvider } from '@/lib/llm';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { chunkText, chunkPdfPages, chunkWordSections } from './chunker';
import { IngestError, toIngestError } from './errors';
import { sha256Hex } from './hash';
import { extractPdfText } from './pdf';
import { extractWordText } from './word';
import type { IngestOneResult, IngestSource } from './types';

export interface IngestOneOptions {
  /** テスト時に外部注入可能。省略時は getServiceRoleClient() を使用 */
  client?: SupabaseClient;
}

export async function ingestOne(source: IngestSource, options: IngestOneOptions = {}): Promise<IngestOneResult> {
  const supabase = options.client ?? getServiceRoleClient();

  try {
    const contentHash = sha256Hex(source.bytes);
    const fileSizeBytes = source.bytes.byteLength;

    // T-07: 既存 documents との照合
    const { data: existingSameHash, error: findErr } = await supabase
      .from('documents')
      .select('id')
      .eq('file_id', source.fileId)
      .eq('content_hash', contentHash)
      .maybeSingle();

    if (findErr) throw toIngestError(findErr, 'db_insert_failed');

    if (existingSameHash) {
      // 完全一致 → 冪等スキップ（DB unique 制約でも二重に守られている）
      return { kind: 'skipped_duplicate', documentId: existingSameHash.id };
    }

    // 同 file_id の別バージョンを検索（更新検出）
    const { data: previousActive, error: prevErr } = await supabase
      .from('documents')
      .select('id')
      .eq('file_id', source.fileId)
      .eq('is_active', true)
      .maybeSingle();

    if (prevErr) throw toIngestError(prevErr, 'db_insert_failed');

    // ファイル種別判定 → テキスト抽出 → チャンク
    const ext = source.fileId.toLowerCase().split('.').pop();
    let text: string;
    let pageCount: number;
    let chunks: import('./types').ChunkInput[];
    if (ext === 'pdf') {
      const pdfResult = await extractPdfText(source.bytes);
      text = pdfResult.text;
      pageCount = pdfResult.pageCount;
      chunks = chunkPdfPages(pdfResult.pages);
    } else if (ext === 'docx') {
      const wordResult = await extractWordText(source.bytes);
      text = wordResult.text;
      pageCount = wordResult.pageCount;
      chunks = wordResult.htmlSections
        ? chunkWordSections(wordResult.htmlSections)
        : chunkText(text);
    } else {
      throw new IngestError('unsupported_format', `サポート外のファイル形式: .${ext ?? '不明'}`, false);
    }
    if (chunks.length === 0) {
      throw toIngestError(new Error('チャンク生成結果が空です'), ext === 'docx' ? 'word_parse_failed' : 'pdf_parse_failed');
    }

    // Embedding 生成（レート制限を意識して逐次実行）
    const provider = getLlmProvider();
    const embeddings: Array<{ vector: number[]; tokenCount: number }> = [];
    for (const chunk of chunks) {
      const emb = await provider.embed({ text: chunk.content });
      if (emb.dimensions !== 768) {
        throw toIngestError(
          new Error(`Embedding次元不一致: ${emb.dimensions} (期待:768)`),
          'embedding_failed',
        );
      }
      embeddings.push({ vector: emb.vector, tokenCount: emb.tokenCount });
    }

    // T-07 更新検出：旧版を先に無効化してから新版を挿入
    if (previousActive) {
      const { error: updErr } = await supabase
        .from('documents')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', previousActive.id);
      if (updErr) throw toIngestError(updErr, 'db_insert_failed');
    }

    // documents 挿入
    const { data: inserted, error: insErr } = await supabase
      .from('documents')
      .insert({
        department: source.metadata.department,
        title: source.metadata.title,
        file_id: source.fileId,
        content_hash: contentHash,
        created_year: source.metadata.createdYear,
        client_name: source.metadata.clientName,
        is_active: true,
        page_count: pageCount || null,
        file_size_bytes: fileSizeBytes,
        storage_path: source.storagePath ?? null,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      throw toIngestError(insErr ?? new Error('documents insert returned no id'), 'db_insert_failed');
    }
    const documentId: string = inserted.id;

    // document_chunks 一括挿入
    const rows = chunks.map((c, i) => ({
      document_id: documentId,
      department: source.metadata.department,
      title: source.metadata.title,
      page_number: c.pageNumber,
      section_title: c.sectionTitle,
      content: c.content,
      embedding: embeddings[i].vector,
    }));

    const { error: chunkErr } = await supabase.from('document_chunks').insert(rows);
    if (chunkErr) throw toIngestError(chunkErr, 'db_insert_failed');

    // api_usage_log：Embedding 呼び出しをまとめて記録
    const totalTokens = embeddings.reduce((a, b) => a + b.tokenCount, 0);
    const { error: usageErr } = await supabase.from('api_usage_log').insert({
      provider: provider.name,
      api_type: 'embedding',
      request_count: embeddings.length,
      token_count: totalTokens,
    });
    if (usageErr) {
      // 使用量ログ失敗は取り込み全体を止めない（次回集計から欠損するのみ）
      // ただし error_message には露出させる（監査上の可視性のため）
      console.warn('[ingest] api_usage_log insert failed (non-fatal):', usageErr.message);
    }

    return previousActive
      ? { kind: 'updated', documentId, previousDocumentId: previousActive.id, chunkCount: chunks.length }
      : { kind: 'created', documentId, chunkCount: chunks.length };
  } catch (err) {
    throw toIngestError(err);
  }
}
