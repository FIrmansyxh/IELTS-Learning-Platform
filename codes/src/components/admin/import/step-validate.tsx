'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, XCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { Batch } from '@/contracts/import';
import { fmt, id } from '@/i18n/id';
import { apiErrorMessage } from '@/lib/api/errors';
import { importsApi } from '@/lib/api/imports';
import { buildErrorReportCsv, downloadText, flattenIssues, issueMessage, type FlatIssue } from './issues';
import { ResponsiveList, type Column } from '../responsive-list';

const t = id.importer.validate;
const SHOWN_MAX = 100;

export function JobProgress({ batch, label }: { batch: Batch; label: string }) {
  const job = batch.job;
  const queued = job?.status === 'QUEUED';
  const pos = job?.queue_position;
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-4" role="status" aria-live="polite">
      <p className="font-medium">
        {queued ? (pos ? fmt(t.queued, { n: pos }) : t.queuedNoPos) : label}
      </p>
      <Progress value={job?.progress_percent ?? 0} aria-label={t.progress} />
      <p className="text-sm text-muted-foreground">{job?.progress_percent ?? 0}%</p>
    </div>
  );
}

function CountCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-3xl font-bold tabular-nums ${tone}`} data-testid={`count-${label}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function IssueLevel({ severity }: { severity: 'error' | 'warning' }) {
  return severity === 'error' ? (
    <span className="inline-flex items-center gap-1 font-semibold text-destructive">
      <XCircle className="size-4" aria-hidden="true" />
      {t.levelError}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-accent-text)]">
      <AlertTriangle className="size-4" aria-hidden="true" />
      {t.levelWarning}
    </span>
  );
}

export function StepValidate({
  batch,
  acknowledged,
  onAcknowledge,
  onNext,
  onCancel,
}: {
  batch: Batch;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const [onlyErrors, setOnlyErrors] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const ready = batch.status === 'PREVIEW_READY';
  const warnings = batch.summary?.warnings ?? 0;
  const hasErrors = batch.invalid_items > 0;

  const items = useQuery({
    queryKey: ['admin', 'import', batch.id, 'issues'],
    queryFn: () => importsApi.allItems(batch.id),
    enabled: ready,
  });
  const issues = React.useMemo(() => flattenIssues(items.data ?? []), [items.data]);
  const visible = onlyErrors ? issues.filter((i) => i.severity === 'error') : issues;
  const shown = visible.slice(0, SHOWN_MAX);

  async function downloadReport() {
    setDownloading(true);
    try {
      const invalid = await importsApi.allItems(batch.id, { status: 'INVALID' });
      const flat = flattenIssues(invalid);
      if (flat.length === 0) {
        toast.info(t.reportEmpty);
        return;
      }
      downloadText(`laporan-galat-${batch.id.slice(0, 8)}.csv`, buildErrorReportCsv(flat));
      toast.success(t.reportDone);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  const columns: Column<FlatIssue>[] = [
    { key: 'row', header: t.colRow, className: 'w-20', cell: (i) => i.row },
    { key: 'path', header: t.colPath, cell: (i) => <code className="font-mono text-xs break-all">{i.path || i.entityCode || '-'}</code> },
    {
      key: 'message',
      header: t.colMessage,
      cell: (i) => (
        <span className="break-words">
          {issueMessage(i)} <code className="font-mono text-xs text-muted-foreground">({i.code})</code>
        </span>
      ),
    },
    { key: 'level', header: t.colLevel, className: 'w-36', cell: (i) => <IssueLevel severity={i.severity} /> },
  ];

  if (batch.status === 'FAILED') {
    return (
      <div className="grid gap-4">
        <div role="alert" className="grid gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <XCircle className="size-5" aria-hidden="true" />
            {t.failedTitle}
          </p>
          <p className="text-sm">{batch.summary?.last_error?.message ?? t.failedBody}</p>
        </div>
        <Button asChild className="w-fit">
          <Link href="/admin/impor/baru">{t.uploadAgain}</Link>
        </Button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid gap-4">
        <h2 className="text-xl font-semibold">{t.heading}</h2>
        <JobProgress batch={batch} label={t.running} />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <h2 className="text-xl font-semibold">{t.heading}</h2>
      <div className="grid grid-cols-3 gap-3">
        <CountCard label={t.cardValid} value={batch.valid_items} tone="text-[var(--color-done-text)]" />
        <CountCard label={t.cardWarnings} value={warnings} tone="text-[var(--color-accent-text)]" />
        <CountCard label={t.cardErrors} value={batch.invalid_items} tone="text-destructive" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox id="only-errors" checked={onlyErrors} onCheckedChange={(c) => setOnlyErrors(c === true)} />
          <Label htmlFor="only-errors" className="font-normal">
            {t.onlyErrors}
          </Label>
        </div>
        <Button variant="outline" onClick={() => void downloadReport()} loading={downloading} disabled={!hasErrors && warnings === 0}>
          <Download aria-hidden="true" />
          {t.downloadReport}
        </Button>
      </div>

      {items.isPending ? (
        <div className="grid gap-2" role="status" aria-label={id.common.loading}>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.isError ? (
        <ErrorState onRetry={() => void items.refetch()} />
      ) : (
        <>
          <ResponsiveList
            caption={t.heading}
            columns={columns}
            rows={shown}
            rowKey={(i) => `${i.row}-${i.path}-${i.code}`}
            isLoading={false}
            error={false}
            onRetry={() => void items.refetch()}
            emptyMessage={t.noIssues}
          />
          {visible.length > SHOWN_MAX ? (
            <p className="text-sm text-muted-foreground">{fmt(t.ofMore, { shown: SHOWN_MAX, total: visible.length })}</p>
          ) : null}
        </>
      )}

      {hasErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {t.blockedByErrors}
        </p>
      ) : null}
      {!hasErrors && warnings > 0 ? (
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox id="ack-warnings" checked={acknowledged} onCheckedChange={(c) => onAcknowledge(c === true)} />
          <Label htmlFor="ack-warnings" className="font-normal">
            {t.acknowledge}
          </Label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={onNext} disabled={hasErrors || (warnings > 0 && !acknowledged)}>
          {t.next}
        </Button>
        {hasErrors ? (
          <Button asChild variant="outline" size="lg">
            <Link href="/admin/impor/baru">{t.uploadAgain}</Link>
          </Button>
        ) : null}
        <Button variant="ghost" size="lg" onClick={onCancel}>
          {id.importer.history.cancel}
        </Button>
      </div>
    </div>
  );
}
