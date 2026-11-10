'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMe } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { placementApi } from '@/lib/api/placement';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGamificationStats } from '@/hooks/use-gamification';
import { useExamHistory, useRadarData } from '@/hooks/use-skills';
import { curriculumApi } from '@/lib/api/curriculum';
import {
  buildCrownCollection,
  buildTargetBandState,
  buildTierProgress,
  isDailyTargetDone,
} from '@/lib/dashboard';
import { StatsCard } from '@/components/gamification/stats-card';
import { PointsHistorySheet } from '@/components/gamification/points-history-sheet';
import { ResumeLearningCard } from '@/components/dashboard/resume-learning-card';
import { StreakHero } from '@/components/dashboard/streak-hero';
import { TargetBandCard } from '@/components/dashboard/target-band-card';
import { RadarCompetencyCard } from '@/components/dashboard/radar-competency-card';
import { TierProgressCard } from '@/components/dashboard/tier-progress-card';
import { CrownCollectionGrid } from '@/components/dashboard/crown-collection-grid';
import { RecentExamHistory } from '@/components/dashboard/recent-exam-history';

/**
 * Dashboard `/` (SPEC-007, C-15): bento grid action-first. Baris atas: Lanjutkan Belajar (aksi utama) + streak/target
 * harian + Target Band; lalu radar, progres tier, mahkota, statistik, dan ujian terakhir.
 */
export function Dashboard() {
  const me = useMe();
  const placementQ = useQuery({
    queryKey: ['placement-status'],
    queryFn: ({ signal }) => placementApi.status(signal),
    staleTime: 60000,
  });

  const pending = placementQ.data?.pending_result;
  const statsQ = useGamificationStats();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const radarQ = useRadarData();
  const historyQ = useExamHistory({ page: 1, page_size: 10 });
  const treeQ = useQuery({
    queryKey: ['curriculum-tree', 'dashboard'],
    queryFn: ({ signal }) => curriculumApi.tree(signal),
    staleTime: 30000,
  });
  const tiers = treeQ.data?.tiers ?? null;
  const predicted = radarQ.data ? (radarQ.data.prediction.overall_band ?? radarQ.data.prediction.indicative_band) : null;

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">
        {me.data ? fmt(id.home.greeting, { name: me.data.display_name }) : id.home.title}
      </h1>

      {/* Card Hasil Placement Menunggu (jika ada) */}
      {pending && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>{id.placement.pendingResultCardTitle}</CardTitle>
            <CardDescription>{id.placement.pendingResultCardBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg">
              <Link href={`/ujian/${pending.attempt_id}/hasil`}>
                {id.placement.viewResultBtn}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div id="dashboard-slots" data-slot="dashboard-slots" className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <ResumeLearningCard
          placementAvailable={Boolean(placementQ.data?.available)}
          className="md:col-span-2 xl:col-span-2"
        />
        <StreakHero
          loading={statsQ.isPending}
          data={
            statsQ.data
              ? {
                  streakDays: statsQ.data.daily_streak_days,
                  longestStreak: statsQ.data.longest_daily_streak,
                  totalPoints: statsQ.data.total_points,
                  dailyTargetDone: isDailyTargetDone(statsQ.data.last_active_date),
                  streakAtRisk: statsQ.data.streak_at_risk,
                }
              : null
          }
          className="xl:col-span-2 md:col-span-1"
        />
        <TargetBandCard
          loading={radarQ.isPending}
          state={radarQ.data ? buildTargetBandState(radarQ.data.target_band, predicted) : { kind: 'NO_TARGET' }}
          className="xl:col-span-2 md:col-span-1"
        />
        <RadarCompetencyCard className="md:col-span-2 xl:col-span-3" />
        <TierProgressCard
          loading={treeQ.isPending}
          tiers={tiers ? buildTierProgress(tiers) : null}
          className="md:col-span-2 xl:col-span-3"
        />
        <CrownCollectionGrid
          loading={treeQ.isPending}
          collection={tiers ? buildCrownCollection(tiers) : null}
          className="md:col-span-2 xl:col-span-3"
        />
        <RecentExamHistory
          loading={historyQ.isPending}
          items={historyQ.data?.data ?? null}
          className="md:col-span-2 xl:col-span-3"
        />
        {statsQ.data && (
          <StatsCard
            stats={statsQ.data}
            onOpenHistory={() => setHistoryOpen(true)}
            className="md:col-span-2 xl:col-span-6"
          />
        )}
      </div>
      <PointsHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
