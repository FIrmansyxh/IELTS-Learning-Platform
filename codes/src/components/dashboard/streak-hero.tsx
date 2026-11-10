'use client';

import { Flame, Sparkles, CheckCircle2, Circle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StreakHeroData {
  streakDays: number;
  longestStreak: number;
  totalPoints: number;
  dailyTargetDone: boolean;
  streakAtRisk: boolean;
}

/** Strip hero: streak, target harian (1 sesi), total poin. */
export function StreakHero({
  data,
  loading = false,
  className,
}: {
  data: StreakHeroData | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading || !data) {
    return <Skeleton className={cn('h-44 rounded-2xl', className)} role="status" aria-label="Memuat" />;
  }
  return (
    <Card data-testid="dash-streak" className={cn('justify-between gap-3 rounded-2xl p-5', className)}>
      <div className="flex items-center gap-3">
        <Flame className="size-9 text-accent-foreground" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
        <div>
          <p className="text-3xl font-bold leading-none tabular-nums" data-testid="dash-streak-days">
            {data.streakDays} hari
          </p>
          <p className="text-xs text-muted-foreground">Rekor {data.longestStreak} hari</p>
        </div>
      </div>
      <p className="flex items-center gap-2 text-sm font-medium" data-testid="dash-daily-target">
        {data.dailyTargetDone ? (
          <CheckCircle2 className="size-4 text-[var(--color-success,#16a34a)]" aria-hidden="true" />
        ) : (
          <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
        )}
        {data.dailyTargetDone
          ? 'Target harian tercapai'
          : data.streakAtRisk
            ? 'Belajar hari ini agar streak tidak putus'
            : 'Target harian: 1 sesi belajar'}
      </p>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
        <span className="tabular-nums">{data.totalPoints.toLocaleString('id-ID')}</span> poin
      </p>
    </Card>
  );
}
