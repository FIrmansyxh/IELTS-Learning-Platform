'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { BandBadge, BandConversionTable, BandResultBlock, formatBand } from '@/components/band/band-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmt, id } from '@/i18n/id';
import { bandApi } from '@/lib/api/band';
import type { BossResult, BossResultSection } from '@/lib/api/boss-contract';
import { formatScorePercent, formatTimeWib } from '@/lib/format';
import { cn } from '@/lib/utils';
import { skillName } from './section-screens';

/** Status polling hasil AI yang dikelola pemuat hasil (GET /result tiap 10 detik, maks 10 menit). */
export type AiPoll = { timedOut: boolean; checking: boolean; onCheckAgain: () => void };

const BAND_TABLES_KEY = ['band-tables-active'] as const;

function ObjectiveCard({ section, boss }: { section: BossResultSection; boss: BossResult }) {
  const isListening = section.skill === 'LISTENING';
  const tables = useQuery({
    queryKey: BAND_TABLES_KEY,
    queryFn: ({ signal }) => bandApi.active(signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const complete = section.raw_score !== null && section.max_score !== null && section.raw_40 !== null && section.band !== null;
  const table = tables.data ? (isListening ? tables.data.listening : tables.data.reading_academic) : null;
  const usedId = isListening ? boss.band_table_ids.listening : boss.band_table_ids.reading_academic;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">{skillName(section.skill)}</h3>
        <Badge variant="secondary">
          <ShieldCheck aria-hidden="true" />
          {id.boss.result.decides}
        </Badge>
      </div>
      {complete ? (
        <>
          <p className="text-sm tabular-nums">
            {fmt(id.boss.result.rawToBand, {
              raw: section.raw_score!,
              max: section.max_score!,
              raw40: section.raw_40!,
              band: formatBand(section.band!),
            })}
          </p>
          <BandBadge band={section.band!} />
          {table ? (
            table.table_id === usedId ? (
              <details className="rounded-md border p-2 text-sm">
                <summary className="min-h-8 cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {id.boss.result.tableToggle}
                </summary>
                <div className="pt-2">
                  <BandConversionTable rows={table.rows} achievedRaw={section.raw_40!} versionLabel={table.version_label} />
                </div>
              </details>
            ) : (
              <p className="text-xs text-muted-foreground">{id.boss.result.tableOutdated}</p>
            )
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{id.boss.result.notDone}</p>
      )}
    </div>
  );
}

/**
 * F-14-08/09: tautan umpan balik menunjuk submission sumber band (`graded_submission_id`), lalu submission terbaru
 * (`latest_submission_id`). Bila kedua field aditif belum ada, jatuh ke elemen terakhir `submission_ids` (urut naik).
 */
export function feedbackSubmissionId(section: BossResultSection): string | null {
  if (section.graded_submission_id) return section.graded_submission_id;
  if (section.latest_submission_id) return section.latest_submission_id;
  return section.submission_ids.length > 0 ? section.submission_ids[section.submission_ids.length - 1]! : null;
}

/**
 * Keadaan kartu masukan W/S. `ai_status` (bila ada) membedakan "menunggu AI" dari "tanpa band"; tanpa field itu
 * dipakai heuristik lama (`pending_ai` > 0).
 */
export function advisoryState(section: BossResultSection, pendingAi: number): 'band' | 'pending' | 'no_band' | 'not_done' {
  if (section.band !== null) return 'band';
  const status = section.ai_status ?? null;
  if (status === 'PENDING') return 'pending';
  if (status === 'NO_BAND') return 'no_band';
  if (status === 'NOT_SUBMITTED') return 'not_done';
  if (status === 'GRADED') return 'no_band';
  if (section.submission_ids.length > 0) return pendingAi > 0 ? 'pending' : 'no_band';
  return 'not_done';
}

function AdvisoryCard({ section, pendingAi }: { section: BossResultSection; pendingAi: number }) {
  const sid = feedbackSubmissionId(section);
  const state = advisoryState(section, pendingAi);
  return (
    <div className="grid min-h-[7rem] content-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">{skillName(section.skill)}</h3>
        <Badge variant="outline">{id.boss.result.advisory}</Badge>
      </div>
      {state === 'band' ? (
        <BandBadge band={section.band!} />
      ) : state === 'pending' ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {id.boss.result.awaitingAi}
        </p>
      ) : state === 'no_band' ? (
        <p className="text-sm text-muted-foreground">{id.boss.result.noAiBand}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{id.boss.result.notDone}</p>
      )}
      {sid ? (
        <Link href={`/riwayat/penilaian/${sid}`} className="w-fit text-sm font-medium text-primary underline underline-offset-2">
          {id.boss.result.viewFeedback}
        </Link>
      ) : null}
    </div>
  );
}

function weakestObjective(boss: BossResult): BossResultSection | null {
  let weakest: BossResultSection | null = null;
  for (const s of boss.sections) {
    if (!s.counts_toward_gate || s.band === null) continue;
    if (weakest === null || s.band < weakest.band!) weakest = s;
  }
  return weakest;
}

/**
 * Hasil Boss Stage (SPEC-014). Kelulusan hanya dari Listening + Reading (server); Writing/Speaking tampil sebagai
 * masukan dan terisi otomatis saat penilaian AI selesai (tinggi kartu tetap, tanpa layout shift).
 */
export function BossResultView({ boss, poll }: { boss: BossResult; poll?: AiPoll }) {
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const gateText =
    boss.gate.type === 'BAND'
      ? fmt(id.boss.result.gateBand, { target: formatBand(boss.gate.value), band: formatBand(boss.boss_band) })
      : fmt(id.boss.result.gatePercent, { target: formatScorePercent(boss.gate.value), percent: formatScorePercent(boss.percent) });
  const hasAi = boss.sections.some((s) => !s.counts_toward_gate);
  const weakest = !boss.passed ? weakestObjective(boss) : null;
  const nextTier = boss.tier.tier_number + 1;
  const waiting = boss.pending_ai > 0;

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
            {id.boss.result.title}
          </h1>
          <p className="text-sm text-muted-foreground">{fmt(id.boss.result.tierLabel, { n: boss.tier.tier_number })}</p>
        </div>
        <BandResultBlock>
          <BandBadge band={boss.boss_band} size="lg" />
        </BandResultBlock>
        <p
          role="status"
          className={cn('flex items-center gap-2 text-lg font-bold', boss.passed ? 'text-[var(--color-done-text)]' : 'text-[var(--color-accent-text)]')}
        >
          {boss.passed ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <XCircle className="size-5" aria-hidden="true" />}
          {boss.passed ? id.boss.result.passed : id.boss.result.failed}
        </p>
        <p className="text-sm font-medium">{gateText}</p>

        {boss.passed ? (
          <div className="grid gap-1 text-sm">
            {boss.unlocked.length > 0 ? (
              <p>{fmt(id.boss.result.unlocked, { list: boss.unlocked.map((u) => u.label).join(', ') })}</p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-1 text-sm">
            <p>{id.boss.result.supportive}</p>
            {weakest ? (
              <p className="font-medium">{fmt(id.boss.result.weakest, { skill: skillName(weakest.skill), band: formatBand(weakest.band!) })}</p>
            ) : null}
            {boss.retry.next_allowed_at ? (
              <p className="font-medium">{fmt(id.exam.result.retryAt, { time: formatTimeWib(boss.retry.next_allowed_at) })}</p>
            ) : null}
            <p className="text-muted-foreground">{fmt(id.exam.result.attemptsLeft, { n: boss.retry.attempts_remaining_today })}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/peta">
              {boss.passed && boss.next_tier_unlocked ? fmt(id.boss.result.openTier, { n: nextTier }) : boss.passed ? id.exam.result.openMap : id.exam.intro.backToMap}
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="boss-skills" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="boss-skills" className="text-sm font-semibold">
          {id.boss.result.skillsTitle}
        </h2>
        <ul className="grid gap-4">
          {boss.sections.map((s) => (
            <li key={s.skill} className="rounded-lg border p-3" data-testid={`boss-skill-${s.skill}`}>
              {s.counts_toward_gate ? <ObjectiveCard section={s} boss={boss} /> : <AdvisoryCard section={s} pendingAi={boss.pending_ai} />}
            </li>
          ))}
        </ul>
      </section>

      {hasAi ? (
        <section aria-labelledby="boss-overall" className="grid min-h-[6rem] content-start gap-2 rounded-xl border bg-card p-4 sm:p-5">
          <h2 id="boss-overall" className="text-sm font-semibold">
            {id.boss.result.overallTitle}
          </h2>
          {boss.overall_band_estimate !== null ? (
            <div data-testid="overall-estimate">
              <BandBadge band={boss.overall_band_estimate} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="overall-empty">
              {waiting ? id.boss.result.overallPending : id.boss.result.overallUnavailable}
            </p>
          )}
          {waiting && poll && !poll.timedOut ? (
            <p role="status" className="text-xs text-muted-foreground">
              {id.boss.result.pollNote}
            </p>
          ) : null}
          {waiting && poll?.timedOut ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="status" className="text-sm text-muted-foreground">
                {id.boss.result.pollTimedOut}
              </p>
              <Button variant="outline" size="sm" loading={poll.checking} onClick={poll.onCheckAgain}>
                {id.boss.result.checkAgain}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
