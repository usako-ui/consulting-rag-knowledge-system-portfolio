import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Info } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth/optional';
import { UserShell } from '@/components/layout/UserShell';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { fetchDocumentForUser } from '@/lib/documents/access';
import { departmentLabel } from '@/lib/ui/department';
import { formatDateJa } from '@/lib/ui/format';
import { DocumentBody } from './DocumentBody';

export const metadata: Metadata = { title: '資料を確認' };
export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
  searchParams: { page?: string };
}

export default async function DocumentDetailPage({ params, searchParams }: Props) {
  const user = await getOptionalUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/documents/${params.id}`)}`);
  if (!user.passwordChanged) redirect('/password-change');

  const result = await fetchDocumentForUser(params.id, user);
  const requestedPage = parsePage(searchParams.page);

  if (result.kind === 'not_found') {
    return (
      <UserShell user={user} title="資料が見つかりません">
        <EmptyState
          icon={FileText}
          title="指定された資料は登録されていません"
          description="URL が古いか、資料が削除されている可能性があります。"
        />
      </UserShell>
    );
  }

  if (result.kind === 'forbidden') {
    return (
      <UserShell user={user} title="この資料は閲覧できません">
        <div className="space-y-4">
          <Alert tone="warning" title="権限がないため表示できません">
            この資料は<strong>{departmentLabel(result.documentDepartment)}</strong>の資料です。
            あなたの部署（{departmentLabel(user.department)}）では閲覧できません。
            必要な場合は管理者へ相談してください。
          </Alert>
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-accent hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              ホームへ戻る
            </Link>
          </div>
        </div>
      </UserShell>
    );
  }

  const { document, chunks } = result;

  return (
    <UserShell
      user={user}
      title={document.title}
      description="RAG 回答の根拠として使われた資料の該当箇所"
    >
      <div className="space-y-4">
        <Card padding="lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="info" label={departmentLabel(document.department)} size="sm" />
                {document.isActive ? (
                  <StatusBadge kind="success" label="現行版" size="sm" />
                ) : (
                  <StatusBadge kind="warning" label="旧版" size="sm" />
                )}
                {requestedPage ? (
                  <span className="text-xs text-text-muted tabular">
                    Slack からの誘導：p.{requestedPage}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-text-muted">
                ファイル ID：<span className="tabular">{document.fileId}</span>
                {document.createdYear ? ` / ${document.createdYear}年` : ''}
                {document.clientName ? ` / ${document.clientName}` : ''}
              </p>
              <p className="text-xs text-text-muted">
                最終更新：<span className="tabular">{formatDateJa(document.updatedAt)}</span>
                {document.pageCount ? ` / 全 ${document.pageCount} ページ` : ''}
              </p>
            </div>
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-accent hover:underline"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                ホームへ戻る
              </Link>
            </div>
          </div>
        </Card>

        {chunks.length === 0 ? (
          <EmptyState
            icon={Info}
            title="この資料にはまだ解析済みのテキストがありません"
            description="取り込み処理が完了していないか、テキストを抽出できない形式の可能性があります。"
          />
        ) : (
          <Card padding="lg">
            <CardHeader
              title="資料の内容（該当箇所ハイライト）"
              description="質問の根拠となった箇所を上部に表示しています"
            />
            <DocumentBody chunks={chunks} highlightPage={requestedPage} />
          </Card>
        )}
      </div>
    </UserShell>
  );
}

function parsePage(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
