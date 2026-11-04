'use client';

import { Flame, Sparkles, Zap } from 'lucide-react';
import { fmt, id } from '@/i18n/id';
import { GamificationBlockSchema, type GamificationBlock } from '@/lib/api/gamification-contract';
import { ConfettiBurst } from './confetti';
import { CrownBadge } from './crown-badge';

const t = id.gamification.result;

/** Blok `gamification` opsional pada hasil attempt; bentuk tak dikenal diabaikan (hadiah tambahan, bukan hasil utama). */
export function parseGamification(raw: unknown): GamificationBlock | null {
  if (raw == null) return null;
  const p = GamificationBlockSchema.safeParse(raw);
  return p.success ? p.data : null;
}

function crownName(c: 'NONE' | 'SILVER' | 'GOLD'): string {
  return c === 'GOLD' ? id.tree.crownGold : c === 'SILVER' ? id.tree.crownSilver : id.gamification.crown.none;
}

/** Ringkasan hadiah hasil Drill: mahkota (animasi hemat), chip poin dengan rincian, speed streak, streak harian. */
export function GamificationResult({ block, scorePercent }: { block: GamificationBlock; scorePercent?: number }) {
  const { points, crown } = block;
  const gained = crown?.changed === true && crown.current !== 'NONE';
  const gold = gained && crown?.current === 'GOLD';
  const rows: Array<[string, number]> = [
    [t.drill, points.drill],
    [t.speed, points.speed_streak],
    [t.crown, points.crown],
    [t.boss, points.boss],
    [t.daily, points.daily],
  ];
  const visible = rows.filter(([, n]) => n > 0);
  return (
    <section aria-labelledby="gami-title" data-testid="gamification-result" className="relative grid gap-3 overflow-hidden rounded-xl border bg-card p-4 sm:p-5">
      {gold ? <ConfettiBurst /> : null}
      <h3 id="gami-title" className="text-sm font-semibold text-muted-foreground">
        {t.title}
      </h3>
      {gained && crown ? (
        <div className="grid justify-items-start gap-1" data-testid="crown-gain">
          <CrownBadge crown={crown.current} size="lg" celebrate scorePercent={scorePercent !== undefined ? Math.round(scorePercent) : undefined} />
          <p className="text-sm font-medium">
            {crown.previous === 'NONE'
              ? fmt(t.crownGained, { name: crownName(crown.current) })
              : fmt(t.crownUpgraded, { from: crownName(crown.previous), to: crownName(crown.current) })}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {points.total > 0 ? (
          <span
            role="status"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--color-primary-subtle)] px-3 text-sm font-bold tabular-nums text-[var(--color-accent-text)]"
          >
            <Sparkles className="size-4 fill-[var(--color-accent)] stroke-[var(--color-accent)]" aria-hidden="true" />
            <span>{fmt(t.pointsChip, { n: points.total })}</span>
          </span>
        ) : (
          <p className="text-sm text-muted-foreground">{t.noPoints}</p>
        )}
        {block.daily_streak_days > 0 ? (
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold">
            <Flame className="size-4 fill-[var(--color-streak)] stroke-[var(--color-streak)]" aria-hidden="true" />
            {fmt(t.dailyStreak, { n: block.daily_streak_days })}
          </span>
        ) : null}
      </div>
      {visible.length > 0 ? (
        <details className="rounded-md border p-2 text-sm">
          <summary className="min-h-8 cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.breakdown}</summary>
          <dl className="grid gap-1 pt-2">
            {visible.map(([label, n]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">+{n}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t pt-1">
              <dt>{t.total}</dt>
              <dd className="font-bold tabular-nums">+{points.total}</dd>
            </div>
          </dl>
        </details>
      ) : null}
      {block.best_speed_streak >= 2 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Zap className="size-4 text-[var(--color-streak)]" aria-hidden="true" />
          {fmt(t.bestSpeed, { n: block.best_speed_streak })}
        </p>
      ) : null}
    </section>
  );
}

/** Boss Stage (Mode Ujian, tenang): hanya satu baris poin Boss bila ada; tanpa animasi. */
export function BossPointsNote({ raw }: { raw: unknown }) {
  const block = parseGamification(raw);
  if (!block || block.points.boss <= 0) return null;
  return (
    <p role="status" data-testid="boss-points" className="mx-auto flex w-full max-w-2xl items-center gap-2 text-sm font-medium text-[var(--color-accent-text)]">
      <Sparkles className="size-4" aria-hidden="true" />
      {fmt(t.pointsChip, { n: block.points.boss })} · {t.boss}
    </p>
  );
}
