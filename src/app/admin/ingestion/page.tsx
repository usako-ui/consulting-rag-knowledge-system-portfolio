import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { AdminShell } from '@/components/layout/AdminShell';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  INGESTION_PAGE_SIZE,
  ingestionFilterSchema,
  listIngestionLogs,
} from '@/lib/admin/ingestion';
import { IngestionFilterForm } from './IngestionFilterForm';
import { IngestionTable } from './IngestionTable';
import { IngestionPagination } from './IngestionPagination';

export const metadata: Metadata = { title: '取り込み状況' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  searchParams: {
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}

export default async function AdminIngestionPage({ searchParams }: Props) {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');
  if (user.role !== 'admin') redirect('/');

  const parsed = ingestionFilterSchema.safeParse(searchParams);
  const filter = parsed.success ? parsed.data : { page: 1 as number };
  const filterError = parsed.success
    ? null
    : parsed.error.issues[0]?.message ?? 'フィルタ条件が正しくありません';

  const result = await listIngestionLogs(filter as never);
  const s = result.summary;

  return (
    <AdminShell
      user={user}
      title="取り込み状況"
      description="全部署の資料取り込みの状態・失敗分の再取り込み予約"
    >
      <div className="space-y-4">
        <Alert tone="info" title="取り込みの仕組み">
          <p className="text-[13px]">
            アップロード後は自動的に取り込みが開始されます。失敗行で「再取り込み」を押すと、自動で取り込みが始まります（失敗した場合は待機中に戻ります。30 分後に「取り込みを開始する」ボタンが表示されます）。
          </p>
        </Alert>

        {filterError ? (
          <Alert tone="warning" title="フィルタ条件を調整しました">
            <p className="text-[13px]">{filterError}（デフォルト条件で表示しています）</p>
          </Alert>
        ) : null}

        {/* 状態別カウント：5 枚のカード */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryCard label="待機中" value={s.pending} kind="info" />
          <SummaryCard label="処理中" value={s.processing} kind="processing" />
          <SummaryCard label="再試行中" value={s.retrying} kind="warning" />
          <SummaryCard label="失敗" value={s.failed} kind="danger" />
          <SummaryCard label="完了（直近24h）" value={s.successToday} kind="success" />
        </div>

        <Card padding="sm">
          <IngestionFilterForm initial={filter as never} />
        </Card>

        {result.rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="取り込みの履歴が見つかりませんでした"
            description="フィルタ条件を変更するか、GitHub Actions で取り込みを実行してください。"
          />
        ) : (
          <>
            <Card padding="sm">
              <IngestionTable rows={result.rows} />
            </Card>
            <IngestionPagination
              page={result.page}
              totalPages={result.totalPages}
              totalCount={result.totalCount}
              pageSize={INGESTION_PAGE_SIZE}
            />
          </>
        )}
      </div>
    </AdminShell>
  );
}

function SummaryCard({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind: 'info' | 'processing' | 'warning' | 'danger' | 'success';
}) {
  return (
    <Card padding="sm">
      <p className="text-xs text-text-muted">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-2xl font-semibold text-text-primary tabular">{value}</p>
        <StatusBadge kind={kind} size="sm" label={label} />
      </div>
    </Card>
  );
}
