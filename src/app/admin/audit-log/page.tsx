import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FileSearch } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { AdminShell } from '@/components/layout/AdminShell';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AUDIT_LOG_PAGE_SIZE,
  auditLogFilterSchema,
  listAuditLogs,
} from '@/lib/admin/audit-log';
import { AuditLogFilterForm } from './AuditLogFilterForm';
import { AuditLogTable } from './AuditLogTable';
import { AuditLogPagination } from './AuditLogPagination';

export const metadata: Metadata = { title: '監査ログ' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  searchParams: {
    from?: string;
    to?: string;
    actor?: string;
    actionType?: string;
    targetType?: string;
    page?: string;
  };
}

export default async function AdminAuditLogPage({ searchParams }: Props) {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');
  if (user.role !== 'admin') redirect('/');

  // URL クエリをサーバー側で zod 検証
  const parsed = auditLogFilterSchema.safeParse(searchParams);
  // 無効な場合はデフォルトにフォールバック（画面を落とさない）
  const filter = parsed.success
    ? parsed.data
    : { page: 1 as number };
  const filterError = parsed.success
    ? null
    : parsed.error.issues[0]?.message ?? 'フィルタ条件が正しくありません';

  const result = await listAuditLogs(filter as never);

  return (
    <AdminShell
      user={user}
      title="監査ログ"
      description="管理者操作・認証・検索などの履歴（追記のみ・変更/削除不可）"
    >
      <div className="space-y-4">
        <Alert tone="info" title="このログは追記のみです">
          <p className="text-[13px]">
            監査ログは記録後、変更・削除できません。保存期間を過ぎたログは、設定ページの「ログ保存期間」に従って月次ジョブで自動削除されます。
          </p>
        </Alert>

        {filterError ? (
          <Alert tone="warning" title="フィルタ条件を調整しました">
            <p className="text-[13px]">{filterError}（デフォルト条件で表示しています）</p>
          </Alert>
        ) : null}

        <Card padding="sm">
          <AuditLogFilterForm initial={filter as never} />
        </Card>

        {result.rows.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="監査ログが見つかりませんでした"
            description="フィルタ条件を変更して再度お試しください。"
          />
        ) : (
          <>
            <Card padding="sm">
              <AuditLogTable rows={result.rows} />
            </Card>
            <AuditLogPagination
              page={result.page}
              totalPages={result.totalPages}
              totalCount={result.totalCount}
              pageSize={AUDIT_LOG_PAGE_SIZE}
            />
          </>
        )}
      </div>
    </AdminShell>
  );
}
