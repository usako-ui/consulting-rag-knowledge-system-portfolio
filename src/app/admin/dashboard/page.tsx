import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/optional';
import { AdminShell } from '@/components/layout/AdminShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatusBanner } from '@/components/admin/StatusBanner';
import { TasksList } from '@/components/admin/TasksList';
import { UsageGauge } from '@/components/admin/UsageGauge';
import { loadDashboardData } from '@/lib/admin/dashboard';
import { departmentLabel } from '@/lib/ui/department';

export const metadata: Metadata = { title: '管理者ダッシュボード' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * T-22 管理者ダッシュボード（Phase 2）
 * 参照：requirements.md §11・§17・§19, architecture.md §5.4（管理者方針）
 *
 * 設計方針：
 *   - 「対応が必要なタスク」を主役に据える（大量の数字グラフは NG）
 *   - 画面を開いた瞬間に「正常/注意/対応必要」がわかる
 *   - 次の一手（ボタン）まで導線を通す
 *
 * ★ middleware で /admin/* は保護済みだが、Route Handler 側でも二重防御として
 *   getOptionalUser + role 判定を必ず行う。
 */
export default async function AdminDashboardPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');
  if (user.role !== 'admin') redirect('/');

  const data = await loadDashboardData();

  return (
    <AdminShell
      user={user}
      title="ダッシュボード"
      description="システム状態と対応すべきタスクを一目で確認"
    >
      <div className="space-y-6">
        <StatusBanner status={data.overallStatus} taskCount={data.tasks.length} />

        <Card padding="lg">
          <CardHeader
            title="対応が必要なタスク"
            description="優先度の高いものから順に表示しています"
          />
          <TasksList tasks={data.tasks} />
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card padding="md">
            <p className="text-xs text-text-muted">当月の Gemini API 使用量</p>
            <div className="mt-2">
              <UsageGauge usage={data.usage} />
            </div>
          </Card>

          <Card padding="md">
            <p className="text-xs text-text-muted">直近 24 時間の検索件数</p>
            <p className="mt-3 text-3xl font-semibold tabular text-text-primary">
              {data.searchCount24h.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-text-muted">件</span>
            </p>
            <p className="mt-1 text-[11px] text-text-muted">
              Web / Slack 経由の RAG 検索が対象
            </p>
          </Card>

          <Card padding="md">
            <p className="text-xs text-text-muted">取り込み状況（現行版のみ）</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex justify-between">
                <span className="text-text-muted">処理中</span>
                <span className="font-semibold tabular text-text-primary">
                  {data.ingestionSummary.processing}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-text-muted">再試行中</span>
                <span className="font-semibold tabular text-text-primary">
                  {data.ingestionSummary.retrying}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-text-muted">失敗</span>
                <span
                  className={`font-semibold tabular ${
                    data.ingestionSummary.failed > 0 ? 'text-status-danger' : 'text-text-primary'
                  }`}
                >
                  {data.ingestionSummary.failed}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-text-muted">直近 24h 成功</span>
                <span className="font-semibold tabular text-text-primary">
                  {data.ingestionSummary.successToday}
                </span>
              </li>
            </ul>
          </Card>
        </div>

        <Card padding="lg">
          <CardHeader
            title="部署別の登録資料"
            description="現在有効な文書（is_active=true）の件数"
          />
          <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {data.documentsByDepartment.map((d) => (
              <li
                key={d.department}
                className="flex items-center justify-between rounded-inline border border-border bg-white px-3 py-2 text-sm"
              >
                <span className="text-text-muted">{departmentLabel(d.department)}</span>
                <span className="font-semibold tabular text-text-primary">
                  {d.count}
                  <span className="ml-0.5 text-xs font-normal text-text-muted">件</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
