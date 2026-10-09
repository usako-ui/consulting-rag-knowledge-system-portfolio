import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/optional';
import { AdminShell } from '@/components/layout/AdminShell';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { checkSlack, checkSupabase, getLastGeminiCheck } from '@/lib/admin/health-check';
import { readSetting } from '@/lib/admin/settings';
import { readCurrentRetentionDays } from '@/lib/admin/log-retention';
import { ConnectionsSection } from './ConnectionsSection';
import { ApiBudgetSection } from './ApiBudgetSection';
import { LogRetentionSection } from './LogRetentionSection';

export const metadata: Metadata = { title: '設定' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminSettingsPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/login');
  if (!user.passwordChanged) redirect('/password-change');
  if (user.role !== 'admin') redirect('/');

  // 接続状態（Supabase/Slack は毎回チェック・Gemini は保存値のみ表示）
  const [supabaseHealth, slackHealth, geminiLast, budgetRow, retentionDays] = await Promise.all([
    checkSupabase(),
    checkSlack(),
    getLastGeminiCheck(),
    readSetting('monthly_api_budget_tokens'),
    readCurrentRetentionDays(),
  ]);

  const budgetTokens = budgetRow?.value ? Number(budgetRow.value) : 0;

  return (
    <AdminShell
      user={user}
      title="設定"
      description="接続状態・月間 API 予算・ログ保存期間"
    >
      <div className="space-y-5">
        <Alert tone="info" title="このページでできること">
          <ul className="ml-4 list-disc space-y-1 text-[13px]">
            <li>Supabase / Slack の接続状態をページ表示のたびに確認します（Gemini は「確認する」ボタンを押した時だけ API を呼びます）。</li>
            <li>月間 API 予算を変更すると、ダッシュボードのゲージ表示（70/90/100%）が切り替わります。</li>
            <li>ログ保存期間を変更すると、期間を過ぎた監査ログは月次の自動削除ジョブで整理されます。</li>
          </ul>
        </Alert>

        <Card padding="sm">
          <ConnectionsSection
            supabase={supabaseHealth}
            slack={slackHealth}
            geminiLast={geminiLast}
          />
        </Card>

        <Card padding="sm">
          <ApiBudgetSection currentBudget={budgetTokens} />
        </Card>

        <Card padding="sm">
          <LogRetentionSection currentDays={retentionDays} />
        </Card>
      </div>
    </AdminShell>
  );
}
