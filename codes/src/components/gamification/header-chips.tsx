'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Flame, Sparkles } from 'lucide-react';
import { useGamificationStats } from '@/hooks/use-gamification';
import { PointsHistorySheet } from './points-history-sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';

export function HeaderChips() {
  const pathname = usePathname();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const { data: stats, isLoading, isError } = useGamificationStats();

  // Sembunyikan pada mode ujian (/ujian/...)
  if (pathname.startsWith('/ujian')) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2" data-testid="header-chips-loading">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
    );
  }

  if (isError || !stats) {
    // Non-kritis: sembunyikan jika galat
    return null;
  }

  const ariaLabel = fmt(id.gamification.streakHeaderAria, {
    days: stats.daily_streak_days,
    points: stats.total_points,
  });

  return (
    <>
      <div
        className="flex items-center gap-1.5 sm:gap-2"
        aria-label={ariaLabel}
        data-testid="header-chips"
      >
        {/* Streak Chip */}
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50/70 px-2.5 py-1 text-xs font-semibold text-orange-700 shadow-2xs transition-colors hover:bg-orange-100 dark:border-orange-950 dark:bg-orange-950/30 dark:text-orange-400 dark:hover:bg-orange-950/50"
          aria-label={fmt(id.gamification.streakAria, { n: stats.daily_streak_days })}
          data-testid="chip-streak"
        >
          <Flame className="size-3.5 text-orange-500 fill-orange-500" aria-hidden="true" />
          <span className="tabular-nums">{stats.daily_streak_days}</span>
        </button>

        {/* Points Chip */}
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-xs font-semibold text-amber-700 shadow-2xs transition-colors hover:bg-amber-100 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50"
          aria-label={fmt(id.gamification.pointsAria, { n: stats.total_points })}
          data-testid="chip-points"
        >
          <Sparkles className="size-3.5 text-amber-500 fill-amber-400" aria-hidden="true" />
          <span className="tabular-nums">{stats.total_points.toLocaleString('id-ID')}</span>
        </button>
      </div>

      <PointsHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}

