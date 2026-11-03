'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Batch } from '@/contracts/import';
import { fmt, id } from '@/i18n/id';
import { apiErrorMessage } from '@/lib/api/errors';
import { importsApi } from '@/lib/api/imports';
import { ConfirmDialog } from '../dialogs';
import { invalidateImports } from './batch-dialogs';
import { JobProgress } from './step-validate';

const t = id.importer.publish;
type Target = 'DRAFT' | 'PUBLISHED';

export function StepPublish({
  batch,
  acknowledged,
  onAcknowledge,
  onBack,
  onRollback,
}: {
  batch: Batch;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
  onBack: () => void;
  onRollback: () => void;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = React.useState<Target>('DRAFT');
  const [confirm, setConfirm] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const warnings = batch.summary?.warnings ?? 0;
  const lastError = batch.summary?.last_error ?? null;
  const ready = batch.status === 'PREVIEW_READY';

  const items = useQuery({
    queryKey: ['admin', 'import', batch.id, 'issues'],
    queryFn: () => importsApi.allItems(batch.id),
    enabled: ready,
  });
  const assetUnverified = (items.data ?? []).some((it) => it.errors.some((e) => e.code === 'asset_unverified'));

  const counts = React.useMemo(() => {
    const c = { CREATE: 0, UPDATE: 0, NOOP: 0 };
    for (const it of items.data ?? []) if (it.action) c[it.action] += 1;
    return c;
  }, [items.data]);

  React.useEffect(() => {
    if (assetUnverified && target === 'PUBLISHED') setTarget('DRAFT');
  }, [assetUnverified, target]);

  const publish = useMutation({
    mutationFn: () => importsApi.publish(batch.id, { target_status: target, acknowledge_warnings: acknowledged }),
    onSuccess: () => {
      setConfirm(false);
      setError(null);
      invalidateImports(qc, batch.id);
    },
    onError: (e) => {
      setConfirm(false);
      setError(apiErrorMessage(e));
      invalidateImports(qc, batch.id);
    },
  });

  if (batch.status === 'PUBLISHING') {
    return (
      <div className="grid gap-4">
        <h2 className="text-xl font-semibold">{t.heading}</h2>
        <JobProgress batch={batch} label={t.running} />
      </div>
    );
  }

  if (batch.status === 'PUBLISHED') {
    return (
      <div className="grid gap-4">
        <h2 className="text-xl font-semibold">{t.heading}</h2>
        <div role="status" className="grid gap-2 rounded-lg border border-[var(--color-done)] bg-card p-4">
          <p className="flex items-center gap-2 font-semibold text-[var(--color-done-text)]">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            {t.doneTitle}
          </p>
          <p className="text-sm" data-testid="publish-result">
            {fmt(t.doneBody, { created: batch.created_count, updated: batch.updated_count, skipped: batch.skipped_count })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/admin/konten/kurikulum">{t.toCurriculum}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/admin/impor">{t.toHistory}</Link>
          </Button>
          <Button variant="outline" size="lg" onClick={onRollback}>
            {t.rollbackBtn}
          </Button>
        </div>
      </div>
    );
  }

  if (batch.status === 'CANCELLED' || batch.status === 'ROLLED_BACK') {
    return (
      <div className="grid gap-4">
        <h2 className="text-xl font-semibold">{t.heading}</h2>
        <p role="status" className="rounded-lg border bg-card p-4 text-sm">
          {batch.status === 'CANCELLED' ? t.endedCancelled : t.endedRolledBack}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/admin/impor/baru">{id.importer.history.newImport}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/admin/impor">{t.toHistory}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <h2 className="text-xl font-semibold">{t.heading}</h2>

      {lastError ? (
        <div role="alert" className="grid gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4" data-testid="last-error">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
            {lastError.code === 'PUBLISH_BLOCKED' ? t.blockedTitle : t.lastErrorTitle}
          </p>
          <p className="text-sm">
            {lastError.code === 'PUBLISH_BLOCKED' ? t.blockedBody : (id.apiErrors[lastError.code] ?? lastError.message)}
          </p>
          {lastError.blockers && lastError.blockers.length > 0 ? (
            <ul className="grid gap-1 text-sm" aria-label={t.blockedTitle}>
              {lastError.blockers.map((b, i) => (
                <li key={`${b.code}-${b.asset_code ?? b.entity_code ?? i}`} className="rounded-md border bg-card p-2 break-words">
                  <code className="font-mono text-xs">{b.code}</code>{' '}
                  {b.asset_code ? (
                    <Link href="/admin/konten/aset" className="font-medium underline underline-offset-2">
                      {b.asset_code}
                    </Link>
                  ) : (
                    (b.entity_code ?? t.blockerUnknownAsset)
                  )}
                  {b.message ? <span className="text-muted-foreground"> - {b.message}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href="/admin/konten/aset">{t.toAssets}</Link>
          </Button>
        </div>
      ) : null}

      <FormErrorSummary message={error} />

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold">{t.targetLabel}</legend>
        <RadioGroup value={target} onValueChange={(v) => setTarget(v as Target)} className="grid gap-3">
          <div className="flex items-start gap-3">
            <RadioGroupItem value="DRAFT" id="target-draft" className="mt-1" />
            <Label htmlFor="target-draft" className="grid gap-0.5 font-normal">
              <span className="font-medium">{t.draft}</span>
              <span className="text-sm text-muted-foreground">{t.draftHint}</span>
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="PUBLISHED" id="target-published" className="mt-1" disabled={assetUnverified} aria-describedby={assetUnverified ? 'target-published-why' : undefined} />
            <Label htmlFor="target-published" className="grid gap-0.5 font-normal">
              <span className="font-medium">{t.published}</span>
              <span className="text-sm text-muted-foreground">{t.publishedHint}</span>
              {assetUnverified ? (
                <span id="target-published-why" className="text-sm font-medium text-destructive">
                  {t.publishedDisabled}
                </span>
              ) : null}
            </Label>
          </div>
        </RadioGroup>
      </fieldset>

      {warnings > 0 ? (
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox id="publish-ack" checked={acknowledged} onCheckedChange={(c) => onAcknowledge(c === true)} />
          <Label htmlFor="publish-ack" className="font-normal">
            {id.importer.validate.acknowledge}
          </Label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={onBack}>
          {id.importer.preview.back}
        </Button>
        <Button size="lg" disabled={!ready || batch.invalid_items > 0 || (warnings > 0 && !acknowledged)} onClick={() => setConfirm(true)}>
          {t.submit}
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.confirmTitle}
        body={fmt(t.confirmBody, {
          created: counts.CREATE,
          updated: counts.UPDATE,
          noop: counts.NOOP,
          target: t.targetNames[target] ?? target,
        })}
        confirmLabel={t.confirmAction}
        pending={publish.isPending}
        onConfirm={() => publish.mutate()}
      />
    </div>
  );
}
