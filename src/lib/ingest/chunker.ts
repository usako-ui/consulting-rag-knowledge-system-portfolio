/**
 * セクション単位チャンキング（要件 §6）
 *
 * 参照：requirements.md §6（セクション単位・過分割禁止）
 *       architecture.md §6（データフロー：セクション単位チャンキング）
 *
 * 戦略：
 *   1. 見出し行（第N章／N. ／N.N ／■／【 】等）を検出してセクション境界を決定
 *   2. セクション数が 2 未満なら文字数分割にフォールバック
 *   3. 各チャンクが上限（MAX_CHARS）を超える場合は段落境界で再分割
 *   4. 短すぎるチャンク（< MIN_CHARS）は次のチャンクと連結
 *
 * 上限値の根拠：
 *   Gemini text-embedding-004 の実効入力は約 2048 tokens。
 *   日本語の場合 1 token ≒ 1〜2 文字なので、安全側で 3500 文字とする。
 */

import type { ChunkInput } from './types';

const MAX_CHARS = 3500;
const MIN_CHARS = 200;
const TARGET_CHARS = 1500; // フォールバック時の目標サイズ

// 見出しパターン（日本語 + 英数字）
const HEADING_PATTERNS = [
  /^第[一二三四五六七八九十0-9]+[章節部]\s*.+/,   // 第1章／第一節
  /^\d+\.\d+(\.\d+)?\s+.{2,}/,                       // 1.1 概要、1.1.1 詳細
  /^\d+\.\s+.{2,}/,                                   // 1. はじめに
  /^【[^】]{1,30}】/,                                 // 【はじめに】
  /^■\s*.{2,}/,                                       // ■要旨
  /^◆\s*.{2,}/,                                       // ◆背景
  /^Chapter\s+\d+/i,                                  // Chapter 1
  /^Section\s+\d+/i,                                  // Section 1
];

interface DetectedSection {
  title: string | null;
  body: string;
}

export function chunkText(text: string): ChunkInput[] {
  const sections = detectSections(text);

  if (sections.length < 2) {
    // セクション検出できず → 文字数分割
    return charBasedChunks(text, null).filter((c) => c.content.length >= MIN_CHARS || c.content.length > 0);
  }

  // セクション単位でチャンク化、長いセクションは段落再分割
  const chunks: ChunkInput[] = [];
  for (const sec of sections) {
    const body = sec.body.trim();
    if (body.length === 0) continue;

    if (body.length <= MAX_CHARS) {
      chunks.push({ pageNumber: null, sectionTitle: sec.title, content: body });
    } else {
      const sub = splitLongSection(body);
      for (const s of sub) {
        chunks.push({ pageNumber: null, sectionTitle: sec.title, content: s });
      }
    }
  }

  // 短すぎるチャンクを次と連結（最後は前と）
  return mergeShortChunks(chunks);
}

function detectSections(text: string): DetectedSection[] {
  const lines = text.split('\n');
  const sections: DetectedSection[] = [];
  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      currentBody.push('');
      continue;
    }
    if (isHeading(trimmed)) {
      if (currentBody.length > 0 || currentTitle !== null) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
      }
      currentTitle = trimmed;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentTitle !== null || currentBody.length > 0) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
  }
  return sections.filter((s) => s.body.length > 0 || s.title !== null);
}

function isHeading(line: string): boolean {
  if (line.length > 100) return false; // 長すぎる行は見出しではない
  return HEADING_PATTERNS.some((p) => p.test(line));
}

/** 長いセクションを段落境界で分割する（オーバーラップなし。段落境界を優先） */
function splitLongSection(body: string): string[] {
  const paragraphs = body.split(/\n\n+/);
  const result: string[] = [];
  let buf = '';

  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > MAX_CHARS) {
      if (buf.length > 0) {
        result.push(buf.trim());
        buf = '';
      }
      if (p.length > MAX_CHARS) {
        // 単一段落が MAX_CHARS を超える場合は文字数で強制分割
        for (let i = 0; i < p.length; i += TARGET_CHARS) {
          result.push(p.slice(i, i + TARGET_CHARS));
        }
      } else {
        buf = p;
      }
    } else {
      buf = buf.length > 0 ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim().length > 0) result.push(buf.trim());
  return result;
}

