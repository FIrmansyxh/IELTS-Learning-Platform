import { BookOpen, CheckCircle2, Headphones, Info, Mic, PenLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt, id } from '@/i18n/id';
import type { BossIntro } from '@/lib/api/boss-contract';
import { formatScorePercent } from '@/lib/format';
import { formatBand } from '@/components/band/band-display';
import { skillName } from './section-screens';

const ICON = { LISTENING: Headphones, READING: BookOpen, WRITING: PenLine, SPEAKING: Mic } as const;

function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/** Blok Boss pada layar pra-ujian (SPEC-014): gerbang, urutan section, total waktu, catatan, percobaan terakhir. */
export function BossIntroBlock({ boss }: { boss: BossIntro }) {
  const gate =
    boss.gate.type === 'BAND'
      ? fmt(id.boss.intro.gateBand, { n: formatBand(boss.gate.value) })
      : fmt(id.boss.intro.gatePercent, { n: formatScorePercent(boss.gate.value) });
  const sections = [...boss.sections].sort((a, b) => a.order - b.order);
  const last = boss.last_result;
  return (
    <div className="grid gap-5" data-testid="boss-intro">
      <p className="flex items-start gap-2 rounded-md border bg-accent p-3 text-sm font-medium">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {gate}
      </p>
      <section aria-labelledby="boss-sections">
        <h2 id="boss-sections" className="mb-2 text-sm font-semibold">
          {id.boss.intro.sectionsTitle}
        </h2>
        <ol className="grid gap-2">
          {sections.map((s) => {
            const Icon = ICON[s.skill];
            return (
              <li key={s.assessment_set_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 font-medium">
                  {s.order}. {skillName(s.skill)}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {fmt(id.boss.intro.sectionMeta, { m: minutes(s.time_limit_seconds), q: s.question_count })}
                  </span>
                </span>
                <Badge variant={s.counts_toward_gate ? 'secondary' : 'outline'}>
                  {s.counts_toward_gate ? id.boss.intro.countsGate : id.boss.intro.advisoryBadge}
                </Badge>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-sm text-muted-foreground">{fmt(id.boss.intro.total, { m: minutes(boss.total_time_limit_seconds) })}</p>
      </section>
      <p className="text-sm text-muted-foreground">{boss.advisory_note}</p>
      {last ? (
        <p className="text-sm" data-testid="boss-last-result">
          {fmt(id.boss.intro.lastResult, {
            status: last.passed ? id.boss.result.passed : id.boss.result.failed,
            percent: formatScorePercent(last.score_percent),
            band: formatBand(last.boss_band),
          })}
        </p>
      ) : null}
    </div>
  );
}

export function AlreadyPassedNote() {
  return (
    <p role="status" className="flex items-center gap-2 font-semibold text-[var(--color-done-text)]">
      <CheckCircle2 className="size-5" aria-hidden="true" />
      {id.boss.intro.alreadyPassed}
    </p>
  );
}
