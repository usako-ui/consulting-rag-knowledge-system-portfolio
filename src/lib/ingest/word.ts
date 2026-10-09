/**
 * Word（.docx）テキスト抽出
 *
 * 参照：requirements.md §2・§6（PDF/Word対応・セクション単位チャンキング）
 *       architecture.md §12
 *
 * 使用ライブラリ：mammoth
 *  - convertToHtml で H1/H2 見出しスタイルを検出し、セクション構造を保持する
 *  - HTML からプレーンテキストへ変換して本文を抽出する
 *  - .doc（旧形式）は非対応。.docx のみ。
 *
 * ★ 抽出したテキスト本文はログ出力しない（要件 §4）。呼び出し側でも同様の運用とすること。
 */

import mammoth from 'mammoth';
import { IngestError } from './errors';
import { checkZipBomb } from './zip-check';

export interface HtmlSection {
  title: string | null;
  body: string;
}

export interface WordExtractResult {
  text: string;      // 全文（改行・空白は原文寄り）
  pageCount: number; // Word はページ概念なし → 常に 0
  htmlSections: HtmlSection[] | null; // H1/H2 見出しが検出された場合のみ non-null
}

export async function extractWordText(bytes: Buffer): Promise<WordExtractResult> {
  // ZIP 爆弾チェック（.docx は ZIP アーカイブ。mammoth 呼び出し前に展開後サイズを確認）
  const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB ?? '20');
  const zipResult = checkZipBomb(bytes, {
    maxEntries: 1000,
    maxUncompressedMb: maxFileSizeMb * 10,
  });
  if (!zipResult.ok) {
    throw new IngestError('zip_bomb_detected', zipResult.error, false);
  }

  try {
    const htmlResult = await mammoth.convertToHtml({ buffer: bytes });
    const html = htmlResult.value ?? '';
    const text = normalizeText(htmlToText(html));
    if (text.length < 20) {
      throw new IngestError('word_parse_failed', 'Wordファイルからテキストを抽出できませんでした（空のファイルの可能性）', false);
    }
    const htmlSections = parseHtmlSections(html);
    return { text, pageCount: 0, htmlSections };
  } catch (err) {
    if (err instanceof IngestError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new IngestError('word_parse_failed', `Word解析失敗: ${msg}`, false);
  }
}

/**
 * HTML を <h1>/<h2> の境界でセクション分割する。
 * h1/h2 が存在しない場合は null を返す（呼び出し側が HEADING_PATTERNS フォールバックを使用）。
 */
function parseHtmlSections(html: string): HtmlSection[] | null {
  // <h1>...</h1> または <h2>...</h2> をトークンとして分割
  const tokenRe = /(<h[12][^>]*>[\s\S]*?<\/h[12]>)/gi;
  const tokens = html.split(tokenRe);

  if (tokens.length === 1) return null; // h1/h2 なし

  const sections: HtmlSection[] = [];
  let currentTitle: string | null = null;
  let currentBodyParts: string[] = [];

  for (const token of tokens) {
    if (/^<h[12]/i.test(token.trim())) {
      // 前のセクションを確定
      const body = normalizeText(htmlToText(currentBodyParts.join('')));
      if (currentTitle !== null || body.length > 0) {
        sections.push({ title: currentTitle, body });
      }
      currentTitle = htmlToText(token).trim();
      currentBodyParts = [];
    } else {
      currentBodyParts.push(token);
    }
  }
  // 最後のセクション
  const lastBody = normalizeText(htmlToText(currentBodyParts.join('')));
  if (currentTitle !== null || lastBody.length > 0) {
    sections.push({ title: currentTitle, body: lastBody });
  }

  const hasHeadings = sections.some((s) => s.title !== null);
  if (!hasHeadings) return null;

  return sections.filter((s) => s.body.length > 0 || s.title !== null);
}

/** HTML タグを除去してプレーンテキストに変換する */
function htmlToText(html: string): string {
  return html
    .replace(/<(h[1-6]|p|li|td|th|tr)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(Number(c)));
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\t/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[\s　]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
