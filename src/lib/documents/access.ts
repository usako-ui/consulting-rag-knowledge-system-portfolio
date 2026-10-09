/**
 * 文書アクセス検査・データ取得（サーバー側）
 * 参照：requirements.md §9（出典リンクの権限チェック）, agent-brief.md §3.1（二重防御）
 *
 * Slack から `/documents/{id}?page=n` で飛んでくるリンクの受け皿の中核。
 * Web 側で「認証＋部署チェック」を必ず再検証する。
 */

import 'server-only';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { AuthenticatedUser, Department } from '@/lib/auth/session';

export interface DocumentDetail {
  id: string;
  title: string;
  department: Department;
  fileId: string;
  createdYear: number | null;
  clientName: string | null;
  pageCount: number | null;
  fileSizeBytes: number | null;
  isActive: boolean;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  content: string;
}

export type AccessResult =
  | { kind: 'not_found' }
  | { kind: 'forbidden'; documentDepartment: Department }
  | { kind: 'ok'; document: DocumentDetail; chunks: DocumentChunk[] };

/**
 * ドキュメント本体を取得。RLS 下で SELECT できない場合は service_role でメタだけ確認し、
 * 「他部署にはあるが権限がない」か「そもそも存在しない」を切り分ける（要件§9 UX）。
 */
export async function fetchDocumentForUser(
  documentId: string,
  user: AuthenticatedUser,
): Promise<AccessResult> {
  const supabase = createSupabaseServerClient();

  // 1. まず RLS 経由で取得（成功すれば権限あり）
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select(
      'id, title, department, file_id, created_year, client_name, page_count, file_size_bytes, is_active, updated_at',
    )
    .eq('id', documentId)
    .maybeSingle();

  if (docError) {
    return { kind: 'not_found' };
  }

  if (doc) {
    // 二重防御：アプリ層でも部署一致を検証（管理者は素通し）
    if (user.role !== 'admin' && doc.department !== user.department) {
      return { kind: 'forbidden', documentDepartment: doc.department as Department };
    }
    // 一般ユーザーには is_active=false（削除済）を「見つからない」扱いにする
    // （要件§3・§5 に沿い、削除された資料は一般ユーザーから隠す・管理者は履歴確認可）
    if (user.role !== 'admin' && doc.is_active === false) {
      return { kind: 'not_found' };
    }

    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('id, page_number, section_title, content')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true, nullsFirst: false });

    return {
      kind: 'ok',
      document: mapDocument(doc),
      chunks: (chunks ?? []).map(mapChunk),
    };
  }

  // 2. RLS で見えなかったので service_role で最小情報のみ確認（存在有無・部署のみ）
  const service = createSupabaseServiceRoleClient();
  const { data: privileged } = await service
    .from('documents')
    .select('id, department')
    .eq('id', documentId)
    .maybeSingle();

  if (!privileged) return { kind: 'not_found' };
  return { kind: 'forbidden', documentDepartment: privileged.department as Department };
}

function mapDocument(row: Record<string, unknown>): DocumentDetail {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    department: row.department as Department,
    fileId: String(row.file_id ?? ''),
    createdYear: row.created_year !== null ? Number(row.created_year) : null,
    clientName: row.client_name !== null ? String(row.client_name) : null,
    pageCount: row.page_count !== null ? Number(row.page_count) : null,
    fileSizeBytes: row.file_size_bytes !== null ? Number(row.file_size_bytes) : null,
    isActive: Boolean(row.is_active),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapChunk(row: Record<string, unknown>): DocumentChunk {
  return {
    id: String(row.id),
    pageNumber: row.page_number !== null ? Number(row.page_number) : null,
    sectionTitle: row.section_title !== null ? String(row.section_title) : null,
    content: String(row.content ?? ''),
  };
}
