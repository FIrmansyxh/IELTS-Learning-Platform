'use client';

import { Flame, Sparkles, Trophy, Zap } from 'lucide-react';
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { formatDate } from '@/lib/format';
import type { Stats } from '@/lib/api/gamification-contract';
import { CrownBadge } from './crown-badge';
import { useStats } from './use-stats';

const nf = new Intl.NumberFormat('id-ID');
const t = id.gamification.stats;

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-lg border bg-[var(--color-surface-muted)] p-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-lg font-bold tabular-nums">{children}</dd>
    </div>
  );
}

/** Isi statistik (dipakai di dashboard dan profil). Nada lembut untuk streak yang terancam, tanpa warna merah. */
export function StatsGrid({ stats }: { stats: Stats }) {
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Sparkles className="size-3.5 text-[var(--color-accent-text)]" aria-hidden="true" />} label={t.totalPoints}>
          {nf.format(stats.total_points)}
        </Stat>
        <Stat icon={<Flame className="size-3.5 text-[var(--color-streak)]" aria-hidden="true" />} label={t.streak}>
          {fmt(t.streakDays, { n: stats.daily_streak_days })}
        </Stat>
        <Stat icon={<Trophy className="size-3.5 text-[var(--color-accent-text)]" aria-hidden="true" />} label={t.goldCrowns}>
          <span className="inline-flex items-center gap-1.5">
            <CrownBadge crown="GOLD" showLabel={false} />
            {stats.gold_crowns}
          </span>
        </Stat>
        <Stat icon={<Trophy className="size-3.5 text-muted-foreground" aria-hidden="true" />} label={t.silverCrowns}>
          <span className="inline-flex items-center gap-1.5">
            <CrownBadge crown="SILVER" showLabel={false} />
            {stats.silver_crowns}
          </span>
        </Stat>
      </dl>
      {stats.streak_at_risk ? (
        <p role="note" data-testid="streak-risk" className="rounded-md bg-[var(--color-primary-subtle)] p-3 text-sm">
          {fmt(t.atRisk, { n: stats.daily_streak_days })}
        </p>
      ) : stats.last_active_date === null ? (
        <p className="text-sm text-muted-foreground">{t.noActivity}</p>
      ) : null}
    </div>
  );
}

/** Kartu statistik dashboard (slot SPEC-007). Galat memuat = kartu disembunyikan (non-kritis). */
export function StatsCard() {
  const q = useStats();
  if (q.isError) return null;
  return (
    <Card data-testid="stats-card" aria-labelledby="stats-card-title" className="md:col-span-2">
      <CardHeader>
        <CardTitle id="stats-card-title" className="text-lg">
          {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <div className="grid grid-cols-2 gap-3" role="status" aria-label={id.common.loading}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <StatsGrid stats={q.data} />
        )}
      </CardContent>
    </Card>
  );
}

/** Statistik lengkap untuk profil (semua angka). */
export function ProfileStats({ onOpenHistory }: { onOpenHistory?: React.ReactNode }) {
  const q = useStats();
  if (q.isError) return null;
  return (
    <Card data-testid="profile-stats">
      <CardHeader>
        <CardTitle className="text-lg">{t.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {q.isPending ? (
          <div role="status" aria-label={id.common.loading}>
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <StatsGrid stats={q.data} />
            <dl className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Flame className="size-4" aria-hidden="true" />
                  {t.longest}
                </dt>
                <dd className="font-semibold tabular-nums">{fmt(t.streakDays, { n: q.data.longest_daily_streak })}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="size-4" aria-hidden="true" />
                  {t.bestSpeed}
                </dt>
                <dd className="font-semibold tabular-nums">{fmt(t.speedTimes, { n: q.data.best_speed_streak })}</dd>
              </div>
              {q.data.last_active_date ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{t.lastActive}</dt>
                  <dd className="font-semibold">{formatDate(q.data.last_active_date)}</dd>
                </div>
              ) : null}
            </dl>
            {onOpenHistory}
          </>
        )}
      </CardContent>
    </Card>
  );
}
