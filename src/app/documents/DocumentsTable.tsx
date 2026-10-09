'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { DocumentListItem } from '@/lib/documents/list';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { departmentLabel } from '@/lib/ui/department';
import { formatDateJa } from '@/lib/ui/format';
import type { Department } from '@/lib/auth/session';
import { cn } from '@/lib/ui/cn';

type SortKey = 'updated' | 'title' | 'department' | 'status';
type SortDir = 'asc' | 'desc';

interface Props {
  documents: DocumentListItem[];
  isAdmin: boolean;
}

const ALL_DEPARTMENTS: Array<Department | 'all'> = [
  'all',
  'strategy',
  'business',
  'it',
  'hr',
  'sales',
  'management',
];

export function DocumentsTable({ documents, isAdmin }: Props) {
  const [deptFilter, setDeptFilter] = useState<Department | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    let list = documents;
    if (isAdmin && deptFilter !== 'all') {
      list = list.filter((d) => d.department === deptFilter);
    }
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
          c = a.status.localeCompare(b.status);
          break;
        case 'updated':
        default:
          c = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }
      return sortDir === 'asc' ? c : -c;
    });
    return sorted;
  }, [documents, deptFilter, sortKey, sortDir, isAdmin]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'updated' ? 'desc' : 'asc');
    }
  }

  return (
    <div>
      {isAdmin ? (
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
          <span className="ml-auto text-[11px] text-text-muted tabular">
            {filtered.length}件を表示
          </span>
        </div>
      ) : null}

      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <SortHeader
                label="資料名"
                active={sortKey === 'title'}
                dir={sortDir}
                onClick={() => toggleSort('title')}
              />
              <SortHeader
                label="部署"
                active={sortKey === 'department'}
                dir={sortDir}
                onClick={() => toggleSort('department')}
              />
              <SortHeader
                label="更新日"
                active={sortKey === 'updated'}
                dir={sortDir}
                onClick={() => toggleSort('updated')}
              />
              <SortHeader
                label="状態"
                active={sortKey === 'status'}
                dir={sortDir}
                onClick={() => toggleSort('status')}
              />
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-none">
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
                  <DocumentStatusBadge status={d.status} />
                  {d.status === 'failed' ? (
                    <p className="mt-1 text-[11px] text-status-danger">
                      {d.retryCount > 0
                        ? `再試行 ${d.retryCount} 回後に失敗`
                        : '取り込みに失敗しました'}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/documents/${d.id}`}
                    className="text-xs font-medium text-primary-accent hover:underline"
                  >
                    内容を確認
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {filtered.map((d) => (
          <li key={d.id} className="px-2 py-3">
            <p className="text-sm font-semibold text-text-primary">{d.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge kind="info" label={departmentLabel(d.department)} size="sm" />
              <DocumentStatusBadge status={d.status} />
            </div>
            <p className="mt-1 text-[11px] text-text-muted tabular">
              更新：{formatDateJa(d.updatedAt)}
            </p>
            <div className="mt-2">
              <Link
                href={`/documents/${d.id}`}
                className="text-xs font-medium text-primary-accent hover:underline"
              >
                内容を確認
              </Link>
            </div>
          </li>
        ))}
      </ul>
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
        className={cn(
          'inline-flex items-center gap-1 hover:text-primary',
          active && 'text-primary',
        )}
      >
        {label}
        <ArrowUpDown className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
        {active ? <span className="sr-only">{dir === 'asc' ? '昇順' : '降順'}</span> : null}
      </button>
    </th>
  );
}
