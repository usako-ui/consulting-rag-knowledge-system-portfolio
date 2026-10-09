'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { departmentLabel } from '@/lib/ui/department';
import { formatDateJa } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import {
  ACTION_TYPE_LABEL,
  TARGET_TYPE_LABEL,
  type AuditLogRecord,
} from '@/lib/admin/audit-log-shared';

interface Props {
  rows: AuditLogRecord[];
}

const DETAIL_TRUNCATE_LENGTH = 1000;

export function AuditLogTable({ rows }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* PC / タブレット */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2 font-medium">日時</th>
              <th className="px-3 py-2 font-medium">実行者</th>
              <th className="px-3 py-2 font-medium">操作</th>
              <th className="px-3 py-2 font-medium">対象</th>
              <th className="px-3 py-2 font-medium">対象部署</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded.has(row.id);
              return (
                <>
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-none hover:bg-primary-soft/30"
                  >
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() => toggle(row.id)}
                        className="rounded-inline p-1 text-text-muted hover:text-primary"
                        aria-label={isOpen ? '詳細を閉じる' : '詳細を見る'}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs text-text-muted tabular">
                      {formatDateJa(row.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-xs text-text-primary">
                      {row.actorEmail ?? <span className="text-text-muted">（削除済）</span>}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        kind={actionKind(row.actionType)}
                        label={ACTION_TYPE_LABEL[row.actionType] ?? row.actionType}
                        size="sm"
                      />
                    </td>
                    <td className="px-3 py-3 text-xs text-text-primary">
                      {row.targetType ? (
                        <>
                          {TARGET_TYPE_LABEL[row.targetType] ?? row.targetType}
                          {row.targetId ? (
                            <span className="ml-1 text-[11px] text-text-muted tabular">
                              {row.targetId.slice(0, 8)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-text-primary">
                      {row.targetDepartment ? departmentLabel(row.targetDepartment) : '—'}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-b border-border last:border-none bg-primary-soft/20">
                      <td colSpan={6} className="px-6 py-3">
                        <DetailsBlock details={row.details} />
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* モバイル */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => {
          const isOpen = expanded.has(row.id);
          return (
            <li key={row.id} className="px-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-text-muted tabular">
                    {formatDateJa(row.createdAt)}
                  </p>
                  <p className="text-sm font-medium text-text-primary">
                    {row.actorEmail ?? '（削除済）'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      kind={actionKind(row.actionType)}
                      label={ACTION_TYPE_LABEL[row.actionType] ?? row.actionType}
                      size="sm"
                    />
                    {row.targetType ? (
                      <span className="text-[11px] text-text-muted">
                        {TARGET_TYPE_LABEL[row.targetType] ?? row.targetType}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="rounded-inline p-1 text-text-muted hover:text-primary"
                  aria-label={isOpen ? '詳細を閉じる' : '詳細を見る'}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {isOpen ? (
                <div className="mt-2 rounded-inline bg-primary-soft/40 p-2">
                  <DetailsBlock details={row.details} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DetailsBlock({ details }: { details: Record<string, unknown> | null }) {
  const [expandedLong, setExpandedLong] = useState(false);
  if (!details || Object.keys(details).length === 0) {
    return <p className="text-xs text-text-muted">詳細情報はありません。</p>;
  }
  const json = JSON.stringify(details, null, 2);
  const isLong = json.length > DETAIL_TRUNCATE_LENGTH;
  const displayText =
    isLong && !expandedLong ? json.slice(0, DETAIL_TRUNCATE_LENGTH) + '…' : json;
  return (
    <div>
      <pre
        className={cn(
          'whitespace-pre-wrap break-all rounded-inline bg-white px-3 py-2 font-mono text-[11px] text-text-primary',
          'max-h-96 overflow-y-auto',
        )}
      >
        {displayText}
      </pre>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpandedLong((v) => !v)}
          className="mt-1 text-[11px] text-primary-accent hover:underline"
        >
          {expandedLong ? '折り畳む' : 'もっと見る'}
        </button>
      ) : null}
    </div>
  );
}

function actionKind(
  action: string,
): 'success' | 'warning' | 'alert' | 'danger' | 'processing' | 'info' {
  switch (action) {
    case 'login':
    case 'logout':
      return 'info';
    case 'search':
      return 'info';
    case 'search_failed':
      return 'danger';
    case 'create':
      return 'success';
    case 'update':
      return 'warning';
    case 'delete':
      return 'danger';
    case 'setting_change':
      return 'alert';
    case 'password_change':
      return 'alert';
    default:
      return 'info';
  }
}
