'use client'

import { useState } from 'react'
import { knowledgeBase, SUGGESTED_QUESTIONS } from '@/data/knowledgeBase'
import { sampleQA } from '@/data/sampleQA'
import { embedChunks, ragSearch, GeminiError, RagResult } from '@/lib/ragSearch'

// ─── 静的マッチング（3-gramでモデルなし・外部API不使用）───────────────────────
function ngrams(str: string, n: number): string[] {
  const result: string[] = []
  for (let i = 0; i <= str.length - n; i++) result.push(str.slice(i, i + n))
  return result
}

function ngramScore(query: string, target: string, n = 3): number {
  const qGrams = ngrams(query.toLowerCase(), n)
  if (qGrams.length === 0) return 0
  const tSet = new Set(ngrams(target.toLowerCase(), n))
  return qGrams.filter(g => tSet.has(g)).length / qGrams.length
}

function staticSearch(query: string): RagResult | null {
  const q = query.trim()
  if (!q) return null

  // sampleQA: n-gramスコア閾値 0.4
  let bestQAScore = 0
  let bestQA: (typeof sampleQA)[number] | null = null
  for (const item of sampleQA) {
    const score = ngramScore(q, item.question)
    if (score > bestQAScore) { bestQAScore = score; bestQA = item }
  }
  if (bestQAScore >= 0.4 && bestQA) {
    return { answerable: true, main: bestQA.answer, sources: bestQA.sources }
  }

  // knowledgeBase フォールバック: n-gramスコア閾値 0.15
  let bestChunkScore = 0
  let bestChunk: (typeof knowledgeBase)[number] | null = null
  for (const chunk of knowledgeBase) {
    const score = ngramScore(q, chunk.title + chunk.content)
    if (score > bestChunkScore) { bestChunkScore = score; bestChunk = chunk }
  }
  if (bestChunkScore >= 0.15 && bestChunk) {
    return {
      answerable: true,
      main: bestChunk.content,
      sources: [{ title: bestChunk.title, page: bestChunk.page }],
    }
  }

  return null
}

// ─── コンポーネント ────────────────────────────────────────────────────────────
type Status = 'idle' | 'embedding' | 'searching' | 'done' | 'nomatch' | 'error'

