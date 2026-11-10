'use client';

import * as React from 'react';
import { Flame, Sparkles, Zap, Award, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CrownBadge } from './crown-badge';
import type { StatsDTO } from '@/contracts/gamification';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export interface StatsCardProps {
  stats: StatsDTO;
  onOpenHistory?: () => void;
  className?: string;
}

export function StatsCard({ stats, onOpenHistory, className }: StatsCardProps) {
  return (
    <Card className={cn('gap-3 py-5', className)} data-testid="stats-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold">{id.gamification.statsTitle}</CardTitle>
          <CardDescription className="text-xs">
            {stats.streak_at_risk ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {fmt(id.gamification.streakAtRisk, { n: stats.daily_streak_days })}
              </span>
            ) : (
              'Pantau kemajuan belajar harian Anda'
            )}
          </CardDescription>
        </div>
        {onOpenHistory && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenHistory}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="open-points-history-btn"
          >
            <History className="size-3.5" aria-hidden="true" />
            {id.gamification.pointsHistory}
          </Button>
        )}
      </CardHeader>

      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total Poin */}
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-amber-500" aria-hidden="true" />
            <span>{id.gamification.totalPoints}</span>
          </div>
          <p className="text-xl font-bold tabular-nums" data-testid="stats-total-points">
            {stats.total_points.toLocaleString('id-ID')}
          </p>
        </div>

        {/* Streak Harian */}
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Flame className="size-3.5 text-orange-500" aria-hidden="true" />
            <span>{id.gamification.dailyStreak}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-bold tabular-nums" data-testid="stats-daily-streak">
              {stats.daily_streak_days}
            </p>
            <span className="text-xs text-muted-foreground">
              (max: {stats.longest_daily_streak})
            </span>
          </div>
        </div>

        {/* Mahkota */}
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Award className="size-3.5 text-primary" aria-hidden="true" />
            <span>Mahkota</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm font-semibold">
              <CrownBadge crown="GOLD" size={16} showLabel={false} />
              <span data-testid="stats-gold-crowns">{stats.gold_crowns}</span>
            </div>
            <div className="flex items-center gap-1 text-sm font-semibold">
              <CrownBadge crown="SILVER" size={16} showLabel={false} />
              <span data-testid="stats-silver-crowns">{stats.silver_crowns}</span>
            </div>
          </div>
        </div>

        {/* Speed Streak Terbaik */}
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Zap className="size-3.5 text-blue-500" aria-hidden="true" />
            <span>{id.gamification.bestSpeedStreak}</span>
          </div>
          <p className="text-xl font-bold tabular-nums" data-testid="stats-speed-streak">
            {stats.best_speed_streak}x
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

