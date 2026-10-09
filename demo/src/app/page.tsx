'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { useState } from 'react'
import { siteConfig } from '@/lib/config'
import { AnimatedBrowserMockup } from '@/components/AnimatedBrowserMockup'
import { AnimatedSlackDemo } from '@/components/AnimatedSlackDemo'

/* ───────────────── SVG icons ───────────────── */
function IconSearch({ cls = 'w-5 h-5' }: { cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function IconDoc({ cls = 'w-5 h-5' }: { cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" className="w-5 h-5">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

/* ───────────────── Flow step icons ───────────── */
const stepIcons = {
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  vector: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" className="w-6 h-6">
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="4.5" cy="5" r="1.5" /><circle cx="19.5" cy="5" r="1.5" />
      <circle cx="4.5" cy="19" r="1.5" /><circle cx="19.5" cy="19" r="1.5" />
      <line x1="5.8" y1="6.3" x2="10.6" y2="10.6" />
      <line x1="18.2" y1="6.3" x2="13.4" y2="10.6" />
      <line x1="5.8" y1="17.7" x2="10.6" y2="13.4" />
      <line x1="18.2" y1="17.7" x2="13.4" y2="13.4" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8.5" y1="11" x2="13.5" y2="11" /><line x1="11" y1="8.5" x2="11" y2="13.5" />
    </svg>
  ),
  generate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="9" y1="10" x2="15" y2="10" /><line x1="9" y1="14" x2="12" y2="14" />
    </svg>
  ),
  notify: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
}

/* BrowserMockup → AnimatedBrowserMockup に移行 */

/* ───────────────── Nav ───────────────── */
function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/8"
      style={{ background: 'rgba(8,15,43,0.85)', backdropFilter: 'blur(12px)' }}>
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        {/* Logo */}
        <span className="font-bold text-white text-base tracking-tight flex items-center gap-2">
          <span className="w-6 h-6 rounded-md flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            <IconSearch cls="w-3.5 h-3.5" />
          </span>
          {siteConfig.name}
        </span>
        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#problems" className="hover:text-white transition-colors">課題</a>
          <a href="#demo"     className="hover:text-white transition-colors">デモ</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">仕組み</a>
        </div>
        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link href={siteConfig.demoPath}
            className="text-sm px-4 py-1.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            試してみる
          </Link>
        </div>
        {/* Mobile hamburger */}
        <button className="md:hidden text-slate-400" onClick={() => setOpen(o => !o)} aria-label="menu">
          <IconMenu />
        </button>
      </div>
      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-white/8 px-6 py-4 flex flex-col gap-4 text-sm text-slate-300"
          style={{ background: '#080f2b' }}>
          <a href="#problems"    onClick={() => setOpen(false)}>課題</a>
          <a href="#demo"        onClick={() => setOpen(false)}>デモ</a>
          <a href="#how-it-works" onClick={() => setOpen(false)}>仕組み</a>
          <Link href={siteConfig.demoPath} onClick={() => setOpen(false)}
            className="text-center px-4 py-2 rounded-lg font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            試してみる
          </Link>
        </div>
      )}
    </nav>
  )
}

/* ───────────────── Static data ───────────────── */
const problems = [
  {
    color: 'from-blue-500 to-indigo-500',
    title: '探すのに時間がかかる',
    desc: 'フォルダが複数あり、最新版と旧版が混在。目的の資料を見つけるまでに多大な時間を要します。',
  },
  {
    color: 'from-violet-500 to-purple-600',
    title: '担当者への問い合わせが集中',
    desc: '同じ質問を何度も受け、担当者の業務時間が圧迫。チャットやメールの対応で本来業務が滞ります。',
  },
  {
    color: 'from-indigo-400 to-cyan-500',
    title: '情報が属人化している',
    desc: '口頭説明に頼った暗黙知が担当者退職とともに失われます。文書化されていない知識を共有できません。',
  },
  {
    color: 'from-purple-500 to-pink-500',
    title: '夜間・休日は即答できない',
    desc: '担当者が不在の時間帯に問い合わせが来ても対応不可。対応待ちが翌朝に持ち越されます。',
  },
]

