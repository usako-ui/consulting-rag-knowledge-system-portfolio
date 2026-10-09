import type { Metadata } from 'next';
import { Inter, Noto_Sans_JP } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sans-jp',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans-en',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Consulting RAG ナレッジ検索',
    template: '%s | Consulting RAG',
  },
  description: 'コンサルティング会社向け社内ナレッジ検索システム',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} ${inter.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
