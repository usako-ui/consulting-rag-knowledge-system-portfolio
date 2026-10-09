'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FieldLabel, Input } from '@/components/ui/Input';
import {
  ACTION_TYPE_LABEL,
  AUDIT_ACTION_TYPES,
  AUDIT_TARGET_TYPES,
  TARGET_TYPE_LABEL,
  type AuditActionType,
  type AuditTargetType,
} from '@/lib/admin/audit-log-shared';

interface Props {
  initial: {
    from?: string;
    to?: string;
    actor?: string;
    actionType?: AuditActionType;
    targetType?: AuditTargetType;
  };
}

export function AuditLogFilterForm({ initial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  const [actor, setActor] = useState(initial.actor ?? '');
  const [actionType, setActionType] = useState<AuditActionType | ''>(initial.actionType ?? '');
  const [targetType, setTargetType] = useState<AuditTargetType | ''>(initial.targetType ?? '');

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (actor.trim()) params.set('actor', actor.trim());
    if (actionType) params.set('actionType', actionType);
    if (targetType) params.set('targetType', targetType);
    // page は 1 にリセット（新しいフィルタで最初から）
    router.push(`/admin/audit-log?${params.toString()}`);
  }

  function reset() {
    setFrom('');
    setTo('');
    setActor('');
    setActionType('');
    setTargetType('');
    router.push('/admin/audit-log');
  }

  const hasFilter = Boolean(from || to || actor || actionType || targetType);

  return (
    <form onSubmit={apply} className="space-y-3">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text-primary">フィルタ</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <FieldLabel htmlFor="al-from">開始日</FieldLabel>
          <Input
            id="al-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="al-to">終了日</FieldLabel>
          <Input
            id="al-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            min={from || undefined}
          />
        </div>
        <div>
          <FieldLabel htmlFor="al-actor">実行者（部分一致）</FieldLabel>
          <Input
            id="al-actor"
            type="text"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="example@..."
            maxLength={254}
          />
        </div>
        <div>
          <FieldLabel htmlFor="al-action">操作種別</FieldLabel>
          <select
            id="al-action"
            value={actionType}
            onChange={(e) => setActionType((e.target.value || '') as AuditActionType | '')}
            className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent"
          >
            <option value="">すべて</option>
            {AUDIT_ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {ACTION_TYPE_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="al-target">対象種別</FieldLabel>
          <select
            id="al-target"
            value={targetType}
            onChange={(e) => setTargetType((e.target.value || '') as AuditTargetType | '')}
            className="h-10 w-full rounded-inline border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus-visible:border-primary-accent"
          >
            <option value="">すべて</option>
            {AUDIT_TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TARGET_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary">
          絞り込む
        </Button>
        {hasFilter ? (
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            条件をクリア
          </Button>
        ) : null}
      </div>
    </form>
  );
}
