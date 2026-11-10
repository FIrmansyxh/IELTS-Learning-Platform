'use client';

import { CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { AttemptResult } from '@/contracts/attempts';
import type { MixResult } from '@/contracts/mix';
import { fmt, id } from '@/i18n/id';
import { formatScorePercent } from '@/lib/format';

type Tally = { answered: number; correct: number; percent: number };

function TallyList({ title, titleId, rows }: { title: string; titleId: string; rows: Array<Tally & { key: string; label: string }> }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="rounded-xl border bg-card p-4">
      <h2 id={titleId} className="mb-3 text-sm font-semibold">
        {title}
      </h2>
      <ul className="grid gap-3">
        {rows.map((r) => (
          <li key={r.key} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="tabular-nums">{formatScorePercent(r.percent)}%</span>
            </div>
            <Progress value={Math.max(0, Math.min(100, r.percent))} aria-label={`${r.label}: ${formatScorePercent(r.percent)}%`} className="h-1.5" />
            <span className="text-xs text-muted-foreground">{fmt(id.mix.result.answered, { correct: r.correct, answered: r.answered })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function aiStatus(item: MixResult['ai_items'][number]) {
  if (!item.submission_id) return { text: id.mix.result.aiNotSent, Icon: MinusCircle, tone: 'text-muted-foreground' };
  if (item.status === 'GRADED' || item.status === 'FALLBACK_SELF_ASSESSMENT') {
    return { text: id.mix.result.aiDone, Icon: CheckCircle2, tone: 'text-[var(--color-done-text)]' };
  }
  if (item.status === 'FAILED') return { text: id.mix.result.aiFailed, Icon: XCircle, tone: 'text-destructive' };
  return { text: id.mix.result.aiWaiting, Icon: Clock, tone: 'text-muted-foreground' };
}

/** Hasil Latihan Campur: skor objektif, rincian per skill/tipe, item AI, dan saran bank berikutnya. */
export function MixResultView({ result }: { result: AttemptResult }) {
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const mix = result.mix ?? null;
  const { attempt } = result;
  const objectiveAnswered = (mix?.per_skill ?? []).reduce((n, s) => n + s.answered, 0);
  const hasObjective = mix ? objectiveAnswered > 0 : true;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5">
      <div className="grid gap-3 rounded-xl border bg-card p-5 sm:p-6">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
          {id.mix.result.title}
        </h1>
        {hasObjective ? (
          <div>
            <p className="text-sm font-semibold text-muted-foreground">{id.mix.result.score}</p>
            <p className="text-5xl font-bold tabular-nums" data-testid="score-percent">
              {formatScorePercent(attempt.score_percent)}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmt(id.mix.result.raw, { raw: attempt.raw_score, max: attempt.max_score })}
            </p>
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {id.mix.result.noObjective}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{id.mix.result.noPass}</p>
      </div>

      {mix ? (
        <>
          <TallyList
            title={id.mix.result.perSkill}
            titleId="mix-result-skill"
            rows={mix.per_skill.map((s) => ({ ...s, key: s.skill, label: id.mix.skillNames[s.skill] ?? s.skill }))}
          />
          <TallyList
            title={id.mix.result.perType}
            titleId="mix-result-type"
            rows={mix.per_question_type.map((t) => ({
              ...t,
              key: t.question_type,
              label: id.mix.typeNames[t.question_type] ?? t.question_type,
            }))}
          />

          {mix.ai_items.length > 0 ? (
            <section aria-labelledby="mix-result-ai" className="rounded-xl border bg-card p-4">
              <h2 id="mix-result-ai" className="mb-3 text-sm font-semibold">
                {id.mix.result.aiTitle}
              </h2>
              <ul className="grid gap-2">
                {mix.ai_items.map((item) => {
                  const st = aiStatus(item);
                  return (
                    <li key={item.question_id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{id.mix.skillNames[item.skill] ?? item.skill}</span>
                      <span className={`inline-flex items-center gap-1.5 ${st.tone}`}>
                        <st.Icon className="size-4" aria-hidden="true" />
                        {st.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">{id.mix.result.aiDisclaimer}</p>
            </section>
          ) : null}

          {mix.suggested_banks.length > 0 ? (
            <section aria-labelledby="mix-result-suggest" className="rounded-xl border bg-card p-4">
              <h2 id="mix-result-suggest" className="mb-3 text-sm font-semibold">
                {id.mix.result.suggestedTitle}
              </h2>
              <ul className="grid gap-2">
                {mix.suggested_banks.map((b) => (
                  <li key={b.bank_code} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{b.title}</p>
                      <p className="text-xs text-muted-foreground">{id.mix.result.suggestedReason}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/latihan/campur?bank=${encodeURIComponent(b.bank_code)}`}>{id.mix.result.suggestedUse}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="sm:flex-1">
          <Link href="/latihan/campur">{id.mix.result.again}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">{id.mix.result.backHome}</Link>
        </Button>
      </div>
    </div>
  );
}
