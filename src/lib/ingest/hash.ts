/**
 * 内容ハッシュ計算（SHA-256 HEX）
 *
 * 参照：requirements.md §5（ファイルID＋内容ハッシュで文書識別）
 *       architecture.md §3（documents.content_hash）
 *
 * ファイルバイト列に対して計算する。同一バイト列 → 同一ハッシュを保証。
 */

import { createHash } from 'node:crypto';

export function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
