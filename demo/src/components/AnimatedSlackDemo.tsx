'use client'

import { useState, useEffect } from 'react'

const DEMOS = [
  {
    user: '有給休暇の申請方法を教えてください',
    answer: '就業規程第8条に基づき、原則7日前までに上長へ申請書を提出してください。緊急の場合は当日朝9時までに口頭報告し、翌日に申請書を提出することで対応可能です。',
    sources: ['就業規程 第8条（P.12）', '有給休暇管理マニュアル'],
  },
  {
    user: 'テレワークは週何日まで利用できますか？',
    answer: 'テレワークの実施は週3日を上限とします。実施前日の17時までに上長へ申請が必要です。自宅以外での実施はセキュリティ上の理由から原則禁止です。',
    sources: ['テレワーク規程 P.3-4'],
  },
  {
    user: '経費精算の提出期限はいつですか？',
    answer: '経費精算書の提出期限は毎月末日です。当月分は翌月5日までに経理部へ提出してください。領収書紛失時は「領収書紛失届」で対応できます。',
    sources: ['経費精算規程 第4条（P.6）'],
  },
]

type Phase = 'idle' | 'userTyping' | 'userSent' | 'botThinking' | 'botAnswer'

export function AnimatedSlackDemo() {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [typedChars, setTypedChars] = useState(0)
  const [answerVisible, setAnswerVisible] = useState(false)
  const [sourcesVisible, setSourcesVisible] = useState(false)

  const demo = DEMOS[idx]

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>

    if (phase === 'idle') {
      t = setTimeout(() => { setTypedChars(0); setPhase('userTyping') }, 600)

    } else if (phase === 'userTyping') {
      if (typedChars < demo.user.length) {
        t = setTimeout(() => setTypedChars(c => c + 1), 50)
      } else {
        t = setTimeout(() => setPhase('userSent'), 300)
      }

    } else if (phase === 'userSent') {
      t = setTimeout(() => setPhase('botThinking'), 400)

    } else if (phase === 'botThinking') {
      t = setTimeout(() => {
        setAnswerVisible(false)
        setSourcesVisible(false)
        setPhase('botAnswer')
      }, 1200)

    } else if (phase === 'botAnswer') {
      setAnswerVisible(true)
      t = setTimeout(() => setSourcesVisible(true), 600)
      const reset = setTimeout(() => {
        setIdx(i => (i + 1) % DEMOS.length)
        setTypedChars(0)
        setAnswerVisible(false)
        setSourcesVisible(false)
        setPhase('idle')
      }, 4000)
      return () => { clearTimeout(t); clearTimeout(reset) }
    }

    return () => clearTimeout(t)
  }, [phase, typedChars, demo.user.length])

  const userText = demo.user.slice(0, typedChars)
  const showUserMsg = phase === 'userSent' || phase === 'botThinking' || phase === 'botAnswer'

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden select-none"
      style={{ background: '#1a1d21' }}>

      {/* Slack header — Windows style, no Mac dots */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5"
        style={{ background: '#19114a' }}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>K</div>
          <span className="text-white text-xs font-semibold">Knowledge Flow</span>
          <span className="text-slate-500 text-xs">#knowledge-search</span>
        </div>
        {/* Windows-style controls */}
        <div className="flex items-center text-slate-600 text-xs gap-px">
          <span className="w-7 h-5 flex items-center justify-center hover:bg-white/10 cursor-default">─</span>
          <span className="w-7 h-5 flex items-center justify-center hover:bg-white/10 cursor-default text-[10px]">☐</span>
          <span className="w-7 h-5 flex items-center justify-center hover:bg-white/10 cursor-default">✕</span>
        </div>
      </div>

      {/* Chat area */}
      <div className="px-4 pt-3 pb-2" style={{ minHeight: '160px' }}>

        {/* Previous faded message (context) */}
        <div className="flex items-start gap-2.5 mb-3 opacity-30">
          <div className="w-6 h-6 rounded bg-slate-600 shrink-0 flex items-center justify-center text-xs text-slate-300 font-bold">U</div>
          <div>
            <span className="text-slate-400 text-xs font-semibold mr-2">ユーザー</span>
            <span className="text-slate-600 text-xs">前の質問...</span>
          </div>
        </div>

        {/* User typing in input OR sent message */}
        {(phase === 'userTyping' || showUserMsg) && (
          <div className="flex items-start gap-2.5 mb-3">
            <div className="w-6 h-6 rounded bg-indigo-600/40 shrink-0 flex items-center justify-center text-xs text-indigo-300 font-bold">U</div>
            <div>
              <span className="text-slate-300 text-xs font-semibold mr-2">ユーザー</span>
              <p className="text-slate-200 text-xs mt-0.5">
                {showUserMsg ? demo.user : userText}
                {phase === 'userTyping' && (
                  <span className="inline-block w-0.5 h-3 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                )}
              </p>
            </div>
          </div>
        )}

        {/* Bot thinking */}
        {phase === 'botThinking' && (
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded shrink-0 flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>AI</div>
            <div>
              <span className="text-indigo-300 text-xs font-semibold">Knowledge Bot</span>
              <div className="flex items-center gap-1 mt-1">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                    style={{ animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bot answer */}
        {phase === 'botAnswer' && (
          <div className="flex items-start gap-2.5"
            style={{ opacity: answerVisible ? 1 : 0, transform: answerVisible ? 'translateY(0)' : 'translateY(4px)', transition: 'all 0.4s ease' }}>
            <div className="w-6 h-6 rounded shrink-0 flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>AI</div>
            <div className="flex-1">
              <span className="text-indigo-300 text-xs font-semibold">Knowledge Bot</span>
              <p className="text-slate-300 text-xs mt-0.5 leading-relaxed">{demo.answer}</p>
              {sourcesVisible && (
                <div className="flex flex-wrap gap-1.5 mt-2"
                  style={{ opacity: sourcesVisible ? 1 : 0, transition: 'opacity 0.3s ease' }}>
                  {demo.sources.map(s => (
                    <span key={s} className="text-xs text-indigo-300 border border-indigo-400/25 bg-indigo-500/10 rounded px-2 py-0.5">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/8 px-3 py-2"
          style={{ background: '#222529' }}>
          <span className="text-xs flex-1 text-slate-500 truncate">
            {phase === 'userTyping' ? userText : 'メッセージを入力...'}
            {phase === 'userTyping' && (
              <span className="inline-block w-0.5 h-3 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
            )}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className={`w-3.5 h-3.5 shrink-0 ${phase === 'userTyping' && typedChars > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}
