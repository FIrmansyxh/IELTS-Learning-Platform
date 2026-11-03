'use client';

import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuditLogEntry } from '@/lib/api/types';
import { id } from '@/i18n/id';
import { adminApi, type AuditParams } from '@/lib/api/admin';
import { formatDateTime } from '@/lib/format';
import { Pagination, ResponsiveList, type Column } from './responsive-list';

const PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Filters = { action: string; actor: string; from: string; to: string };
const EMPTY: Filters = { action: '', actor: '', from: '', to: '' };

/** Tanggal lokal `YYYY-MM-DD` -> batas hari UTC untuk query `from`/`to`. */
export function dayStartIso(d: string): string {
  return `${d}T00:00:00.000Z`;
}
export function dayEndIso(d: string): string {
  return `${d}T23:59:59.999Z`;
}

export function buildAuditParams(f: Filters, page: number): AuditParams {
  return {
    page,
    page_size: PAGE_SIZE,
    action: f.action.trim() || undefined,
    actor_user_id: f.actor.trim() || undefined,
    from: f.from ? dayStartIso(f.from) : undefined,
    to: f.to ? dayEndIso(f.to) : undefined,
  };
}

export function AuditPanel() {
  const [draft, setDraft] = React.useState<Filters>(EMPTY);
  const [applied, setApplied] = React.useState<Filters>(EMPTY);
  const [page, setPage] = React.useState(1);
  const [errors, setErrors] = React.useState<{ actor?: string; range?: string }>({});

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (draft.actor.trim() && !UUID_RE.test(draft.actor.trim())) next.actor = id.form.uuidInvalid;
    if (draft.from && draft.to && draft.from > draft.to) next.range = id.fieldErrors.range_invalid;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setPage(1);
    setApplied(draft);
  }

  function reset() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setErrors({});
    setPage(1);
  }

  const params = buildAuditParams(applied, page);
  const list = useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => adminApi.auditLog(params),
    placeholderData: (prev) => prev,
  });

  const columns: Column<AuditLogEntry>[] = [
    { key: 'id', header: id.admin.audit.colId, cell: (a) => <span className="tabular-nums">{a.id}</span> },
    { key: 'time', header: id.admin.audit.colTime, cell: (a) => formatDateTime(a.created_at) },
    { key: 'action', header: id.admin.audit.colAction, cell: (a) => <code className="text-xs">{a.action}</code> },
    {
      key: 'actor',
      header: id.admin.audit.colActor,
      cell: (a) => a.actor_email_masked ?? id.admin.audit.system,
    },
    {
      key: 'entity',
      header: id.admin.audit.colEntity,
      cell: (a) => (a.entity_type ? `${a.entity_type}${a.entity_id ? ` ${a.entity_id.slice(0, 8)}` : ''}` : '-'),
    },
    {
      key: 'meta',
      header: id.admin.audit.colMeta,
      cell: (a) => {
        const meta = a.metadata;
        const has = meta !== null && meta !== undefined && !(typeof meta === 'object' && Object.keys(meta).length === 0);
        return has ? <code className="text-xs break-all">{JSON.stringify(meta)}</code> : '-';
      },
    },
    { key: 'ip', header: id.admin.audit.colIp, cell: (a) => <code className="text-xs">{a.ip_hash_prefix ?? '-'}</code> },
  ];

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">{id.admin.audit.title}</h1>
      <form onSubmit={apply} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="audit-action">{id.admin.audit.filterAction}</Label>
          <Input
            id="audit-action"
            value={draft.action}
            maxLength={60}
            placeholder={id.admin.audit.filterActionPlaceholder}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-actor">{id.admin.audit.filterActor}</Label>
          <Input
            id="audit-actor"
            value={draft.actor}
            aria-invalid={errors.actor ? true : undefined}
            aria-describedby={errors.actor ? 'audit-actor-err' : undefined}
            onChange={(e) => setDraft({ ...draft, actor: e.target.value })}
          />
          {errors.actor ? (
            <p id="audit-actor-err" role="alert" className="text-sm text-destructive">
              {errors.actor}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-from">{id.admin.audit.filterFrom}</Label>
          <Input
            id="audit-from"
            type="date"
            value={draft.from}
            aria-invalid={errors.range ? true : undefined}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-to">{id.admin.audit.filterTo}</Label>
          <Input
            id="audit-to"
            type="date"
            value={draft.to}
            aria-invalid={errors.range ? true : undefined}
            aria-describedby={errors.range ? 'audit-range-err' : undefined}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
          {errors.range ? (
            <p id="audit-range-err" role="alert" className="text-sm text-destructive">
              {errors.range}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">{id.admin.audit.apply}</Button>
          <Button type="button" variant="outline" onClick={reset}>
            {id.admin.audit.reset}
          </Button>
        </div>
      </form>

      <ResponsiveList
        caption={id.admin.audit.title}
        columns={columns}
        rows={list.data?.data}
        rowKey={(a) => a.id}
        isLoading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyMessage={id.admin.audit.empty}
      />
      <Pagination meta={list.data?.meta} onPage={setPage} />
    </div>
  );
}
