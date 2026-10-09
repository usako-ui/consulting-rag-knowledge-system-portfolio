'use client'

import { useState } from 'react'
import { sampleQA } from '@/data/sampleQA'

export function DemoChat({ dark = false }: { dark?: boolean }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [answered, setAnswered] = useState(false)

  const handleSelect = (index: number) => {
    if (loading) return
    setSelectedIndex(index)
    setAnswered(false)
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setAnswered(true)
    }, 600)
  }

  const selected = selectedIndex !== null ? sampleQA[selectedIndex] : null

  const t = dark
    ? {
        hint: 'text-slate-500',
        btn: 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
        btnActive: 'border-indigo-500 bg-indigo-500/15 text-indigo-200',
        answer: 'border-white/8 bg-white/5',
        answerText: 'text-slate-200',
        spinnerBorder: 'border-slate-600 border-t-slate-300',
        loadingText: 'text-slate-500',
        divider: 'border-white/8',
        sourceLabel: 'text-slate-500',
        sourceCard: 'bg-white/5 border-white/5',
        sourceText: 'text-slate-400',
        dot: 'bg-indigo-400',
        sourceMeta: 'text-slate-500',
      }
    : {
        hint: 'text-slate-500',
        btn: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        btnActive: 'border-blue-500 bg-blue-50 text-blue-900',
        answer: 'border-slate-200 bg-slate-50',
        answerText: 'text-slate-800',
        spinnerBorder: 'border-slate-300 border-t-slate-500',
        loadingText: 'text-slate-400',
        divider: 'border-slate-200',
        sourceLabel: 'text-slate-400',
        sourceCard: 'bg-white border-slate-100',
        sourceText: 'text-slate-600',
        dot: 'bg-blue-400',
        sourceMeta: 'text-slate-400',
      }

  return (
    <div>
      <p className={`text-xs ${t.hint} mb-4`}>
        質問を選択すると、AIが社内文書から回答します（架空データのデモです）
      </p>

      {/* 質問ボタン */}
      <div className="space-y-2 mb-6">
        {sampleQA.map((qa, i) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
              selectedIndex === i ? t.btnActive : t.btn
            }`}
          >
            {qa.question}
          </button>
        ))}
      </div>

      {/* 回答エリア */}
      {selected !== null && (
        <div className={`rounded-lg border ${t.answer} p-5`}>
          {loading ? (
            <div className={`flex items-center gap-2 ${t.loadingText} text-sm`}>
              <span className={`inline-block w-4 h-4 border-2 ${t.spinnerBorder} rounded-full animate-spin`} />
              社内文書を検索中...
            </div>
          ) : answered ? (
            <>
              <p className={`${t.answerText} text-sm leading-relaxed mb-4`}>
                {selected.answer}
              </p>
              <div className={`border-t ${t.divider} pt-4`}>
                <p className={`text-xs font-semibold ${t.sourceLabel} uppercase tracking-wide mb-2`}>
                  出典
                </p>
                <ul className="space-y-1">
                  {selected.sources.map((src, i) => (
                    <li key={i}
                      className={`flex items-start gap-2 text-xs ${t.sourceText} ${t.sourceCard} rounded px-3 py-2 border`}>
                      <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${t.dot}`} />
                      <span>
                        <span className="font-medium">{src.title}</span>
                        {' '}
                        <span className={t.sourceMeta}>{src.page}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
