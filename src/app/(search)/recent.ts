/**
 * 検索履歴（この端末のブラウザ内のみ・サーバー DB には保存しない）
 * 参照：architecture.md §12B.4（監査ログには残すが UI 履歴は別）
 */

const KEY = 'case7:recent-searches';
const MAX = 10;

export interface RecentEntry {
  question: string;
  at: number;
}

export function readRecentSearches(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is RecentEntry =>
          typeof v === 'object' &&
          v !== null &&
          typeof (v as RecentEntry).question === 'string' &&
          typeof (v as RecentEntry).at === 'number',
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentSearch(question: string): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const list = readRecentSearches().filter((e) => e.question !== question);
  list.unshift({ question, at: now });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 保存に失敗しても機能自体は継続
  }
}

export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
