'use client';

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FieldLabel, Input } from '@/components/ui/Input';
import { departmentLabel } from '@/lib/ui/department';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import type { Department } from '@/lib/auth/session';

interface UploadFormProps {
  defaultDepartment: Department;
  isAdmin: boolean;
  maxFileMb: number;
}

type UploadStep =
  | 'idle'
  | 'hashing'       // SHA-256 計算中
  | 'requesting'    // upload-url API 呼び出し中
  | 'uploading'     // Storage への PUT 中
  | 'completing'    // upload-complete API 呼び出し中
  | 'success'
  | 'duplicate'
  | 'in_flight'     // 同じ内容/名前が取り込み待ち
  | 'error';

interface DuplicateInfo {
  documentId: string;
  isActive: boolean;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DEPARTMENTS: Department[] = ['strategy', 'business', 'it', 'hr', 'sales', 'management'];

/** クリック選択・ドラッグ&ドロップ共通のファイル検証 */
export function validateFile(
  files: FileList | null,
  maxFileMb: number,
): { file: File } | { error: string } {
  if (!files || files.length === 0) {
    return { error: 'ファイルが見つかりませんでした。もう一度試してください' };
  }
  if (files.length > 1) {
    return { error: `ファイルは1つずつ選んでください（${files.length}件が選択されました）` };
  }
  const file = files[0];
  const nameLower = file.name.toLowerCase();
  const isPdf = nameLower.endsWith('.pdf') || file.type === 'application/pdf';
  const isDocx = nameLower.endsWith('.docx') || file.type === DOCX_MIME;
  if (!isPdf && !isDocx) {
    return { error: 'PDF または Word（.docx）ファイルのみアップロードできます。選択したファイルの形式を確認してください' };
  }
  if (file.size === 0) {
    return {
      error:
        'ファイルの内容が空です（0バイト）。保存やエクスポートに失敗してファイルが作られなかった可能性があります。元のアプリで内容を確認し、正しく保存したファイルを再度アップロードしてください。',
    };
  }
  if (file.size > maxFileMb * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return {
      error:
        `ファイルが大きすぎます（選択: ${sizeMB} MB / 上限: ${maxFileMb} MB）。` +
        `このシステムは ${maxFileMb} MB を超えるファイルを受け付けられません。` +
        `ファイルを分割・圧縮するか、管理者にご相談ください。`,
    };
  }
  return { file };
}

/** SHA-256 をブラウザの Web Crypto API で計算し HEX 文字列で返す */
async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function stepLabel(step: UploadStep): string {
  switch (step) {
    case 'hashing':    return 'ファイルを確認しています...';
    case 'requesting': return 'アップロードを準備しています...';
    case 'uploading':  return 'アップロード中...';
    case 'completing': return '取り込み登録しています...';
    default:           return '処理中...';
  }
}

export function UploadForm({ defaultDepartment, isAdmin, maxFileMb }: UploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [createdYear, setCreatedYear] = useState('');
  const [clientName, setClientName] = useState('');
  const [department, setDepartment] = useState<Department>(defaultDepartment);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<UploadStep>('idle');
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [inFlightMessage, setInFlightMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isProcessing = !['idle', 'success', 'duplicate', 'in_flight', 'error'].includes(step);

  // 枠の外へのドロップでブラウザが別タブを開くのを防ぐ
  useEffect(() => {
    const prevent = (e: globalThis.DragEvent) => { e.preventDefault(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  function handleDragEnter(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    const result = validateFile(e.dataTransfer.files, maxFileMb);
    if ('error' in result) { setError(result.error); return; }
    setError(null);
    setFile(result.file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isProcessing) return;
    setError(null);
    setDuplicate(null);
    setInFlightMessage(null);

    if (!file) { setError('ファイルを選択してください'); return; }

    try {
      // ステップ1: SHA-256 計算
      setStep('hashing');
      const sha256hex = await computeSha256(file);

      // ステップ2: upload-url API でサイズ・重複チェック → 署名 URL 取得
      setStep('requesting');
      const urlRes = await fetch('/api/documents/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: file.name,
          fileSize: file.size,
          sha256hex,
          title: title.trim(),
          department: isAdmin ? department : undefined,
          createdYear: createdYear.trim() ? Number.parseInt(createdYear.trim(), 10) : null,
          clientName: clientName.trim() || null,
        }),
      });
      const urlData = await urlRes.json().catch(() => null) as {
        ok: boolean;
        error?: string;
        kind?: 'new' | 'duplicate' | 'in_flight_hash' | 'in_flight_filename';
        message?: string;
        signedUrl?: string;
        storagePath?: string;
        token?: string;
        bucket?: string;
        meta?: {
          filename: string;
          fileSize: number;
          sha256hex: string;
          title: string;
          department: Department;
          createdYear: number | null;
          clientName: string | null;
        };
        documentId?: string;
        isActive?: boolean;
      } | null;

      if (!urlRes.ok || !urlData?.ok) {
        setError(urlData?.error ?? 'アップロードの準備に失敗しました。しばらく待って再度お試しください');
        setStep('error');
        return;
      }

      if (urlData.kind === 'in_flight_hash' || urlData.kind === 'in_flight_filename') {
        setInFlightMessage(urlData.message ?? '同じファイルが既に取り込み待ちです。取り込みが終わるまでお待ちください。');
        setStep('in_flight');
        return;
      }

      if (urlData.kind === 'duplicate') {
        setDuplicate({ documentId: urlData.documentId ?? '', isActive: urlData.isActive ?? true });
        setStep('duplicate');
        return;
      }

      if (!urlData.signedUrl || !urlData.storagePath || !urlData.token || !urlData.bucket || !urlData.meta) {
        setError('アップロードの準備に失敗しました。しばらく待って再度お試しください');
        setStep('error');
        return;
      }

      // ステップ3: Storage へ直接アップロード（署名付き URL へ PUT）
      setStep('uploading');
      let putRes: Response;
      try {
        putRes = await fetch(urlData.signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-upsert': 'false',
          },
          body: file,
        });
      } catch (uploadFetchErr) {
        console.error('[UploadForm] Storage PUT fetch error:', uploadFetchErr);
        setError(
          'ファイルのアップロード通信に失敗しました。' +
          'ネットワーク接続またはサーバーの状態を確認してください（Storage PUT）',
        );
        setStep('error');
        return;
      }
      if (!putRes.ok) {
        const body = await putRes.text().catch(() => '');
        console.error('[UploadForm] Storage PUT failed:', putRes.status, body);
        setError(
          `ファイルのアップロードに失敗しました（Storage エラー ${putRes.status}）。` +
          'しばらく待って再度お試しください',
        );
        setStep('error');
        return;
      }

      // ステップ4: upload-complete で pending 登録
      setStep('completing');
      const meta = urlData.meta;
      const completeRes = await fetch('/api/documents/upload-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storagePath: urlData.storagePath,
          sha256hex,
          fileSize: file.size,
          filename: file.name,
          title: meta.title,
          department: meta.department,
          createdYear: meta.createdYear,
          clientName: meta.clientName,
          bucket: urlData.bucket,
        }),
      });
      const completeData = await completeRes.json().catch(() => null) as { ok: boolean; error?: string } | null;

