/**
 * POST /api/dispatch/ingest
 * GitHub Actions の ingest.yml を workflow_dispatch で起動する（管理者専用）
 *
 * 参照：requirements.md §13, architecture.md §10（段階2）
 *
 * 利用ケース：
 *   - アップロード後の自動起動（upload-complete 後にフロントから呼ぶ将来用途）
 *   - 待機中が 30 分を超えた行の復旧ボタン（取り込み状況画面）
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError, requireUser } from '@/lib/auth/session';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { serverEnv } from '@/lib/env';

export async function POST() {
  try {
    const user = await requireUser();
    if (user.role !== 'admin') {
      return NextResponse.json({ ok: false, error: '管理者権限が必要です' }, { status: 403 });
    }

    const token = serverEnv.githubDispatchToken();
    const repo = serverEnv.githubRepo();

    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/ingest.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );

    if (!ghRes.ok) {
      const body = await ghRes.text().catch(() => '');
      console.error('[dispatch/ingest] GitHub API エラー:', ghRes.status, body.slice(0, 200));
      return NextResponse.json(
        { ok: false, error: '取り込みの起動に失敗しました。しばらく待って再度お試しください' },
        { status: 502 },
      );
    }

    // 監査ログ
    const supabase = getServiceRoleClient();
    await supabase.from('audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action_type: 'create',
      target_type: 'workflow_dispatch',
      target_id: null,
      target_department: null,
      details: { workflow: 'ingest.yml', ref: 'main', triggered_by: 'admin_manual' },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      const status = err.reason === 'suspended' ? 403 : 401;
      const message =
        err.reason === 'suspended' ? 'このアカウントは現在利用できません' : 'ログインが必要です';
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    return NextResponse.json({ ok: false, error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
