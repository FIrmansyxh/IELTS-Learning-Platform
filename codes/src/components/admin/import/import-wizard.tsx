'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { Skeleton } from '@/components/ui/skeleton';
import { ACTIVE_IMPORT_STATUSES, type Batch } from '@/contracts/import';
import { isApiError } from '@/lib/api/client';
import { id } from '@/i18n/id';
import { importsApi } from '@/lib/api/imports';
import { cn } from '@/lib/utils';
import { LicenseBanner } from '../license-banner';
import { CancelBatchDialog, RollbackBatchDialog } from './batch-dialogs';
import { BatchStatusBadge } from './status-badge';
import { StepPreview } from './step-preview';
import { StepPublish } from './step-publish';
import { StepUpload } from './step-upload';
import { StepValidate } from './step-validate';

const t = id.importer;
export type WizardStep = 1 | 2 | 3 | 4;

/** Langkah yang dipaksa oleh status batch; selain itu admin bebas maju/mundur (2-4). */
export function forcedStep(status: Batch['status'] | null): WizardStep | null {
  if (status === null) return 1;
  if (status === 'PUBLISHING' || status === 'PUBLISHED' || status === 'CANCELLED' || status === 'ROLLED_BACK') return 4;
  if (status === 'UPLOADED' || status === 'VALIDATING' || status === 'FAILED') return 2;
  return null;
}

export function Stepper({ current }: { current: WizardStep }) {
  const steps = [t.steps.upload, t.steps.validate, t.steps.preview, t.steps.publish];
  return (
    <nav aria-label={t.steps.nav}>
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((label, i) => {
          const n = (i + 1) as WizardStep;
          const done = n < current;
          const active = n === current;
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 text-center text-xs font-medium sm:flex-row sm:gap-2 sm:text-sm',
                active ? 'border-primary bg-accent text-[var(--color-primary)]' : done ? 'text-[var(--color-done-text)]' : 'text-muted-foreground',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border text-xs',
                  active && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-[var(--color-done)]',
                )}
              >
                {done ? <Check className="size-3.5" /> : n}
              </span>
              <span>{label}</span>
              <span className="sr-only">{active ? t.steps.current : done ? t.steps.done : ''}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ImportWizard({ batchId }: { batchId: string | null }) {
  const [userStep, setUserStep] = React.useState<WizardStep>(2);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<Batch | null>(null);
  const [rolling, setRolling] = React.useState<Batch | null>(null);

  const q = useQuery({
    queryKey: ['admin', 'import', batchId],
    queryFn: () => importsApi.get(batchId as string),
    enabled: batchId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s && ACTIVE_IMPORT_STATUSES.includes(s) ? 2000 : false;
    },
  });

  const batch = q.data ?? null;
  const forced = batchId === null ? 1 : batch ? forcedStep(batch.status) : null;
  const step: WizardStep = forced ?? userStep;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <div className="flex items-center gap-3">
          {batch ? <BatchStatusBadge status={batch.status} /> : null}
          <Link
            href="/admin/impor"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t.backToHistory}
          </Link>
        </div>
      </div>

      <Stepper current={step} />
      {step > 1 ? <LicenseBanner nonCommercialOnly /> : null}

      {batchId === null ? (
        <StepUpload />
      ) : q.isPending ? (
        <div className="grid gap-3" role="status" aria-label={id.common.loading}>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : q.isError ? (
        isApiError(q.error) && q.error.code === 'NOT_FOUND' ? (
          <ErrorState title={t.notFound} body="" />
        ) : (
          <ErrorState onRetry={() => void q.refetch()} />
        )
      ) : (
        <>
          {step === 2 ? (
            <StepValidate
              batch={q.data}
              acknowledged={acknowledged}
              onAcknowledge={setAcknowledged}
              onNext={() => setUserStep(3)}
              onCancel={() => setCancelling(q.data)}
            />
          ) : null}
          {step === 3 ? <StepPreview batch={q.data} onBack={() => setUserStep(2)} onNext={() => setUserStep(4)} /> : null}
          {step === 4 ? (
            <StepPublish
              batch={q.data}
              acknowledged={acknowledged}
              onAcknowledge={setAcknowledged}
              onBack={() => setUserStep(3)}
              onRollback={() => setRolling(q.data)}
            />
          ) : null}
        </>
      )}

      <CancelBatchDialog batch={cancelling} onClose={() => setCancelling(null)} />
      <RollbackBatchDialog batch={rolling} onClose={() => setRolling(null)} />
    </div>
  );
}