const howItWorks = [
  { icon: stepIcons.doc,      label: '資料アップロード', sub: 'PDF / Word' },
  { icon: stepIcons.vector,   label: 'ベクトル化',       sub: '自動インデックス' },
  { icon: stepIcons.search,   label: 'RAG検索',          sub: '意味ベース検索' },
  { icon: stepIcons.generate, label: '回答生成',          sub: '出典付きで出力' },
  { icon: stepIcons.notify,   label: 'チャット通知',     sub: 'Slack連携' },
]

/* ───────────────── Page ───────────────── */
export default function LandingPage() {
  return (
    <>
      <Nav />

      <main className="pt-14">

        {/* ── Block 1: Hero ───────────────────────── */}
        <section
          className="relative overflow-hidden px-6 py-24 md:py-32"
          style={{ background: 'linear-gradient(145deg,#060d26 0%,#0f1a45 45%,#1a1060 100%)' }}
        >
          {/* Grid overlay */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                'linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)',
              backgroundSize: '56px 56px',
            }} />
          {/* Glow blobs */}
          <div aria-hidden className="pointer-events-none absolute -top-32 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
            style={{ background: 'radial-gradient(circle,#6366f1,transparent 70%)' }} />
          <div aria-hidden className="pointer-events-none absolute bottom-0 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-15"
            style={{ background: 'radial-gradient(circle,#a855f7,transparent 70%)' }} />

          <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-16">
            {/* Left: text */}
            <div className="flex-1 text-white text-center md:text-left">
              <span className="inline-block px-3 py-1 rounded-full border border-indigo-400/40 bg-indigo-500/10 text-indigo-300 text-xs font-semibold tracking-widest uppercase mb-6">
                RAG × Slack
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight mb-6">
                探す時間を減らし、<br />
                <span className="text-transparent bg-clip-text"
                  style={{ backgroundImage: 'linear-gradient(90deg,#818cf8 20%,#c084fc 80%)' }}>
                  考える時間を増やす。
                </span>
              </h1>
              <p className="text-slate-400 text-base leading-relaxed mb-10 max-w-md mx-auto md:mx-0">
                PDF・Word資料を自動取り込み。Slackから質問するだけで、
                AIが社内文書を横断検索し、<strong className="text-slate-200 font-medium">出典付きで即答</strong>します。
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start mb-10">
                <Link href={siteConfig.demoPath}
                  className="rounded-xl px-7 py-3 font-semibold text-white text-sm text-center transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                  デモを体験する
                </Link>
                <a href="#how-it-works"
                  className="rounded-xl px-7 py-3 font-semibold text-slate-300 text-sm text-center border border-slate-600 hover:border-indigo-400 hover:text-white transition-colors">
                  仕組みを見る
                </a>
              </div>
              {/* Tech badges */}
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {['Slack連携', 'PDF・Word対応', '出典付き回答', '部署別アクセス制御'].map(t => (
                  <span key={t}
                    className="text-xs text-slate-400 border border-white/10 rounded-full px-3 py-1"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: browser mockup */}
            <div className="flex-1 w-full">
              <AnimatedBrowserMockup />
            </div>
          </div>
        </section>

        {/* ── Block 2: 課題4カード ─────────────────── */}
        <section id="problems" className="py-24 bg-white px-6">
          <div className="max-w-5xl mx-auto">
            <p className="text-center text-indigo-600 font-semibold text-xs tracking-widest uppercase mb-3">Problems</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-slate-900 mb-4">
              こんな課題を、<br className="sm:hidden" />解決します。
            </h2>
            <p className="text-slate-400 text-center text-sm mb-14 max-w-lg mx-auto">
              社内の情報共有・問い合わせ対応にかかる非効率を、RAG技術でまとめて解消します。
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {problems.map((p, i) => (
                <div key={i} className="rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-4`}>
                    <span className="text-white font-bold text-xs">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-2 text-sm leading-snug">{p.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Block 3: デモ紹介 ─────────────────────── */}
        <section id="demo"
          className="py-24 px-6"
          style={{ background: 'linear-gradient(160deg,#0b1437 0%,#10183a 100%)' }}>
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12">
            {/* Left: text */}
            <div className="md:w-2/5 text-white shrink-0">
              <p className="text-indigo-400 font-semibold text-xs tracking-widest uppercase mb-3">Live Demo</p>
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-5">
                実際の画面で<br />デモを体験<br className="hidden md:block" />いただけます。
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-8">
                架空の社内文書7件を横断検索できるデモです。外部API不使用・環境変数ゼロで動作します。
              </p>
              <Link href={siteConfig.demoPath}
                className="inline-flex items-center gap-2 text-sm px-6 py-2.5 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                デモを体験する
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </Link>
            </div>

            {/* Right: Animated Slack demo */}
            <div className="flex-1 w-full">
              <AnimatedSlackDemo />
            </div>
          </div>
        </section>

        {/* ── Block 4: 仕組み ───────────────────────── */}
        <section id="how-it-works"
          className="py-24 px-6"
          style={{ background: 'linear-gradient(180deg,#eef2ff 0%,#f5f3ff 100%)' }}>
          <div className="max-w-5xl mx-auto">
            <p className="text-center text-indigo-600 font-semibold text-xs tracking-widest uppercase mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-slate-900 mb-4">
              シンプルな仕組みで、<br className="sm:hidden" />
              社内のナレッジを最大限に活用。
            </h2>
            <p className="text-slate-500 text-sm text-center mb-14 max-w-xl mx-auto">
              アップロードした資料は自動的にベクトル化され、Slackからの質問に対してRAGが最適な回答を生成します。
            </p>

            {/* Steps: horizontal on md+, vertical on mobile */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-2">
              {howItWorks.map((step, i) => (
                <Fragment key={step.label}>
                  <div className="flex flex-col items-center text-center rounded-2xl border border-indigo-100 bg-white shadow-sm p-5 w-full md:w-32 shrink-0">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 text-white"
                      style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                      {step.icon}
                    </div>
                    <span className="text-xs font-semibold text-slate-800 leading-snug mb-1">{step.label}</span>
                    <span className="text-xs text-slate-400">{step.sub}</span>
                  </div>
                  {i < howItWorks.length - 1 && (
                    <div className="rotate-90 md:rotate-0 shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-indigo-300">
                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                      </svg>
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* ── Block 5: CTA ──────────────────────────── */}
        <section
          className="py-24 px-6 text-white text-center"
          style={{ background: 'linear-gradient(145deg,#060d26 0%,#0f1a45 60%,#1a1060 100%)' }}>
          <p className="text-indigo-400 font-semibold text-xs tracking-widest uppercase mb-4">Contact</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            あなたの業務に、<br className="sm:hidden" />こんな仕組みを。
          </h2>
          <p className="text-slate-400 text-sm max-w-xl mx-auto mb-3 leading-relaxed">
            社内の資料から、必要な答えを出典つきで探せる仕組みです。<br />
            「こんな資料でも探せる？」「自社の場合は？」など、<br />
            お気軽にご相談ください。
          </p>
          <p className="text-slate-600 text-xs mb-10">
            Next.js ・ Supabase ・ Gemini ・ Slack
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            {siteConfig.contactUrl ? (
              <a href={siteConfig.contactUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl px-7 py-3 font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                ご相談はこちら
              </a>
            ) : (
              <span className="inline-flex items-center justify-center rounded-xl px-7 py-3 font-semibold text-sm text-slate-500 border border-white/10 cursor-default">
                ご相談窓口 準備中
              </span>
            )}
            <Link href={siteConfig.demoPath}
              className="inline-flex items-center justify-center rounded-xl px-7 py-3 font-semibold text-sm border border-indigo-400/40 text-indigo-200 hover:border-indigo-300 hover:text-white transition-colors">
              デモをもう一度体験する
            </Link>
          </div>
        </section>

      </main>
    </>
  )
}
