'use client';

import { AlertTriangle, Info, Minus, Plus } from 'lucide-react';
import * as React from 'react';
import { BandBadge, EstimasiNotice, formatBand } from '@/components/band/band-display';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateTime } from '@/lib/format';
import { fmt, id } from '@/i18n/id';
import { annotateText, type Correction } from '@/lib/ai/annotate';
import { isSpeakingKind, type Evaluation, type SubmissionKindType } from '@/lib/api/ai-contract';
import { cn } from '@/lib/utils';

function Banner({ tone, children }: { tone: 'warn' | 'info'; children: React.ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-sm',
        tone === 'warn' ? 'border-[var(--color-warning)] bg-[var(--color-warning)]/10' : 'border-[var(--color-info)] bg-[var(--color-info)]/10',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone === 'warn' ? 'text-[var(--color-accent-text)]' : 'text-[var(--color-info)]')} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function FlagBanners({ evaluation, minWords }: { evaluation: Evaluation; minWords?: number | null }) {
  const f = evaluation.flags;
  return (
    <>
      {f.injection_suspected ? <Banner tone="warn">{id.ai.eval.flagInjection}</Banner> : null}
      {f.score_capped && f.cap_reason === 'word_count' ? (
        <Banner tone="info">
          {minWords ? fmt(id.ai.eval.flagWordCount, { min: minWords }) : id.ai.eval.flagWordCountNoMin}
        </Banner>
      ) : null}
      {f.score_capped && f.cap_reason === 'duration' ? <Banner tone="info">{id.ai.eval.flagDuration}</Banner> : null}
      {f.non_english_suspected ? <Banner tone="info">{id.ai.eval.flagNonEnglish}</Banner> : null}
      {f.high_band_capped ? <Banner tone="info">{id.ai.eval.flagHighBand}</Banner> : null}
      {f.low_audio_quality ? <Banner tone="info">{id.ai.eval.flagLowAudio}</Banner> : null}
    </>
  );
}

