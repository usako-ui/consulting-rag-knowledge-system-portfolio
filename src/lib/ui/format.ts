/**
 * UI表示用フォーマットヘルパー
 */

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

const RTF = new Intl.RelativeTimeFormat('ja-JP', { numeric: 'auto' });

/**
 * 日付を「〇時間前 / 昨日 / 3日前」のような相対表現に変換。
 * サーバーとクライアントで同じ結果になるよう、Date は使わず数値だけで計算する。
 */
export function formatRelativeJa(input: number | string | Date, now: number = Date.now()): string {
  const at = typeof input === 'number' ? input : new Date(input).getTime();
  if (Number.isNaN(at)) return '';
  const diffSec = Math.round((at - now) / 1000);
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(diffSec) >= size) {
      return RTF.format(Math.round(diffSec / size), unit);
    }
  }
  return diffSec >= -30 ? 'たった今' : RTF.format(diffSec, 'second');
}

const DATE_FMT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTimeJa(input: number | string | Date): string {
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return DATE_FMT.format(d);
}

const DATE_ONLY_FMT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateJa(input: number | string | Date): string {
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return DATE_ONLY_FMT.format(d);
}
