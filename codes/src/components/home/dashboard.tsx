'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
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

type TimeKey = keyof typeof id.home.timeGreeting;

function timeKey(hour: number): TimeKey {
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'day';
  if (hour >= 15 && hour < 19) return 'afternoon';
  return 'night';
}

/** Sapaan sesuai jam lokal; dihitung setelah mount agar tidak berbeda dengan HTML server. */
function useTimeGreeting(): string | null {
  const [greeting, setGreeting] = React.useState<string | null>(null);
  React.useEffect(() => {
    setGreeting(id.home.timeGreeting[timeKey(new Date().getHours())]);
  }, []);
  return greeting;
}

/** Hero sapaan bergradasi (design-system 11.2). */
function Hero({ name }: { name: string | null }) {
  const timeGreeting = useTimeGreeting();
  return (
    <section
      aria-labelledby="home-greeting"
      className="animate-fade-up relative isolate overflow-hidden rounded-[1.25rem] bg-gradient-hero px-6 py-6 text-white shadow-brand sm:px-8 sm:py-7"
    >
      {/* Ornamen dekoratif: cahaya melayang pelan (mati pada reduced-motion). */}
      <span
        aria-hidden="true"
        className="animate-float absolute -top-16 -right-10 -z-10 size-56 rounded-full bg-white/15 blur-2xl motion-reduce:animate-none"
      />
      <span
        aria-hidden="true"
        className="animate-float absolute -bottom-20 left-1/3 -z-10 size-48 rounded-full bg-cyan-300/25 blur-3xl [animation-delay:-4s] motion-reduce:animate-none"
      />
      <p className="flex min-h-5 items-center gap-1.5 text-sm font-medium text-white/90">
        <Sparkles className="size-4" aria-hidden="true" />
        <span>{timeGreeting ?? '\u00a0'}</span>
      </p>
      <h1 id="home-greeting" className="mt-1.5 text-3xl font-extrabold tracking-tight sm:text-4xl">
        {name ? fmt(id.home.greeting, { name }) : id.home.title}
      </h1>
      <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-white/90">{id.home.heroSubtitle}</p>
    </section>
  );
}

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
      <Hero name={me.data?.display_name ?? null} />

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

      {/* Bento: dua kolom yang tingginya mengikuti isi (tanpa meregangkan card). Di bawah xl menjadi satu kolom dengan urutan `order`. */}
      <div id="dashboard-slots" data-slot="dashboard-slots" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="stagger-in contents xl:grid xl:gap-4">
          <ResumeLearningCard
            placementAvailable={Boolean(placementQ.data?.available)}
            className="order-1 xl:order-none"
          />
          <RadarCompetencyCard className="order-4 xl:order-none" />
          {statsQ.data && (
            <StatsCard
              stats={statsQ.data}
              onOpenHistory={() => setHistoryOpen(true)}
              className="order-8 xl:order-none"
            />
          )}
        </div>
        <div className="stagger-in contents xl:grid xl:gap-4">
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
            className="order-2 xl:order-none"
          />
          <TargetBandCard
            loading={radarQ.isPending}
            state={radarQ.data ? buildTargetBandState(radarQ.data.target_band, predicted) : { kind: 'NO_TARGET' }}
            className="order-3 xl:order-none"
          />
          <TierProgressCard
            loading={treeQ.isPending}
            tiers={tiers ? buildTierProgress(tiers) : null}
            className="order-5 xl:order-none"
          />
          <CrownCollectionGrid
            loading={treeQ.isPending}
            collection={tiers ? buildCrownCollection(tiers) : null}
            className="order-6 xl:order-none"
          />
          <RecentExamHistory
            loading={historyQ.isPending}
            items={historyQ.data?.data ?? null}
            className="order-7 xl:order-none"
          />
        </div>
      </div>
      <PointsHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
