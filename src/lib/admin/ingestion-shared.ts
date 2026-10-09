/**
 * 取り込み状況の Client / Server 共通の型・enum・ラベル
 *   - `server-only` を含まないので、Client Component からも import 可能
 */

import type { Department } from '@/lib/auth/session';
import type { IngestErrorCode } from '@/lib/ingest/types';

/**
 * 再取り込みしても改善しない恒久的なエラーコード。
 * ファイル自体の問題（破損・画像PDF・非対応形式等）が原因のため、
 * 元ファイルを修正して再アップロードするしか解消方法がない。
 * UI では「再取り込み」ボタンを出さずメッセージのみ表示する。
 */
export const PERMANENT_INGEST_ERROR_CODES: ReadonlySet<IngestErrorCode> = new Set<IngestErrorCode>([
  'pdf_parse_failed',
  'word_parse_failed',
  'zip_bomb_detected',
  'metadata_extraction_failed',
  'file_not_found',
  'unsupported_format',
]);

export const INGESTION_STATUSES = [
  'pending',
  'processing',
  'retrying',
  'failed',
  'success',
] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export const INGESTION_STATUS_LABEL: Record<IngestionStatus, string> = {
  pending: '待機中',
  processing: '処理中',
  retrying: '再試行中',
  failed: '失敗',
  success: '完了',
};

export interface IngestionLogRecord {
  id: string;
  documentId: string | null;
  fileId: string;
  status: IngestionStatus;
  source: 'web' | 'testdocs';
  errorMessage: string | null;
  errorCode: string | null;
  retryCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** 関連 documents の最新スナップショット（表示用） */
  document?: {
    title: string | null;
    department: Department | null;
    isActive: boolean | null;
  };
}