      if (!completeRes.ok || !completeData?.ok) {
        setError(completeData?.error ?? '取り込み登録に失敗しました。しばらく待って再度お試しください');
        setStep('error');
        return;
      }

      setStep('success');
    } catch (err) {
      console.error('[UploadForm] unexpected error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        `予期しないエラーが発生しました。ブラウザのコンソール（F12 → Console）にエラー詳細が表示されています。` +
        `（${msg.slice(0, 80)}）`,
      );
      setStep('error');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {error ? (
        <Alert tone="danger" title="アップロードできませんでした">
          {error}
        </Alert>
      ) : null}

      {step === 'success' ? (
        <Alert tone="success" title="登録が完了しました">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <p className="min-w-0 leading-relaxed">
              ファイルを受け付けました。取り込みは自動的に処理されます（待機中）。
              取り込み状況は「取り込み状況」画面で確認できます。
            </p>
          </div>
        </Alert>
      ) : null}

      {step === 'in_flight' ? (
        <Alert tone="info" title="取り込み待ちのファイルがあります">
          <p className="min-w-0 leading-relaxed">{inFlightMessage}</p>
        </Alert>
      ) : null}

      {step === 'duplicate' ? (
        <Alert
          tone={duplicate?.isActive === false ? 'info' : 'success'}
          title={
            duplicate?.isActive === false
              ? '同じ内容の資料が既に登録されています（現在は非公開状態）'
              : '同じ内容の資料が既に登録されています'
          }
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <p className="min-w-0 leading-relaxed">
              {duplicate?.isActive === false
                ? isAdmin
                  ? '同じ内容の資料が既に登録されていますが、現在「削除（無効化）」の状態です。復活させたい場合は、資料管理画面から対象資料を選び「再有効化」ボタンで元に戻してください。'
                  : '同じ内容の資料が既に登録されていますが、現在システム側で非公開に設定されています。公開が必要な場合は管理者にお問い合わせください。'
                : '同じ内容の資料が既に登録されていました（重複登録は防止されました）。'}
            </p>
          </div>
        </Alert>
      ) : null}

      {isProcessing ? (
        <div className="flex items-center gap-3 rounded-inline border border-border bg-primary-soft/30 px-4 py-3 text-sm text-text-primary">
          <Loader2 className="h-4 w-4 animate-spin text-primary-accent" aria-hidden="true" />
          <span>{stepLabel(step)}</span>
        </div>
      ) : null}

      <div>
        <FieldLabel htmlFor="file" required helper={`PDF または Word（.docx）ファイル（最大 ${maxFileMb} MB）`}>
          ファイル
        </FieldLabel>
        <label
          htmlFor="file"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            'flex cursor-pointer items-center justify-center gap-2 rounded-inline border border-dashed px-4 py-8 text-sm transition-colors duration-150',
            isDragging
              ? 'border-primary-accent bg-primary-soft/60 text-primary ring-2 ring-primary-accent/40'
              : 'border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary',
          ].join(' ')}
        >
          <FileUp className="h-5 w-5" aria-hidden="true" />
          {file ? (
            <span className="max-w-full truncate font-medium text-text-primary">{file.name}</span>
          ) : isDragging ? (
            <span>ここで離してください</span>
          ) : (
            <span>ここにPDF・Wordファイルをドロップ、またはクリックして選択</span>
          )}
        </label>
        <input
          id="file"
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
          className="sr-only"
          onChange={(e) => {
            const result = validateFile(e.target.files, maxFileMb);
            if ('error' in result) {
              setError(result.error);
              e.target.value = '';
              return;
            }
            setError(null);
            setFile(result.file);
          }}
          disabled={isProcessing}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="title" required>
            資料タイトル
          </FieldLabel>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：2026年下期 営業戦略"
            maxLength={200}
            required
            disabled={isProcessing}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="department"
            helper={isAdmin ? '管理者は部署を選択できます' : '所属部署に固定'}
          >
            登録先の部署
          </FieldLabel>
          {isAdmin ? (
            <select
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
              className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary transition-colors duration-150 focus:outline-none focus-visible:border-primary-accent"
              disabled={isProcessing}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {departmentLabel(d)}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex h-10 items-center rounded-inline border border-border bg-primary-soft/40 px-3 text-sm text-text-primary">
              {departmentLabel(defaultDepartment)}
            </div>
          )}
        </div>
        <div>
          <FieldLabel htmlFor="createdYear" helper="任意">
            作成年
          </FieldLabel>
          <Input
            id="createdYear"
            inputMode="numeric"
            value={createdYear}
            onChange={(e) => setCreatedYear(e.target.value)}
            placeholder="2026"
            maxLength={4}
            disabled={isProcessing}
          />
        </div>
        <div>
          <FieldLabel htmlFor="clientName" helper="任意">
            顧客名
          </FieldLabel>
          <Input
            id="clientName"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="例：株式会社ABC"
            maxLength={100}
            disabled={isProcessing}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          type="submit"
          loading={isProcessing}
          disabled={!file || title.trim().length === 0 || isProcessing}
        >
          アップロード
        </Button>
      </div>
    </form>
  );
}