/** セクション検出失敗時のフォールバック：文字数ベース分割 */
function charBasedChunks(text: string, sectionTitle: string | null): ChunkInput[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: ChunkInput[] = [];
  let buf = '';
  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > TARGET_CHARS && buf.length >= MIN_CHARS) {
      chunks.push({ pageNumber: null, sectionTitle, content: buf.trim() });
      buf = p;
    } else {
      buf = buf.length > 0 ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim().length > 0) {
    chunks.push({ pageNumber: null, sectionTitle, content: buf.trim() });
  }
  return chunks;
}

function mergeShortChunks(chunks: ChunkInput[]): ChunkInput[] {
  if (chunks.length <= 1) return chunks;
  const result: ChunkInput[] = [];
  for (const c of chunks) {
    const last = result[result.length - 1];
    if (last && last.content.length < MIN_CHARS && last.content.length + c.content.length < MAX_CHARS) {
      // 直前が短い → 現在を連結
      last.content = `${last.content}\n\n${c.content}`;
      last.sectionTitle = last.sectionTitle ?? c.sectionTitle;
    } else if (c.content.length < MIN_CHARS && last && last.content.length + c.content.length < MAX_CHARS) {
      // 現在が短い → 直前に連結
      last.content = `${last.content}\n\n${c.content}`;
    } else {
      result.push(c);
    }
  }
  return result;
}

/**
 * Word の H1/H2 セクション配列からチャンクを生成する。
 * H1/H2 見出しテキストが sectionTitle になる。
 * セクション内に番号付き見出し（HEADING_PATTERNS）があれば detectSections でさらに分割する。
 */
export function chunkWordSections(
  sections: Array<{ title: string | null; body: string }>,
): ChunkInput[] {
  const chunks: ChunkInput[] = [];

  for (const sec of sections) {
    const body = sec.body.trim();
    if (!body) continue;

    // セクション内の番号付き見出しを検出して細分化
    const subSections = detectSections(body);
    const effective = subSections.length >= 2 ? subSections : [{ title: sec.title, body }];

    for (const sub of effective) {
      const subBody = sub.body.trim();
      if (!subBody) continue;
      const title = sub === effective[0] && subSections.length < 2 ? sec.title : (sub.title ?? sec.title);
      if (subBody.length <= MAX_CHARS) {
        chunks.push({ pageNumber: null, sectionTitle: title, content: subBody });
      } else {
        for (const part of splitLongSection(subBody)) {
          chunks.push({ pageNumber: null, sectionTitle: title, content: part });
        }
      }
    }
  }

  return mergeShortChunks(chunks);
}

/**
 * PDF のページ別テキストからチャンクを生成する。
 * 各チャンクに pageNumber を付与する（ページをまたぐ連結は行わない）。
 */
export function chunkPdfPages(pages: { pageNum: number; text: string }[]): ChunkInput[] {
  const chunks: ChunkInput[] = [];

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;

    const sections = detectSections(text);
    if (sections.length < 2) {
      // セクション検出できず → ページ全体を1チャンク（長ければ分割）
      if (text.length <= MAX_CHARS) {
        chunks.push({ pageNumber: page.pageNum, sectionTitle: null, content: text });
      } else {
        for (const part of splitLongSection(text)) {
          chunks.push({ pageNumber: page.pageNum, sectionTitle: null, content: part });
        }
      }
    } else {
      for (const sec of sections) {
        const body = sec.body.trim();
        if (!body) continue;
        if (body.length <= MAX_CHARS) {
          chunks.push({ pageNumber: page.pageNum, sectionTitle: sec.title, content: body });
        } else {
          for (const part of splitLongSection(body)) {
            chunks.push({ pageNumber: page.pageNum, sectionTitle: sec.title, content: part });
          }
        }
      }
    }
  }

  // 同一ページ内の短いチャンクを連結（ページをまたぐ連結は禁止）
  return mergeShortChunksSamePage(chunks);
}

function mergeShortChunksSamePage(chunks: ChunkInput[]): ChunkInput[] {
  if (chunks.length <= 1) return chunks.filter((c) => c.content.length > 0);
  const result: ChunkInput[] = [];
  for (const c of chunks) {
    if (!c.content.length) continue;
    const last = result[result.length - 1];
    const samePage = last?.pageNumber === c.pageNumber;
    if (samePage && last.content.length < MIN_CHARS && last.content.length + c.content.length < MAX_CHARS) {
      last.content = `${last.content}\n\n${c.content}`;
      last.sectionTitle = last.sectionTitle ?? c.sectionTitle;
    } else if (samePage && c.content.length < MIN_CHARS && last.content.length + c.content.length < MAX_CHARS) {
      last.content = `${last.content}\n\n${c.content}`;
    } else {
      result.push({ ...c });
    }
  }
  return result;
}