function CorrectionMark({ c, children }: { c: Correction; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-testid="annotation"
          className="cursor-help underline decoration-[var(--color-error)] decoration-wavy underline-offset-4 focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {children}
          <span className="sr-only">
            {' '}
            ({fmt(id.ai.eval.correctionNote, { improved: c.improved, reason: c.reason_id })})
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-semibold">{c.improved}</p>
        <p>{c.reason_id}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Teks pengguna dengan anotasi inline; semua isi dirender sebagai teks polos (newline dipertahankan). */
export function AnnotatedText({ text, corrections }: { text: string; corrections: Correction[] }) {
  const { segments, unmatched } = React.useMemo(() => annotateText(text, corrections), [text, corrections]);
  return (
    <div className="grid gap-3">
      <p lang="en" className="whitespace-pre-wrap break-words text-base leading-7" data-testid="annotated-text">
        {segments.map((seg, i) =>
          seg.correction ? (
            <CorrectionMark key={i} c={seg.correction}>
              {seg.text}
            </CorrectionMark>
          ) : (
            <React.Fragment key={i}>{seg.text}</React.Fragment>
          ),
        )}
      </p>
      {unmatched.length > 0 ? (
        <section aria-label={id.ai.eval.corrections} data-testid="unmatched-corrections" className="grid gap-2 rounded-md border bg-muted p-3">
          <h4 className="text-sm font-semibold">{id.ai.eval.corrections}</h4>
          <p className="text-xs text-muted-foreground">{id.ai.eval.correctionsHelp}</p>
          <ul className="grid gap-2">
            {unmatched.map((c, i) => (
              <li key={i} className="grid gap-0.5 text-sm">
                <span lang="en" className="whitespace-pre-wrap break-words">
                  <span className="line-through decoration-[var(--color-error)]">{c.original}</span>
                  {' -> '}
                  <span className="font-medium">{c.improved}</span>
                </span>
                <span className="text-muted-foreground">{c.reason_id}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function DiffPanel({ corrections }: { corrections: Correction[] }) {
  return (
    <section aria-labelledby="eval-band7" className="grid gap-3 rounded-lg border p-4" data-testid="band7-diff">
      <h3 id="eval-band7" className="text-lg font-semibold">
        {id.ai.eval.toBand7}
      </h3>
      <ul className="grid gap-4">
        {corrections.map((c, i) => (
          <li key={i} className="grid gap-1.5">
            <p className="flex items-start gap-2 text-sm">
              <Minus className="mt-0.5 size-4 shrink-0 text-[var(--color-error)]" aria-hidden="true" />
              <span className="font-semibold text-[var(--color-error)]">{id.ai.eval.remove}:</span>
              <span lang="en" className="whitespace-pre-wrap break-words line-through decoration-[var(--color-error)]">
                {c.original}
              </span>
            </p>
            <p className="flex items-start gap-2 text-sm">
              <Plus className="mt-0.5 size-4 shrink-0 text-[var(--color-done-text)]" aria-hidden="true" />
              <span className="font-semibold text-[var(--color-done-text)]">{id.ai.eval.add}:</span>
              <span lang="en" className="whitespace-pre-wrap break-words">
                {c.improved}
              </span>
            </p>
            <p className="pl-6 text-sm text-muted-foreground">{c.reason_id}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlainList({ title, items, id: headingId }: { title: string; items: string[]; id: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h3 id={headingId} className="text-lg font-semibold">
        {title}
      </h3>
      <ul className="grid list-disc gap-1.5 pl-5">
        {items.map((t, i) => (
          <li key={i} className="whitespace-pre-wrap break-words">
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Kartu hasil penilaian (SPEC-012/013): band keseluruhan + disclaimer, 4 kriteria, tulisan/transkrip
 * dengan anotasi, panel "Menuju Band 7", kekuatan, saran. Semua teks AI = teks polos, bukan HTML.
 */
export function EvaluationCard({
  evaluation,
  kind,
  responseText,
  minWords,
  children,
}: {
  evaluation: Evaluation;
  kind: SubmissionKindType;
  responseText: string | null;
  minWords?: number | null;
  /** Slot tambahan (mis. pemutar & hapus rekaman Speaking). */
  children?: React.ReactNode;
}) {
  const speaking = isSpeakingKind(kind);
  const self = evaluation.method === 'SELF_ASSESSMENT';
  return (
    <article aria-labelledby="eval-title" data-testid="evaluation-card" data-method={evaluation.method} className="grid gap-5 rounded-xl border bg-card p-4 sm:p-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="eval-title" className="text-xl font-bold">
            {id.ai.eval.title}
          </h2>
          <Badge variant={self ? 'secondary' : 'outline'}>{self ? id.ai.eval.selfBadge : id.ai.eval.aiBadge}</Badge>
          {speaking && evaluation.flags.pronunciation_estimated ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-h-6 items-center rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label={id.ai.eval.pronTipTrigger}
                >
                  <Badge variant="outline" data-testid="pron-badge">
                    <Info aria-hidden="true" />
                    {id.ai.eval.pronBadge}
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{id.ai.eval.pronTip}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="sr-only">{id.ai.eval.overall}</span>
          <BandBadge band={evaluation.overall_band} size="lg" />
        </div>
        <EstimasiNotice />
        {evaluation.task_requirement_met !== null && !speaking && !self ? (
          <p className="text-sm text-muted-foreground">
            {evaluation.task_requirement_met ? id.ai.eval.requirementMet : id.ai.eval.requirementNotMet}
          </p>
        ) : null}
      </header>

      <FlagBanners evaluation={evaluation} minWords={minWords} />

      <section aria-labelledby="eval-criteria" className="grid gap-3">
        <h3 id="eval-criteria" className="text-lg font-semibold">
          {id.ai.eval.criteria}
        </h3>
        <ul className="grid gap-4">
          {evaluation.criteria.map((c) => (
            <li key={c.key} className="grid gap-1.5" data-testid="criterion-row">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{c.name}</span>
                <span className="font-heading text-lg font-bold tabular-nums">{formatBand(c.band)}</span>
              </div>
              <Progress
                value={(c.band / 9) * 100}
                aria-label={`${c.name}: ${fmt(id.ai.eval.criterionBand, { band: formatBand(c.band) })}`}
                aria-valuenow={Math.round((c.band / 9) * 100)}
              />
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{c.comment_id ?? id.ai.eval.noComment}</p>
            </li>
          ))}
        </ul>
      </section>

      {responseText ? (
        <section aria-labelledby="eval-text" className="grid gap-2">
          <h3 id="eval-text" className="text-lg font-semibold">
            {speaking ? id.ai.eval.transcript : id.ai.eval.yourText}
          </h3>
          {speaking ? (
            <p lang="en" className="whitespace-pre-wrap break-words rounded-md border bg-muted p-3 text-base leading-7" data-testid="transcript">
              {responseText}
            </p>
          ) : (
            <>
              {evaluation.corrections.length > 0 ? <p className="text-sm text-muted-foreground">{id.ai.eval.yourTextHelp}</p> : null}
              <AnnotatedText text={responseText} corrections={evaluation.corrections} />
            </>
          )}
        </section>
      ) : null}

      {!speaking && evaluation.corrections.length > 0 ? <DiffPanel corrections={evaluation.corrections} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <PlainList id="eval-strengths" title={id.ai.eval.strengths} items={evaluation.strengths_id} />
        <PlainList id="eval-improvements" title={id.ai.eval.improvements} items={evaluation.improvements_id} />
      </div>

      {speaking && evaluation.corrections.length > 0 ? <DiffPanel corrections={evaluation.corrections} /> : null}

      {evaluation.band7_rewrite ? (
        <section aria-labelledby="eval-rewrite" className="grid gap-2">
          <h3 id="eval-rewrite" className="text-lg font-semibold">
            {speaking ? id.ai.eval.rewriteSpeaking : id.ai.eval.rewrite}
          </h3>
          <blockquote lang="en" className="whitespace-pre-wrap break-words border-l-4 border-primary bg-muted p-3 text-base leading-7" data-testid="band7-rewrite">
            {evaluation.band7_rewrite}
          </blockquote>
        </section>
      ) : null}

      {children}

      <footer className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{fmt(id.ai.eval.date, { date: formatDateTime(evaluation.created_at) })}</span>
        {evaluation.model_name ? <span>{fmt(id.ai.eval.model, { name: evaluation.model_name })}</span> : null}
      </footer>
    </article>
  );
}
