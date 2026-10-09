'use client';

import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-status-danger px-4 py-2 text-xs font-medium text-white"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      オフラインです。ネットワーク接続を確認してください。復旧すると自動で操作できます。
    </div>
  );
}
