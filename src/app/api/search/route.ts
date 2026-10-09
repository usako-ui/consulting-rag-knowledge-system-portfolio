/**
 * POST /api/search
 * 認証必須の RAG 検索エンドポイント
 *
 * 参照：requirements.md §4・§7・§8・§16, architecture.md §12B
 *
 * フロー：
 *   1. requireUser() で認証（Day1 二重防御の起点）
 *   2. zod でリクエストバリデーション
 *   3. 一般ユーザーの部署越境フィルターを事前拒否（403）
 *   4. answerQuestion() で検索＋回答
 *   5. audit_log 記録（質問は先頭50文字まで truncate）
 *   6. api_usage_log 記録（Embedding + Chat のトークン数）
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/session';
import { answerQuestion } from '@/lib/rag/answer';
import { RagError, toUserMessage } from '@/lib/rag/errors';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@/lib/supabase/server';
import { recordSearchFailure } from '@/lib/admin/search-failure-log';

const DEPARTMENTS = ['strategy', 'business', 'it', 'hr', 'sales', 'management'] as const;

const requestSchema = z.object({
  question: z
    .string()
    .min(1, '質問を入力してください')
    .max(1000, '質問は1000文字以内で入力してください'),
  filters: z
    .object({
      department: z.enum(DEPARTMENTS).nullable().default(null),
      createdYear: z.number().int().min(1900).max(2100).nullable().default(null),
      clientName: z.string().max(100).nullable().default(null),
    })
    .default({ department: null, createdYear: null, clientName: null }),
});

const AUDIT_QUESTION_MAX_CHARS = 50;

export const maxDuration = 30;

export async function POST(request: Request) {
  // catch ブロックで参照できるよう外側で宣言（G-7 失敗記録）
  let authedUser: Awaited<ReturnType<typeof requireUser>> | null = null;

  try {
    authedUser = await requireUser();
    const user = authedUser;

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' },
        { status: 400 },
      );
    }

    // 一般ユーザーの部署越境フィルターを API 層で事前拒否（RLS でも 0 件になるが、
    // 「なぜ検索結果が空か」の誤解を防ぐため 403 を返す・要件 §4）
    if (
      user.role !== 'admin' &&
      parsed.data.filters.department !== null &&
      parsed.data.filters.department !== user.department
    ) {
      return NextResponse.json(
        { ok: false, error: '指定された部署の検索権限がありません' },
        { status: 403 },
      );
    }

    // 認証済み Supabase クライアントで RAG 実行（RLS が呼び出し元セッションに適用）
    const client = createSupabaseServerClient();
    const result = await answerQuestion(
      { question: parsed.data.question, filters: parsed.data.filters },
      client,
    );

    // 監査ログ：質問文は先頭50文字まで truncate（architecture.md §12B.4 参照・機密情報配慮）
    const service = createSupabaseServiceRoleClient();
    await service.from('audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action_type: 'search',
      target_type: 'search_query',
      target_department: parsed.data.filters.department,
      details: {
        question: parsed.data.question.slice(0, AUDIT_QUESTION_MAX_CHARS),
        grounding: result.grounding,
        source_count: result.sources.length,
        chunks_searched: result.meta.chunksSearched,
        embedding_tokens: result.meta.embeddingTokens,
        chat_tokens: result.meta.chatTokens,
      },
    });

    // API 使用量ログ
    const usageRows = [
      {
        provider: result.meta.provider,
        api_type: 'embedding',
        request_count: 1,
        token_count: result.meta.embeddingTokens,
      },
    ];
    if (result.meta.chatTokens > 0) {
      usageRows.push({
        provider: result.meta.provider,
        api_type: 'llm',
        request_count: 1,
        token_count: result.meta.chatTokens,
      });
    }
    await service.from('api_usage_log').insert(usageRows);

    return NextResponse.json({
      ok: true,
      grounding: result.grounding,
      answer: result.answer,
      sources: result.sources,
      meta: {
        chunksSearched: result.meta.chunksSearched,
        provider: result.meta.provider,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      const status = err.reason === 'suspended' ? 403 : 401;
      const message =
        err.reason === 'suspended' ? 'このアカウントは現在利用できません' : 'ログインが必要です';
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    if (err instanceof RagError) {
      // G-7: 検索失敗を記録（fire-and-forget・失敗しても応答を返す）
      if (authedUser) {
        void recordSearchFailure({
          actorId: authedUser.id,
          actorEmail: authedUser.email,
          errorCode: err.code,
          source: 'web',
        });
      }
      return NextResponse.json(
        { ok: false, error: toUserMessage(err.code) },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}
