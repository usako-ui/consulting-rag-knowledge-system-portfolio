/**
 * 文書メタデータ抽出
 *
 * 参照：requirements.md §5（ファイルID）, architecture.md §12（検証スコープの取り込み方式）
 *
 * 抽出順序：
 *  1. testdocs/manifest.json（あれば優先）
 *  2. ファイル名規約 `case7-doc{N}-{department}-{topic}.pdf`
 *  3. どちらも該当しなければ metadata_extraction_failed エラー
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Department } from './types';
import { IngestError } from './errors';

const DEPARTMENTS: readonly Department[] = [
  'strategy',
  'business',
  'it',
  'hr',
  'sales',
  'management',
] as const;

const FILENAME_CONVENTION = /^case7-doc(\d+)-(strategy|business|it|hr|sales|management)-(.+)\.pdf$/i;

interface ManifestEntry {
  department: Department;
  title: string;
  createdYear?: number | null;
  clientName?: string | null;
}

export interface ExtractedMetadata {
  department: Department;
  title: string;
  createdYear: number | null;
  clientName: string | null;
}

let manifestCache: Record<string, ManifestEntry> | null = null;

async function loadManifest(testdocsDir: string): Promise<Record<string, ManifestEntry>> {
  if (manifestCache !== null) return manifestCache;

  const manifestPath = join(testdocsDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    manifestCache = {};
    return manifestCache;
  }

  try {
    const raw = await readFile(manifestPath, 'utf-8');
    manifestCache = JSON.parse(raw) as Record<string, ManifestEntry>;
    return manifestCache;
  } catch (err) {
    // manifest.json が壊れていても取り込み全体を止めない。ファイル名規約にフォールバック
    manifestCache = {};
    return manifestCache;
  }
}

/**
 * ファイル名またはマニフェストからメタデータを抽出する。
 * どちらでも判定できない場合は IngestError('metadata_extraction_failed') を投げる。
 */
export async function extractMetadata(
  filePath: string,
  testdocsDir: string,
): Promise<ExtractedMetadata> {
  const filename = basename(filePath);
  const manifest = await loadManifest(testdocsDir);

  // 1. manifest 優先
  const manifestEntry = manifest[filename];
  if (manifestEntry && DEPARTMENTS.includes(manifestEntry.department)) {
    return {
      department: manifestEntry.department,
      title: manifestEntry.title || slugToTitle(filename),
      createdYear: manifestEntry.createdYear ?? null,
      clientName: manifestEntry.clientName ?? null,
    };
  }

  // 2. ファイル名規約
  const m = filename.match(FILENAME_CONVENTION);
  if (m) {
    const dept = m[2].toLowerCase() as Department;
    const topicSlug = m[3];
    return {
      department: dept,
      title: slugToTitle(topicSlug),
      createdYear: null,
      clientName: null,
    };
  }

  // 3. 失敗
  throw new IngestError(
    'metadata_extraction_failed',
    `ファイル名からメタデータを抽出できません: ${filename}（規約: case7-docN-{department}-{topic}.pdf）`,
    false,
  );
}

/** ケバブケースを人間可読なタイトルに変換：`dx-bank` → `DX Bank` */
function slugToTitle(slug: string): string {
  return slug
    .replace(/\.pdf$/i, '')
    .split('-')
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** テスト・CLI 再実行時のキャッシュリセット */
export function resetManifestCache(): void {
  manifestCache = null;
}
