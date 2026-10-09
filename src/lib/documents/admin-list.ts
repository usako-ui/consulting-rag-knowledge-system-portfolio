/**
 * 管理者向け全文書一覧（is_active=false も含む）
 * 参照：requirements.md §5, tasks.md Day6 Phase 4.1
 *
 * ★ service_role で全部署横断取得。呼び出し側で必ず認可（requireAdmin）済みであること。
 */

import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { Department } from '@/lib/auth/session';

export interface AdminDocumentItem {
  id: string;
  title: string;
  department: Department;
  fileId: string;
  updatedAt: string;
  pageCount: number | null;
  fileSizeBytes: number | null;
  isActive: boolean;
}

export async function listAllDocumentsForAdmin(): Promise<AdminDocumentItem[]> {
  const service = getServiceRoleClient();
  const { data, error } = await service
    .from('documents')
    .select('id, title, department, file_id, updated_at, page_count, file_size_bytes, is_active')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    title: d.title,
    department: d.department as Department,
    fileId: d.file_id,
    updatedAt: d.updated_at,
    pageCount: d.page_count,
    fileSizeBytes: d.file_size_bytes,
    isActive: d.is_active,
  }));
}
