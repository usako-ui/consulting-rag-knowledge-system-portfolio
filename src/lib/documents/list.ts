/**
 * 自部署の資料一覧・処理状況を取得するサーバー側ヘルパー
 * 参照：requirements.md §14（キュー状態）, architecture.md §5.4
 *
 * 一般ユーザーは自部署のみ、管理者は絞り込み対象部署に応じて表示する。
 * RLS を通したうえで、アプリ層でも部署一致を再検証（二重防御）。
 */

import 'server-only';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { AuthenticatedUser, Department } from '@/lib/auth/session';

export interface DocumentListItem {
  id: string;
  title: string;
  department: Department;
  fileId: string;
  updatedAt: string;
  pageCount: number | null;
  fileSizeBytes: number | null;
  isActive: boolean;
  status: DocumentStatus;
  lastIngestionError: string | null;
  retryCount: number;
}

export type DocumentStatus =
  | 'success'
  | 'processing'
  | 'retrying'
  | 'failed'
  | 'pending'
  | 'unknown';

export async function listDocumentsForUser(user: AuthenticatedUser): Promise<DocumentListItem[]> {
  const supabase = createSupabaseServerClient();
  const targetDept = user.role === 'admin' ? null : user.department;

  const documentsQuery = supabase
    .from('documents')
    .select('id, title, department, file_id, updated_at, page_count, file_size_bytes, is_active')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(200);

  const { data: docs, error: docsError } = targetDept
    ? await documentsQuery.eq('department', targetDept)
    : await documentsQuery;

  if (docsError || !docs) return [];

  // 各文書の最新 ingestion_log を取得（service_role・ingestion_log は admin/self 用途）
  const service = createSupabaseServiceRoleClient();
  const ids = docs.map((d) => d.id);
  const { data: logs } = ids.length
    ? await service
        .from('ingestion_log')
        .select('document_id, status, error_message, retry_count, created_at')
        .in('document_id', ids)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ document_id: string; status: string; error_message: string | null; retry_count: number; created_at: string }> };

  const latestByDoc = new Map<
    string,
    { status: DocumentStatus; error: string | null; retry: number }
  >();
  for (const row of logs ?? []) {
    if (row.document_id && !latestByDoc.has(row.document_id)) {
      latestByDoc.set(row.document_id, {
        status: normalizeStatus(row.status),
        error: row.error_message,
        retry: row.retry_count ?? 0,
      });
    }
  }

  return docs.map((d) => {
    const log = latestByDoc.get(d.id);
    // 二重防御：一般ユーザー閲覧時に他部署が混入していないか最終検査
    if (user.role !== 'admin' && d.department !== user.department) {
      return null;
    }
    return {
      id: d.id,
      title: d.title,
      department: d.department as Department,
      fileId: d.file_id,
      updatedAt: d.updated_at,
      pageCount: d.page_count,
      fileSizeBytes: d.file_size_bytes,
      isActive: d.is_active,
      status: log?.status ?? 'success',
      lastIngestionError: log?.error ?? null,
      retryCount: log?.retry ?? 0,
    };
  }).filter((v): v is DocumentListItem => v !== null);
}

function normalizeStatus(raw: string): DocumentStatus {
  switch (raw) {
    case 'success':
    case 'processing':
    case 'retrying':
    case 'failed':
    case 'pending':
      return raw;
    default:
      return 'unknown';
  }
}
