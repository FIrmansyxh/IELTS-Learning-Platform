'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, History, Lock, Pencil, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { ResponsiveList, type Column } from '@/components/admin/responsive-list';
import { ErrorState } from '@/components/common/state-views';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { curationApi } from '@/lib/api/curation';
import type { AdminQuestion, QualityRow, SetDetail as SetDetailData, UpdateSetRequest } from '@/lib/api/curation-contract';
import { apiErrorMessage, detailMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { BlockersList } from './blockers-list';
import { Field, Textarea } from './fields';
import { QuestionSheet } from './question-sheet';
import { ReviewStatusBadge } from './status';
import { StatusDialog } from './status-dialog';

const t = id.curation.setDetail;

type Row = { q: AdminQuestion; no: number };

export function QualityBadge({ row }: { row: QualityRow | undefined }) {
  if (!row || row.attempts_count === 0) return <span className="text-muted-foreground">{t.qualityFew}</span>;
  const pct = Math.round(row.correct_rate * 100);
  const detail = fmt(t.qualityDetail, { rate: pct, n: row.attempts_count });
  if (row.flag) {
    return (
      <span className="grid gap-0.5" data-flag={row.flag}>
        <Badge variant="outline" className="h-6 w-fit gap-1 border-[var(--color-warning)] font-semibold text-[var(--color-accent-text)]">
          <AlertTriangle aria-hidden="true" />
          {row.flag === 'TOO_HARD' ? t.qualityHard : t.qualityEasy}
        </Badge>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{detail}</span>;
}

function MetaForm({ set, locked, onLocked }: { set: SetDetailData; locked: boolean; onLocked: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState(set.title);
  const [time, setTime] = React.useState(String(set.time_limit_seconds));
  const [pass, setPass] = React.useState(set.pass_percent == null ? '' : String(set.pass_percent));
  const [passage, setPassage] = React.useState(set.reading_passage_markdown ?? '');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const hasPassage = set.reading_passage_markdown !== null;

  const dirty =
    title !== set.title ||
    time !== String(set.time_limit_seconds) ||
    pass !== (set.pass_percent == null ? '' : String(set.pass_percent)) ||
    (hasPassage && passage !== set.reading_passage_markdown);

  const save = useMutation({
    mutationFn: (body: UpdateSetRequest) => curationApi.updateSet(set.id, body),
    onSuccess: () => {
      toast.success(t.metaSaved);
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-set', set.id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-sets'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curriculum'] });
      setErrors({});
      setFormError(null);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'SET_HAS_ACTIVE_ATTEMPTS') {
        onLocked();
        setFormError(apiErrorMessage(e));
        return;
      }
      const next: Record<string, string> = {};
      if (isApiError(e)) for (const d of e.details) next[d.path.split('.')[0] ?? ''] = detailMessage(d.code, d.message);
      setErrors(next);
      setFormError(Object.keys(next).length > 0 ? id.curation.subSheet.errorSummary : apiErrorMessage(e));
    },
  });

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: Record<string, string> = {};
    const range = id.fieldErrors.out_of_range!;
    const body: UpdateSetRequest = {};
    const ti = title.trim();
    if (ti.length < 1 || ti.length > 200) errs.title = range;
    else if (ti !== set.title) body.title = ti;
    const tm = Number(time);
    if (!Number.isInteger(tm) || tm < 30 || tm > 14400) errs.time_limit_seconds = range;
    else if (tm !== set.time_limit_seconds) body.time_limit_seconds = tm;
    if (pass.trim() === '') {
      if (set.pass_percent !== null) body.pass_percent = null;
    } else {
      const pp = Number(pass);
      if (!Number.isInteger(pp) || pp < 1 || pp > 100) errs.pass_percent = range;
      else if (pp !== set.pass_percent) body.pass_percent = pp;
    }
    if (hasPassage && passage !== set.reading_passage_markdown) {
      if (passage.length > 60000) errs.reading_passage_markdown = range;
      else body.reading_passage_markdown = passage.trim() === '' ? null : passage;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setFormError(id.curation.subSheet.errorSummary);
      return;
    }
    if (Object.keys(body).length === 0) {
      setFormError(id.curation.subSheet.noChanges);
      return;
    }
    setFormError(null);
    save.mutate(body);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="set-meta-title">
      <h2 id="set-meta-title" className="text-lg font-bold">
        {t.meta}
      </h2>
      <FormErrorSummary message={formError} />
      <Field id="set-title" label={t.fieldTitle} error={errors.title}>
        {(a) => <Input {...a} disabled={locked} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="set-time" label={t.fieldTime} error={errors.time_limit_seconds}>
          {(a) => <Input {...a} type="number" inputMode="numeric" disabled={locked} value={time} onChange={(e) => setTime(e.target.value)} />}
        </Field>
        <Field id="set-pass" label={t.fieldPass} hint={t.passHint} error={errors.pass_percent}>
          {(a) => <Input {...a} type="number" inputMode="numeric" disabled={locked} value={pass} onChange={(e) => setPass(e.target.value)} />}
        </Field>
      </div>
      {hasPassage ? (
        <Field id="set-passage" label={t.passage} error={errors.reading_passage_markdown}>
          {(a) => <Textarea {...a} lang="en" rows={10} className="font-mono text-sm" disabled={locked} value={passage} onChange={(e) => setPassage(e.target.value)} />}
        </Field>
      ) : null}
      <Button type="submit" className="w-fit" loading={save.isPending} disabled={locked || !dirty}>
        {t.saveMeta}
      </Button>
    </form>
  );
}

/** `/admin/konten/soal/{set_id}`: pengaturan set, daftar soal dengan kualitas, dan Sheet sunting soal. */
export function SetDetail({ setId }: { setId: string }) {
  const q = useQuery({ queryKey: ['admin', 'curation-set', setId], queryFn: ({ signal }) => curationApi.set(setId, signal) });
  const quality = useQuery({ queryKey: ['admin', 'curation-quality', setId], queryFn: ({ signal }) => curationApi.quality(setId, signal), retry: false });
  const [forcedLock, setLocked] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminQuestion | null>(null);
  const [statusOpen, setStatusOpen] = React.useState(false);

  const qualityById = React.useMemo(() => new Map((quality.data?.questions ?? []).map((r) => [r.question_id, r])), [quality.data]);

  const back = (
    <Link href="/admin/konten/soal" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t.back}
    </Link>
  );

  if (q.isPending) {
    return (
      <div className="grid gap-4" role="status" aria-label={id.common.loading}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState title={t.loadFailed} onRetry={() => void q.refetch()} />
      </div>
    );
  }
  const set = q.data;
  // Kunci sejak muat bila server melaporkan attempt hidup (K3); 409 SET_HAS_ACTIVE_ATTEMPTS tetap mengunci sebagai pengaman.
  const locked = set.has_active_attempts || forcedLock;
  const rows: Row[] = set.questions.map((qq, i) => ({ q: qq, no: i + 1 }));
  const columns: Column<Row>[] = [
    { key: 'no', header: t.colNo, className: 'w-14', cell: (r) => <span className="tabular-nums">{r.no}</span> },
    { key: 'type', header: t.colType, cell: (r) => <code className="font-mono text-xs">{r.q.question_type}</code> },
    {
      key: 'prompt',
      header: t.colPrompt,
      cell: (r) => (
        <span lang="en" className="line-clamp-2 break-words text-left">
          {r.q.prompt}
        </span>
      ),
    },
    { key: 'quality', header: t.colQuality, cell: (r) => <QualityBadge row={qualityById.get(r.q.question_id)} /> },
    {
      key: 'edit',
      header: id.common.actions,
      hideLabelOnCard: true,
      cell: (r) => (
        <Button type="button" variant="outline" size="sm" className="w-full md:w-auto" onClick={() => setEditing(r.q)} aria-label={fmt(t.editAria, { id: r.q.question_id })}>
          <Pencil aria-hidden="true" />
          {t.edit}
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      {back}
      <div className="grid gap-2">
        <h1 className="text-3xl font-bold break-words">{set.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <ReviewStatusBadge status={set.status} />
          <span className="text-muted-foreground">{id.curation.setTypes[set.assessment_type] ?? set.assessment_type}</span>
          <span className="text-muted-foreground">{set.scope_label}</span>
          <span className="tabular-nums text-muted-foreground">{fmt(t.versionNow, { n: set.version })}</span>
          <span className="text-muted-foreground">{set.reviewed_at ? fmt(t.reviewedAt, { date: formatDateTime(set.reviewed_at) }) : t.notReviewed}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setStatusOpen(true)}>
            <Repeat2 aria-hidden="true" />
            {t.changeStatus}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/konten/revisi?tipe=ASSESSMENT_SET&id=${set.id}`}>
              <History aria-hidden="true" />
              {t.revisions}
            </Link>
          </Button>
        </div>
      </div>

      {locked ? (
        <div role="alert" data-testid="locked-banner" className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-warning)] bg-[var(--color-surface-muted)] p-3 text-sm">
          <Lock className="size-4 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" />
          <p className="flex-1">{t.locked}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => {
              setLocked(false);
              void q.refetch();
            }}>
            {id.common.retry}
          </Button>
        </div>
      ) : null}

      {set.blockers.length > 0 ? (
        <section aria-labelledby="set-blockers" className="grid gap-2">
          <h2 id="set-blockers" className="text-sm font-semibold">
            {id.curation.blockers.title}
          </h2>
          <BlockersList blockers={set.blockers} />
        </section>
      ) : null}

      <MetaForm key={`${set.id}-${set.version}`} set={set} locked={locked} onLocked={() => setLocked(true)} />

      <section aria-labelledby="set-questions" className="grid gap-3">
        <h2 id="set-questions" className="text-lg font-bold">
          {t.questions}
        </h2>
        {quality.isError ? <p className="text-sm text-muted-foreground">{t.qualityLoadFailed}</p> : null}
        <ResponsiveList
          caption={t.questions}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.q.question_id}
          isLoading={false}
          error={false}
          onRetry={() => undefined}
          emptyMessage={t.noQuestions}
          rowLabel={(r) => r.q.question_id}
        />
      </section>

      <QuestionSheet setId={set.id} question={editing} locked={locked} onLocked={() => setLocked(true)} onClose={() => setEditing(null)} />
      <StatusDialog
        target={statusOpen ? { entity: 'assessment-sets', entityId: set.id, label: set.title, current: set.status, needsAiConfirm: set.origin === 'AI_GENERATED_REVIEWED' } : null}
        onClose={() => setStatusOpen(false)}
      />
    </div>
  );
}
