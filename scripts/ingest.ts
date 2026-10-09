/**
 * CLI エントリポイント：文書取り込み実行
 *
 * 使い方：
 *   npm run ingest                     # testdocs/ 全走査 → enqueue → 実行
 *   npm run ingest -- --dir ./other    # 別ディレクトリを指定
 *
 * 参照：requirements.md §13, architecture.md §12, tasks.md Day2 T-06〜T-09
 *
 * このスクリプトは GitHub Actions のワークフローからも呼ばれる。
 * どちらの環境でも同じパイプライン（src/lib/ingest/）を使う。
 */

import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { enqueue } from '@/lib/ingest/queue';
import { runQueue } from '@/lib/ingest/runner';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

function parseArgs(argv: string[]): { dir: string } {
  let dir = 'testdocs';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      dir = argv[++i];
    }
  }
  return { dir };
}

async function discoverDocuments(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(pdf|docx)$/i.test(e.name))
    .map((e) => e.name)
    .sort();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const testdocsDir = resolve(process.cwd(), args.dir);

  if (!existsSync(testdocsDir)) {
    console.error(`[ingest] ディレクトリが存在しません: ${testdocsDir}`);
    process.exit(2);
  }

  console.log(`[ingest] target dir: ${testdocsDir}`);
  const client = getServiceRoleClient();

  // 1. discover
  const files = await discoverDocuments(testdocsDir);
  console.log(`[ingest] discovered ${files.length} file(s) (PDF/DOCX)`);

  // 2. enqueue（既存の pending/processing/retrying は重複 enqueue を回避）
  let enqueued = 0;
  for (const filename of files) {
    const { wasNew } = await enqueue(filename, client);
    if (wasNew) enqueued++;
  }
  console.log(`[ingest] enqueued ${enqueued} new job(s)`);

  // 3. 実行
  const result = await runQueue({ testdocsDir, client });
  console.log('[ingest] run result:', result);

  const hasPermanentFailure = result.failed > 0;
  process.exit(hasPermanentFailure ? 1 : 0);
}

main().catch((err) => {
  console.error('[ingest] fatal:', err);
  process.exit(1);
});
