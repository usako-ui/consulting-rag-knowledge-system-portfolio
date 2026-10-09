import Link from 'next/link'
import { SearchDemo } from '@/components/SearchDemo'
import { siteConfig } from '@/lib/config'

export const metadata = {
  title: `デモ体験 | ${siteConfig.name}`,
  description: siteConfig.description,
}

export default function DemoPage() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#060d26 0%,#0f1a45 60%,#1a1060 100%)' }}>

      {/* Header */}
      <header className="border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ background: 'rgba(8,15,43,0.9)', backdropFilter: 'blur(12px)' }}>
        <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          トップに戻る
        </Link>
        <span className="font-semibold text-white text-sm">{siteConfig.name}</span>
        <span className="text-xs text-indigo-300 border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 rounded-full">
          デモ（架空文書）
        </span>
      </header>

      {/* Main */}
      <div className="max-w-2xl mx-auto px-6 py-14">
        <p className="text-indigo-400 font-semibold text-xs tracking-widest uppercase mb-3">Live Demo</p>
        <h1 className="text-3xl font-bold text-white mb-3">ナレッジ検索を体験する</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-10">
          架空の社内文書7件への質問を試せます。外部API不使用・環境変数ゼロで動作します。
        </p>

        <div className="rounded-2xl border border-white/10 p-6"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <SearchDemo />
        </div>
      </div>
    </div>
  )
}
