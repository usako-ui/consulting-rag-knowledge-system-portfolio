/**
 * 取り込みパイプラインの型定義
 *
 * 参照：requirements.md §5・§6・§13〜§15, architecture.md §3・§6
 */

/** 6部署の列挙（DB enum `department` と一致） */
export type Department = 'strategy' | 'business' | 'it' | 'hr' | 'sales' | 'management';

/** ingestion_log.status（5状態） */
export type IngestionStatus = 'pending' | 'processing' | 'success' | 'failed' | 'retrying';

/** 文書メタデータ（documents テーブル insert 用） */
export interface DocumentMetadata {
  department: Department;
  title: string;
  fileId: string;         // 元ファイル識別子（例：case7-doc1-strategy-dx-bank.pdf）
  contentHash: string;    // 内容 SHA-256（HEX）
  createdYear: number | null;
  clientName: string | null;
  pageCount: number | null;
  fileSizeBytes: number;
}

/** チャンキング後の1チャンク */
export interface ChunkInput {
  pageNumber: number | null;
  sectionTitle: string | null;
  content: string;
}

/** 取り込み対象1ファイル分の入力（CLI と将来のUploadUIで共通利用） */
export interface IngestSource {
  fileId: string;
  bytes: Buffer;
  metadata: Omit<DocumentMetadata, 'contentHash' | 'fileSizeBytes'>;
  /** web アップロード経路の場合に設定。documents.storage_path に記録する */
  storagePath?: string | null;
}

/** pipeline.ingestOne の結果 */
export type IngestOneResult =
  | { kind: 'created'; documentId: string; chunkCount: number }
  | { kind: 'updated'; documentId: string; previousDocumentId: string; chunkCount: number }
  | { kind: 'skipped_duplicate'; documentId: string };

/** 内部エラーコード（英語・ログ用。UI には出さない） */
export type IngestErrorCode =
  | 'pdf_parse_failed'
  | 'word_parse_failed'
  | 'zip_bomb_detected'
  | 'metadata_extraction_failed'
  | 'embedding_failed'
  | 'db_insert_failed'
  | 'rate_limit'
  | 'file_not_found'
  | 'unsupported_format'
  | 'unknown';
