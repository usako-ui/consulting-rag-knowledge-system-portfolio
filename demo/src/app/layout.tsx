import type { Metadata } from 'next'
import './globals.css'
import { siteConfig } from '@/lib/config'

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-white text-slate-900 antialiased">{children}</body>
    </html>
  )
}
