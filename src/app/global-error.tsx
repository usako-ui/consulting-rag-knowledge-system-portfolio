'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
    }
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          background: '#F4F6FA',
          color: '#0F1E2E',
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            padding: 28,
            background: '#fff',
            border: '1px solid #E1E6EE',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 18, margin: 0 }}>システムエラーが発生しました</h1>
          <p style={{ marginTop: 8, fontSize: 13, color: '#5A6879' }}>
            ネットワークまたはシステム側の一時的な不調の可能性があります。画面を再読み込みしても改善しない場合は、管理者へ連絡してください。
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 20,
              padding: '10px 18px',
              background: '#0B2D4A',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            もう一度読み込む
          </button>
          {error.digest ? (
            <div style={{ marginTop: 16, fontSize: 11, color: '#5A6879' }}>
              <p style={{ margin: 0 }}>参照コード：{error.digest}</p>
              <p style={{ margin: '2px 0 0 0' }}>
                この英数字は、管理者へお問い合わせの際にお伝えください（原因調査に使用します）。
              </p>
            </div>
          ) : null}
        </div>
      </body>
    </html>
  );
}
