/**
 * Slack 経由の RAG 実行ラッパー（部署越境防止・二重防御）
 *
 * 参照：requirements.md §4・§18, agent-brief.md §3.1
 *
 * Web の /api/search は Supabase セッション cookie + RLS で権限制御しているが、
 * Slack にはブラウザセッションが存在しないため、service_role クライアントを使う。
 * その代わり **アプリ層で部署フィルターを強制** し、返却チャンクにも
 * 部署違反がないか二重チェックする（RLS 相当を app レイヤで再現）。
 *
 * ★ requirements.md §18「別々の RAG ロジックを作らない」
 *   → 実際に検索・回答生成する部分は Web と同じ answerQuestion() を呼ぶ。
 *     このモジュールは「Slack から呼ぶ場合の認可を Web 相当に揃える」薄いラッパー。
 */

import { answerQuestion } from '@/lib/rag/answer';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { RagAnswer } from '@/lib/rag/types';
import type { SlackAuthenticatedUser } from './user-resolver';

export async function runRagForSlackUser(
  question: string,
  user: SlackAuthenticatedUser,
): Promise<RagAnswer> {
  const client = getServiceRoleClient();

  // 一般ユーザーは自部署に強制フィルター。管理者は null（全部署）
  const forcedDepartment = user.role === 'admin' ? null : user.department;

  const result = await answerQuestion(
    {
      question,
      filters: {
        department: forcedDepartment,
        createdYear: null,
        clientName: null,
      },
    },
    client,
  );

  // 二重防御：一般ユーザー向け結果に他部署の出典が混入していないか最終チェック
  if (forcedDepartment !== null) {
    for (const source of result.sources) {
      if (source.department !== forcedDepartment) {
        // ここに到達したら実装バグ or DB 汚染。安全側に倒して空回答を返す
        return {
          grounding: 'insufficient',
          answer: '登録されている資料から該当する情報が見つかりませんでした。',
          sources: [],
          reason: `cross_department_leak_blocked (${source.department} vs ${forcedDepartment})`,
          meta: result.meta,
        };
      }
    }
  }

  return result;
}
