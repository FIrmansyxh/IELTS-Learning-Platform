'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVE_IMPORT_STATUSES, ImportStatus, type Batch } from '@/contracts/import';
import { fmt, id } from '@/i18n/id';
import { importsApi } from '@/lib/api/imports';
import { formatDateTime } from '@/lib/format';
import { Pagination, ResponsiveList, type Column } from '../responsive-list';
import { CancelBatchDialog, RollbackBatchDialog } from './batch-dialogs';
import { BatchStatusBadge } from './status-badge';

const t = id.importer.history;
const PAGE_SIZE = 20;
const ALL = 'all';

export function ImportsPanel() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState(ALL);
  const [cancelling, setCancelling] = React.useState<Batch | null>(null);
  const [rolling, setRolling] = React.useState<Batch | null>(null);
  React.useEffect(() => setPage(1), [status]);

  const params = { page, page_size: PAGE_SIZE, status: status === ALL ? undefined : status };
  const list = useQuery({
    queryKey: ['admin', 'imports', params],
    queryFn: () => importsApi.list(params),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.data.some((b) => ACTIVE_IMPORT_STATUSES.includes(b.status)) ? 3000 : false),
  });

  const columns: Column<Batch>[] = [
    { key: 'date', header: t.colDate, cell: (b) => formatDateTime(b.created_at) },
    { key: 'file', header: t.colFile, cell: (b) => <span className="break-all">{b.file_name}</span> },
    { key: 'kind', header: t.colKind, cell: (b) => (b.format === 'JSON' ? t.kindJson : t.kindCsv) },
    { key: 'status', header: t.colStatus, cell: (b) => <BatchStatusBadge status={b.status} /> },
    {
      key: 'items',
      header: t.colItems,
      cell: (b) =>
        b.status === 'UPLOADED' || b.status === 'VALIDATING'
          ? '-'
          : fmt(t.itemsCount, { valid: b.valid_items, invalid: b.invalid_items, total: b.total_items }),
    },
    {
      key: 'actions',
      header: id.common.actions,
      hideLabelOnCard: true,
      className: 'w-64',
      cell: (b) => {
        const resumable = b.status === 'UPLOADED' || b.status === 'PREVIEW_READY';
        return (
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant={resumable ? 'default' : 'outline'} size="sm">
              <Link href={`/admin/impor/${b.id}`} aria-label={`${resumable ? t.resume : t.view}: ${b.file_name}`}>
                {resumable ? t.resume : t.view}
              </Link>
            </Button>
            {resumable ? (
              <Button variant="outline" size="sm" onClick={() => setCancelling(b)} aria-label={`${t.cancel}: ${b.file_name}`}>
                {t.cancel}
              </Button>
            ) : null}
            {b.status === 'PUBLISHED' ? (
              <Button variant="outline" size="sm" onClick={() => setRolling(b)} aria-label={`${t.rollback}: ${b.file_name}`}>
                {t.rollback}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{id.importer.title}</h1>
        <Button asChild>
          <Link href="/admin/impor/baru">
            <Plus aria-hidden="true" />
            {t.newImport}
          </Link>
        </Button>
      </div>

      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="imports-status">{t.filterStatus}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="imports-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{id.common.all}</SelectItem>
            {ImportStatus.options.map((s) => (
              <SelectItem key={s} value={s}>
                {id.importer.statuses[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ResponsiveList
        caption={id.importer.title}
        columns={columns}
        rows={list.data?.data}
        rowKey={(b) => b.id}
        isLoading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyMessage={t.empty}
        rowLabel={(b) => b.file_name}
      />
      <Pagination meta={list.data?.meta} onPage={setPage} />

      <CancelBatchDialog batch={cancelling} onClose={() => setCancelling(null)} />
      <RollbackBatchDialog batch={rolling} onClose={() => setRolling(null)} />
    </div>
  );
}
