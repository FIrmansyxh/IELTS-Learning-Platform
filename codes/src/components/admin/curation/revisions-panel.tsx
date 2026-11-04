'use client';

import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Pagination, ResponsiveList, type Column } from '@/components/admin/responsive-list';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { curationApi } from '@/lib/api/curation';
import { RevisionEntityType, type Revision, type RevisionEntityTypeValue } from '@/lib/api/curation-contract';
import { formatDateTime } from '@/lib/format';
import { CurationTabs } from './curation-tabs';
import { Field, NativeSelect } from './fields';

const t = id.curation.revisions;
const PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function SnapshotSheet({ revision, onClose }: { revision: Revision | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['admin', 'curation-revision', revision?.id],
    queryFn: ({ signal }) => curationApi.revision(revision!.id, signal),
    enabled: revision !== null,
  });
  return (
    <Sheet open={revision !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{revision ? fmt(t.snapshotTitle, { n: revision.version }) : ''}</SheetTitle>
          <SheetDescription>{t.snapshotDesc}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {q.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : q.isError ? (
            <ErrorState onRetry={() => void q.refetch()} />
          ) : (
            <pre data-testid="snapshot-json" tabIndex={0} className="max-h-[70dvh] overflow-auto rounded-md border bg-[var(--color-surface-muted)] p-3 font-mono text-xs break-words whitespace-pre-wrap">
              {JSON.stringify(q.data.snapshot, null, 2)}
            </pre>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** `/admin/konten/revisi`: pilih entitas lalu lihat riwayat versi; snapshot JSON baca-saja di Sheet. */
export function RevisionsPanel() {
  const [type, setType] = React.useState<RevisionEntityTypeValue>('ASSESSMENT_SET');
  const [entityId, setEntityId] = React.useState('');
  const [applied, setApplied] = React.useState<{ type: RevisionEntityTypeValue; id: string } | null>(null);
  const [idError, setIdError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<Revision | null>(null);

  // Tautan "Riwayat revisi" dari halaman set/sub-modul: `?tipe=...&id=...`.
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const tp = RevisionEntityType.safeParse(sp.get('tipe'));
    const eid = sp.get('id');
    if (tp.success && eid && UUID_RE.test(eid)) {
      setType(tp.data);
      setEntityId(eid);
      setApplied({ type: tp.data, id: eid });
    }
  }, []);

  const list = useQuery({
    queryKey: ['admin', 'curation-revisions', applied, page],
    queryFn: ({ signal }) => curationApi.revisions({ entity_type: applied!.type, entity_id: applied!.id, page, page_size: PAGE_SIZE }, signal),
    enabled: applied !== null,
    placeholderData: (prev) => prev,
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = entityId.trim();
    if (!UUID_RE.test(v)) {
      setIdError(t.idInvalid);
      return;
    }
    setIdError(null);
    setPage(1);
    setApplied({ type, id: v });
  }

  const columns: Column<Revision>[] = [
    { key: 'version', header: t.colVersion, className: 'w-20', cell: (r) => <span className="font-semibold tabular-nums">{r.version}</span> },
    { key: 'by', header: t.colBy, cell: (r) => r.changed_by_name ?? t.unknownUser },
    { key: 'when', header: t.colWhen, cell: (r) => formatDateTime(r.created_at) },
    { key: 'batch', header: t.colBatch, cell: (r) => (r.import_batch_id ? <code className="font-mono text-xs break-all">{r.import_batch_id}</code> : t.noBatch) },
    {
      key: 'view',
      header: t.colView,
      hideLabelOnCard: true,
      cell: (r) => (
        <Button type="button" variant="outline" size="sm" className="w-full md:w-auto" onClick={() => setOpen(r)} aria-label={fmt(t.viewAria, { n: r.version })}>
          {t.view}
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>
      <CurationTabs current="revisi" />

      <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
        <Field id="rev-type" label={t.entityType}>
          {(a) => (
            <NativeSelect {...a} value={type} onChange={(e) => setType(e.target.value as RevisionEntityTypeValue)}>
              {RevisionEntityType.options.map((o) => (
                <option key={o} value={o}>
                  {t.types[o]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field id="rev-id" label={t.entityId} hint={t.entityIdHint} error={idError}>
          {(a) => <Input {...a} value={entityId} className="font-mono" onChange={(e) => setEntityId(e.target.value)} />}
        </Field>
        <Button type="submit" className="sm:mb-[1.75rem]">
          {t.load}
        </Button>
      </form>

      {applied === null ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t.pickPrompt}</p>
      ) : (
        <>
          <ResponsiveList
            caption={t.title}
            columns={columns}
            rows={list.data?.data}
            rowKey={(r) => r.id}
            isLoading={list.isPending}
            error={list.isError}
            onRetry={() => void list.refetch()}
            emptyMessage={t.empty}
            rowLabel={(r) => fmt(t.snapshotTitle, { n: r.version })}
          />
          <Pagination meta={list.data?.meta} onPage={setPage} />
        </>
      )}
      <SnapshotSheet revision={open} onClose={() => setOpen(null)} />
    </div>
  );
}
