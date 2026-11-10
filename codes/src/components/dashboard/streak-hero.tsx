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

/** Kartu ringkas: streak, target harian (1 sesi), total poin. Tinggi mengikuti isi. */
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
    return <Skeleton className={cn('h-28 rounded-2xl', className)} role="status" aria-label="Memuat" />;
  }
  return (
    <Card data-testid="dash-streak" className={cn('gap-3 rounded-2xl p-5', className)}>
      <div className="flex items-center gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-xl"
          style={{ background: 'color-mix(in srgb, var(--color-streak) 18%, transparent)' }}
        >
          <Flame className="size-7" style={{ color: 'var(--color-streak)' }} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold leading-none tabular-nums" data-testid="dash-streak-days">
            {data.streakDays} hari
          </p>
          <p className="text-xs text-muted-foreground">Rekor {data.longestStreak} hari</p>
        </div>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4" style={{ color: 'var(--chart-6)' }} aria-hidden="true" />
          <span className="tabular-nums">{data.totalPoints.toLocaleString('id-ID')}</span>
          <span className="font-normal text-muted-foreground">poin</span>
        </p>
      </div>
      <p
        data-testid="dash-daily-target"
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
          data.dailyTargetDone ? 'bg-[color-mix(in_srgb,var(--chart-5)_16%,transparent)]' : 'bg-muted',
        )}
      >
        {data.dailyTargetDone ? (
          <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--chart-5)' }} aria-hidden="true" />
        ) : (
          <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        {data.dailyTargetDone
          ? 'Target harian tercapai'
          : data.streakAtRisk
            ? 'Belajar hari ini agar streak tidak putus'
            : 'Target harian: 1 sesi belajar'}
      </p>
    </Card>
  );
}
