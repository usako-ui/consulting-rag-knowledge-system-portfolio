'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowUpDown, EyeOff, Eye, Trash2 } from 'lucide-react';
import type { AdminDocumentItem } from '@/lib/documents/admin-list';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { departmentLabel } from '@/lib/ui/department';
import { formatDateJa } from '@/lib/ui/format';
import type { Department } from '@/lib/auth/session';
import { cn } from '@/lib/ui/cn';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

type SortKey = 'updated' | 'title' | 'department' | 'status';
type SortDir = 'asc' | 'desc';

const ALL_DEPARTMENTS: Array<Department | 'all'> = [
  'all',
  'strategy',
  'business',
  'it',
  'hr',
  'sales',
  'management',
];

interface Props {
  documents: AdminDocumentItem[];
}

export function AdminDocumentsTable({ documents }: Props) {
  const router = useRouter();
  const [deptFilter, setDeptFilter] = useState<Department | 'all'>('all');
  const [showInactive, setShowInactive] = useState<boolean>(true);
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDocumentItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = documents;
    if (deptFilter !== 'all') list = list.filter((d) => d.department === deptFilter);
    if (!showInactive) list = list.filter((d) => d.isActive);
    const sorted = [...list].sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case 'title':
          c = a.title.localeCompare(b.title, 'ja');
          break;
        case 'department':
          c = a.department.localeCompare(b.department);
          break;
        case 'status':
          c = String(a.isActive).localeCompare(String(b.isActive));
          break;
        case 'updated':
        default:
          c = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }
      return sortDir === 'asc' ? c : -c;
    });
    return sorted;
  }, [documents, deptFilter, showInactive, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'updated' ? 'desc' : 'asc');
    }
  }

  async function handleToggleActive(doc: AdminDocumentItem) {
    setError(null);
    setPendingId(doc.id);
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !doc.isActive }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? '状態の変更に失敗しました');
        return;
      }
      router.refresh();
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(doc: AdminDocumentItem) {
    setError(null);
    setPendingId(doc.id);
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? '削除に失敗しました');
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setError('通信に失敗しました。ネットワーク接続を確認してください');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-inline border border-border bg-primary-soft/40 px-3 py-2">
        <label htmlFor="dept-filter" className="text-xs font-medium text-primary">
          部署で絞り込み
        </label>
        <select
          id="dept-filter"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value as Department | 'all')}
          className="h-8 rounded-inline border border-border bg-white px-2 text-xs text-text-primary focus:outline-none focus-visible:border-primary-accent"
        >
          {ALL_DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d === 'all' ? '全部署' : departmentLabel(d)}
            </option>
          ))}
        </select>
        <label className="ml-4 inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          無効化中の資料も表示
        </label>
        <span className="ml-auto text-[11px] text-text-muted tabular">
          {filtered.length}件を表示
        </span>
      </div>

      {error ? (
        <div role="alert" className="mb-3 rounded-inline border border-[#EFBEBA] bg-[#FBE7E5] px-3 py-2 text-xs text-[#8F332C]">
          {error}
        </div>
      ) : null}

      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <SortHeader label="資料名" active={sortKey === 'title'} dir={sortDir} onClick={() => toggleSort('title')} />
              <SortHeader label="部署" active={sortKey === 'department'} dir={sortDir} onClick={() => toggleSort('department')} />
              <SortHeader label="更新日" active={sortKey === 'updated'} dir={sortDir} onClick={() => toggleSort('updated')} />
              <SortHeader label="状態" active={sortKey === 'status'} dir={sortDir} onClick={() => toggleSort('status')} />
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className={cn('border-b border-border last:border-none', !d.isActive && 'opacity-60')}>
                <td className="px-3 py-3">
                  <p className="font-medium text-text-primary">{d.title}</p>
                  <p className="text-[11px] text-text-muted tabular">{d.fileId}</p>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge kind="info" label={departmentLabel(d.department)} size="sm" />
                </td>
                <td className="px-3 py-3 text-xs text-text-muted tabular">
                  {formatDateJa(d.updatedAt)}
                </td>
                <td className="px-3 py-3">
                  {d.isActive ? (
                    <StatusBadge kind="success" label="有効（検索対象）" size="sm" />
                  ) : (
                    <StatusBadge kind="warning" label="無効（非表示）" size="sm" />
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/documents/${d.id}`}
                      className="text-xs font-medium text-primary-accent hover:underline"
                    >
                      内容を見る
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(d)}
                      disabled={pendingId === d.id}
                      className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary hover:bg-primary-soft disabled:opacity-60"
                    >
                      {d.isActive ? (
                        <>
                          <EyeOff className="h-3 w-3" aria-hidden="true" />
                          一時無効化
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" aria-hidden="true" />
                          再有効化
                        </>
                      )}
                    </button>
                    {d.isActive ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(d)}
                        disabled={pendingId === d.id}
                        className="inline-flex items-center gap-1 rounded-inline border border-[#EFBEBA] bg-white px-2 py-1 text-xs text-status-danger hover:bg-[#FBE7E5] disabled:opacity-60"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        削除
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {filtered.map((d) => (
          <li key={d.id} className={cn('px-2 py-3', !d.isActive && 'opacity-60')}>
            <p className="text-sm font-semibold text-text-primary">{d.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge kind="info" label={departmentLabel(d.department)} size="sm" />
              {d.isActive ? (
                <StatusBadge kind="success" label="有効" size="sm" />
              ) : (
                <StatusBadge kind="warning" label="無効" size="sm" />
              )}
            </div>
            <p className="mt-1 text-[11px] text-text-muted tabular">
              更新：{formatDateJa(d.updatedAt)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link href={`/documents/${d.id}`} className="text-xs font-medium text-primary-accent hover:underline">
                内容を見る
              </Link>
              <button
                type="button"
                onClick={() => handleToggleActive(d)}
                disabled={pendingId === d.id}
                className="inline-flex items-center gap-1 rounded-inline border border-border bg-white px-2 py-1 text-xs text-primary disabled:opacity-60"
              >
                {d.isActive ? '一時無効化' : '再有効化'}
              </button>
              {d.isActive ? (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(d)}
                  disabled={pendingId === d.id}
                  className="inline-flex items-center gap-1 rounded-inline border border-[#EFBEBA] bg-white px-2 py-1 text-xs text-status-danger disabled:opacity-60"
                >
                  削除
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {deleteTarget ? (
        <DeleteConfirmDialog
          target={deleteTarget}
          loading={pendingId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={cn('inline-flex items-center gap-1 hover:text-primary', active && 'text-primary')}
      >
        {label}
        <ArrowUpDown className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
        {active ? <span className="sr-only">{dir === 'asc' ? '昇順' : '降順'}</span> : null}
      </button>
    </th>
  );
}
