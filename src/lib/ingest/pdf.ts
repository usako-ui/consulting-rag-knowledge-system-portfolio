/**
 * PDF テキスト抽出
 *
 * 参照：requirements.md §2・§6（PDF/Word対応・セクション単位チャンキング）
 *       architecture.md §12
 *
 * 使用ライブラリ：pdf-parse
 *  - `pdf-parse/lib/pdf-parse.js` を直接 import することで、
 *    ライブラリの test 用ダミー PDF 参照問題を回避する
 *
 * ★ 抽出したテキスト本文はログ出力しない（要件 §4）。呼び出し側でも同様の運用とすること。
 */

// pdf-parse は index.js が debug 用ファイル読み込みを含むため、内部モジュールを直接指定
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - 型は @types/pdf-parse 経由で取得
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { IngestError } from './errors';

export interface PdfExtractResult {
  text: string;      // 全文（改行・空白は原文寄り）
  pageCount: number;
  pages: { pageNum: number; text: string }[];  // ページ別テキスト（チャンク時ページ番号付与に使用）
}

export async function extractPdfText(bytes: Buffer): Promise<PdfExtractResult> {
  try {
    let pageCounter = 0;
    const pages: { pageNum: number; text: string }[] = [];

    const options = {
      // pdf-parse デフォルトレンダラーと同じロジックでテキストを組み立て、ページ番号を付与する
      pagerender: (pageData: unknown) => {
        const pageNum = ++pageCounter;
        const pd = pageData as {
          getTextContent: (o?: { normalizeWhitespace?: boolean }) => Promise<{
            items: Array<{ str: string; transform: number[] }>;
          }>;
        };
        return pd.getTextContent({ normalizeWhitespace: false }).then((tc) => {
          let lastY: number | null = null;
          let raw = '';
          for (const item of tc.items) {
            if (lastY === null || item.transform[5] === lastY) {
              raw += item.str;
            } else {
              raw += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          pages.push({ pageNum, text: normalizeText(raw) });
          return raw;
        });
      },
    };

    const result = await pdfParse(bytes, options);
    const text = normalizeText(result.text ?? '');
    if (text.length < 20) {
      throw new IngestError('pdf_parse_failed', 'PDFからテキストを抽出できませんでした（画像PDFの可能性）', false);
    }
    return {
      text,
      pageCount: result.numpages ?? 0,
      pages,
    };
  } catch (err) {
    if (err instanceof IngestError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new IngestError('pdf_parse_failed', `PDF解析失敗: ${msg}`, false);
  }
}

/**
 * pdf-parse 出力を正規化：
 *  - 3行以上連続する空行 → 2行に圧縮
 *  - 行末の全角/半角空白を除去
 *  - タブは1つの半角空白に
 */
function normalizeText(raw: string): string {
  return raw
    .replace(/\t/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[\s　]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