export function SearchDemo() {
  const [question, setQuestion] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [chunkEmbeddings, setChunkEmbeddings] = useState<number[][] | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<RagResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const useGemini = apiKey.trim().length > 0
  const busy = status === 'embedding' || status === 'searching'

  const clearKey = () => {
    setApiKey('')
    setChunkEmbeddings(null)
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
  }

  const runStaticFallback = (q: string) => {
    const match = staticSearch(q)
    setResult(match)
    setStatus(match ? 'done' : 'nomatch')
  }

  const runSearch = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setErrorMsg('')
    setResult(null)

    if (!useGemini) {
      runStaticFallback(trimmed)
      return
    }

    try {
      let embeddings = chunkEmbeddings
      if (!embeddings) {
        setStatus('embedding')
        embeddings = await embedChunks(apiKey.trim())
        setChunkEmbeddings(embeddings)
      }
      setStatus('searching')
      const res = await ragSearch(trimmed, apiKey.trim(), embeddings)
      setResult(res)
      setStatus('done')
    } catch (e) {
      setErrorMsg(e instanceof GeminiError ? e.message : '予期しないエラーが発生しました。')
      setStatus('error')
    }
  }

  const search = () => runSearch(question)

  const selectSuggested = (q: string) => {
    setQuestion(q)
    runSearch(q)
  }

  return (
    <div className="space-y-6">

      {/* 質問入力 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-white text-sm font-semibold">架空の社内文書に質問する</p>
          {useGemini && (
            <span className="text-xs text-indigo-300 border border-indigo-400/30 bg-indigo-500/10 rounded-full px-2.5 py-0.5">
              {chunkEmbeddings ? 'Gemini検索' : 'Gemini検索（初回準備あり）'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SUGGESTED_QUESTIONS.map(q => (
            <button key={q} onClick={() => selectSuggested(q)}
              disabled={busy}
              className="text-xs text-indigo-300 border border-indigo-400/30 bg-indigo-500/10 rounded-full px-3 py-1 hover:bg-indigo-500/20 transition-colors disabled:opacity-40">
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="例：有給休暇の申請方法を教えてください"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !busy && search()}
            className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button onClick={search}
            disabled={!question.trim() || busy}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 flex items-center gap-2 shrink-0"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            {status === 'searching' ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            )}
            検索
          </button>
        </div>
        {!useGemini && (
          <p className="text-xs text-slate-600 mt-2">架空の社内文書 7件から静的にマッチング（外部API不使用）</p>
        )}
      </div>

      {/* 埋め込み中 */}
      {status === 'embedding' && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex items-center gap-3">
          <span className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin shrink-0" />
          <span className="text-slate-400 text-sm">初回準備中…架空文書 7件を埋め込んでいます（7回のAPI呼び出し）</span>
        </div>
      )}

      {/* マッチなし（静的モードのみ） */}
      {status === 'nomatch' && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <p className="text-amber-300 text-sm font-medium mb-2">デモでは用意した質問のみ回答できます</p>
          <p className="text-slate-400 text-xs mb-3">以下の質問例をお試しください：</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map(q => (
              <button key={q} onClick={() => selectSuggested(q)}
                className="text-xs text-indigo-300 border border-indigo-400/30 bg-indigo-500/10 rounded-full px-3 py-1 hover:bg-indigo-500/20 transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* エラー（Geminiモードのみ） */}
      {status === 'error' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-red-300 text-sm font-medium mb-1">エラーが発生しました</p>
          <p className="text-red-400/80 text-xs mb-3 leading-relaxed">{errorMsg}</p>
          <button
            onClick={() => { setStatus('idle'); runStaticFallback(question) }}
            className="text-xs text-indigo-300 border border-indigo-400/30 bg-indigo-500/10 rounded-full px-3 py-1.5 hover:bg-indigo-500/20 transition-colors">
            静的モードで検索する
          </button>
        </div>
      )}

      {/* 回答 */}
      {status === 'done' && result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="px-5 py-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{result.main}</p>
            </div>
            {/* 出典: answerable=true かつ実際に使用した出典がある場合のみ表示 */}
            {result.answerable && result.sources.length > 0 && (
              <div className="border-t border-white/10 px-5 py-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">出典</p>
                <ul className="space-y-1">
                  {result.sources.map((src, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-400 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>{src.title}　{src.page}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {/* answerable=false のとき質問例を案内 */}
          {!result.answerable && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-amber-300 text-xs mb-2">以下の質問例をお試しください：</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_QUESTIONS.map(q => (
                  <button key={q} onClick={() => selectSuggested(q)}
                    className="text-xs text-indigo-300 border border-indigo-400/30 bg-indigo-500/10 rounded-full px-3 py-1 hover:bg-indigo-500/20 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gemini APIキー設定（任意） */}
      <div className="border-t border-white/10 pt-5">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">
          Gemini APIキーで拡張検索（任意）
        </p>
        <div className="rounded-xl border border-white/10 p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-xs text-slate-400 leading-relaxed">
            キーは保存されず、このブラウザから Google の API にのみ送信されます。テスト用キー推奨。
          </p>
          {!useGemini ? (
            <input
              type="password"
              placeholder="AIza..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-400">
                設定済み（••••{apiKey.slice(-4)}）
              </div>
              <button onClick={clearKey}
                className="text-xs text-slate-400 hover:text-red-400 transition-colors border border-white/10 rounded-xl px-3 py-2.5 shrink-0">
                クリア
              </button>
            </div>
          )}
          {useGemini && (
            <p className="text-xs text-slate-600 leading-relaxed">
              初回検索：文書7件の埋め込み（7回）＋クエリ埋め込み（1回）＋生成（1回）= 計9回。
              以降：クエリ埋め込み（1回）＋生成（1回）= 計2回のAPI呼び出し。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
