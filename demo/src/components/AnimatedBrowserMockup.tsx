'use client'

import { useState, useEffect } from 'react'

const DEMOS = [
  {
    question: '有給休暇の申請方法を教えてください',
    answer: '有給休暇の申請は就業規程第8条に基づき、原則として7日前までに上長へ申請書を提出してください。緊急の場合は当日朝9時までに口頭報告し、翌日に申請書を提出することで対応可能です。',
    sources: ['就業規程 第8条（P.12）', '有給休暇管理マニュアル P.3'],
  },
  {
    question: 'テレワークは週何日まで利用できますか？',
    answer: 'テレワークの実施は週3日を上限とします。実施前日の17時までに上長へ申請してください。自宅以外（カフェ等）での実施はセキュリティ上の理由から原則禁止です。',
    sources: ['テレワーク規程 P.3-4'],
  },
  {
    question: '経費精算の提出期限はいつですか？',
    answer: '経費精算書の提出期限は毎月末日です。当月分は翌月5日までに経理部へ提出してください。領収書を紛失した場合は「領収書紛失届」を別途提出することで受理されます。',
    sources: ['経費精算規程 第4条（P.6）'],
  },
  {
    question: '情報セキュリティポリシーの基本方針は？',
    answer: '基本方針として3点を定めています。①情報へのアクセスは最小権限の原則を適用、②機密情報は暗号化して保管、③社外への情報持ち出しは部門長の承認が必要です。',
    sources: ['情報セキュリティポリシー 第2章（P.8）'],
  },
]

type Phase = 'typing' | 'thinking' | 'answer' | 'pause'

export function AnimatedBrowserMockup() {
  const [demoIndex, setDemoIndex] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const [answerVisible, setAnswerVisible] = useState(false)

  const demo = DEMOS[demoIndex]
  const typedText = demo.question.slice(0, typedChars)

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    if (phase === 'typing') {
      if (typedChars < demo.question.length) {
        t = setTimeout(() => setTypedChars(c => c + 1), 55)
      } else {
        t = setTimeout(() => setPhase('thinking'), 500)
      }
    } else if (phase === 'thinking') {
      t = setTimeout(() => { setAnswerVisible(false); setPhase('answer') }, 1400)
    } else if (phase === 'answer') {
      setAnswerVisible(true)
      t = setTimeout(() => setPhase('pause'), 3200)
    } else {
      t = setTimeout(() => {
        setDemoIndex(i => (i + 1) % DEMOS.length)
        setTypedChars(0)
        setAnswerVisible(false)
        setPhase('typing')
      }, 900)
    }
    return () => clearTimeout(t)
  }, [phase, typedChars, demo.question.length])

  return (
    /* ── Monitor + stand ───────────────────────── */
    <div className="w-full max-w-lg mx-auto select-none">

      {/* Bezel */}
      <div className="rounded-xl p-2 shadow-2xl shadow-indigo-950/60"
        style={{ background: 'linear-gradient(160deg,#23233a,#191929)' }}>

        {/* Browser window */}
        <div className="rounded-lg overflow-hidden border border-white/5">

          {/* Title bar — Windows style */}
          <div className="flex items-center justify-between px-2 py-1"
            style={{ background: '#2a2a3e' }}>
            {/* Tab */}
            <div className="flex items-center gap-1.5 rounded-t-md px-3 py-1 text-xs text-slate-300"
              style={{ background: '#1e1e30' }}>
              <span className="w-3 h-3 rounded-full shrink-0"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }} />
              Knowledge Flow — 社内ナレッジ検索
            </div>
            {/* Windows controls */}
            <div className="flex items-center text-slate-500 text-xs ml-4">
              <span className="w-9 h-6 flex items-center justify-center hover:bg-white/10 cursor-default">─</span>
              <span className="w-9 h-6 flex items-center justify-center hover:bg-white/10 cursor-default text-[10px]">☐</span>
              <span className="w-9 h-6 flex items-center justify-center hover:bg-red-500/70 hover:text-white cursor-default">✕</span>
            </div>
          </div>

          {/* Address bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5"
            style={{ background: '#232334' }}>
            <div className="flex gap-1.5 text-slate-600 text-xs select-none">
              <span>‹</span><span>›</span><span>↻</span>
            </div>
            <div className="flex-1 flex items-center gap-1.5 rounded px-3 py-1 text-xs text-slate-400 border border-white/8"
              style={{ background: '#1a1a2e' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="w-3 h-3 text-slate-600 shrink-0">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              knowledge-flow.vercel.app
            </div>
          </div>

          {/* App UI */}
          <div className="p-4" style={{ minHeight: '230px', background: '#0f1a38' }}>

            {/* Sidebar + main */}
            <div className="flex gap-3 h-full">
              {/* Mini sidebar */}
              <div className="w-8 shrink-0 flex flex-col items-center gap-2.5 pt-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-white">
                    <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-slate-500">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
              </div>

              {/* Main content */}
              <div className="flex-1 overflow-hidden">
                {/* Search input */}
                <div
                  className="flex items-center gap-2 rounded-xl border px-3 py-2.5 mb-3 transition-all duration-300"
                  style={{
                    background: '#182240',
                    borderColor: phase === 'typing' ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.08)',
                    boxShadow: phase === 'typing' ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="w-3.5 h-3.5 shrink-0 text-slate-500">
                    <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <span className="text-xs text-slate-300 flex-1 truncate min-h-[1rem]">
                    {typedText}
                    {phase === 'typing' && (
                      <span className="inline-block w-0.5 h-3.5 bg-indigo-400 ml-px align-text-bottom animate-pulse" />
                    )}
                  </span>
                  {phase !== 'typing' && typedText && (
                    <span className="text-xs text-indigo-400 font-medium shrink-0">Enter ↵</span>
                  )}
                </div>

                {/* Thinking */}
                {phase === 'thinking' && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
                    <span className="w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin shrink-0" />
                    社内文書を検索しています...
                  </div>
                )}

                {/* Answer */}
                {(phase === 'answer' || phase === 'pause') && (
                  <div
                    className="transition-all duration-500"
                    style={{
                      opacity: answerVisible ? 1 : 0,
                      transform: answerVisible ? 'translateY(0)' : 'translateY(6px)',
                    }}>
                    <p className="text-xs text-slate-300 leading-relaxed mb-2.5 line-clamp-3">
                      {demo.answer}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">出典</p>
                    {demo.sources.map((s, i) => (
                      <div key={i}
                        className="flex items-center gap-1.5 rounded-lg border border-white/5 px-2.5 py-1.5 mb-1 text-[11px]"
                        style={{ background: '#182240' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                        <span className="text-slate-400 truncate">{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monitor stand */}
      <div className="flex flex-col items-center">
        <div className="w-16 h-4 rounded-b-sm" style={{ background: 'linear-gradient(180deg,#23233a,#1a1a2a)' }} />
        <div className="w-28 h-1.5 rounded-full" style={{ background: '#16162a' }} />
      </div>
    </div>
  )
}
