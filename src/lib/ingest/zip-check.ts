/**
 * ZIP ファイル構造チェック（ZIP 爆弾対策）
 *
 * .docx は ZIP アーカイブ。mammoth（内部の JSZip）が無制限に展開するため、
 * 呼び出し前にセントラルディレクトリを解析して展開後サイズを確認する。
 *
 * 参照：requirements.md §2（ファイルサイズ制限）, architecture.md §3（Storage 設計）
 * T-28 PM 承認：エントリー数 1000 件・展開後サイズ MAX_FILE_SIZE_MB × 10 を上限とする
 *
 * ZIP64 は非対応（uncompressedSize = 0xFFFFFFFF を上限超えとして扱う）。
 */

export interface ZipCheckOk {
  ok: true;
  entryCount: number;
  totalUncompressedBytes: number;
}

export interface ZipCheckFail {
  ok: false;
  error: string;
}

export type ZipCheckResult = ZipCheckOk | ZipCheckFail;

const EOCD_SIG = 0x06054b50;    // PK\x05\x06（little-endian）
const CD_ENTRY_SIG = 0x02014b50; // PK\x01\x02（little-endian）

/**
 * ZIP のセントラルディレクトリを解析し、エントリー数と展開後合計サイズを返す。
 * 上限を超えた時点で即座にエラーを返す（全エントリーを走査しない）。
 *
 * @param buf           ZIP ファイル全体のバイト列
 * @param opts.maxEntries         エントリー数の上限
 * @param opts.maxUncompressedMb  展開後合計サイズの上限（MB）
 */
export function checkZipBomb(
  buf: Buffer,
  opts: { maxEntries: number; maxUncompressedMb: number },
): ZipCheckResult {
  if (buf.length < 22) {
    return { ok: false, error: 'ZIPのフォーマットが正しくありません（ファイルが短すぎます）' };
  }

  // EOCD を末尾から検索（ZIP コメントは最大 65535 バイト）
  let eocdOffset = -1;
  const searchFrom = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= searchFrom; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    return { ok: false, error: 'ZIPのフォーマットが正しくありません（終端レコードが見つかりません）' };
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset     = buf.readUInt32LE(eocdOffset + 16);

  // エントリー数チェック
  if (totalEntries > opts.maxEntries) {
    return {
      ok: false,
      error:
        `ファイルの内容が大きすぎるため、取り込めません（ZIP エントリー数 ${totalEntries} 件が上限 ${opts.maxEntries} 件を超えています）。` +
        'ファイルを確認し、分割するか管理者にご相談ください。',
    };
  }

  // セントラルディレクトリを走査して展開後サイズを合算
  let offset = cdOffset;
  let totalUncompressed = 0;
  const limitBytes = opts.maxUncompressedMb * 1024 * 1024;

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > buf.length) {
      return { ok: false, error: 'ZIPのフォーマットが正しくありません（セントラルディレクトリを読み取れませんでした）' };
    }
    if (buf.readUInt32LE(offset) !== CD_ENTRY_SIG) {
      return { ok: false, error: 'ZIPのフォーマットが正しくありません（エントリーシグネチャが不正です）' };
    }

    const uncompressedSize = buf.readUInt32LE(offset + 24);
    // ZIP64 の場合は 0xFFFFFFFF → 即上限超えとして扱う
    if (uncompressedSize === 0xffffffff) {
      return {
        ok: false,
        error:
          `ファイルの内容が大きすぎるため、取り込めません（展開後サイズが上限 ${opts.maxUncompressedMb} MB を超えています）。` +
          'ファイルを分割するか、管理者にご相談ください。',
      };
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limitBytes) {
      return {
        ok: false,
        error:
          `ファイルの内容が大きすぎるため、取り込めません（展開後サイズが上限 ${opts.maxUncompressedMb} MB を超えています）。` +
          'ファイルを分割するか、管理者にご相談ください。',
      };
    }

    const filenameLen = buf.readUInt16LE(offset + 28);
    const extraLen    = buf.readUInt16LE(offset + 30);
    const commentLen  = buf.readUInt16LE(offset + 32);
    offset += 46 + filenameLen + extraLen + commentLen;
  }

  return { ok: true, entryCount: totalEntries, totalUncompressedBytes: totalUncompressed };
}
