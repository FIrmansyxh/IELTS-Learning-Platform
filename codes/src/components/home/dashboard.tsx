'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMe } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { placementApi } from '@/lib/api/placement';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ResumeSection } from './resume-card';
import { useGamificationStats } from '@/hooks/use-gamification';
import { StatsCard } from '@/components/gamification/stats-card';
import { PointsHistorySheet } from '@/components/gamification/points-history-sheet';
import { RadarCard } from '@/components/radar/radar-card';

/**
 * Dashboard `/` (SPEC-007): sapaan, ResumeCard PALING ATAS, lalu slot kartu lain yang diisi
 * SPEC-016 (poin/streak) dan SPEC-017 (radar, riwayat).
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

      <ResumeSection placementAvailable={Boolean(placementQ.data?.available)} />
      <div id="dashboard-slots" data-slot="dashboard-slots" className="grid gap-4 md:grid-cols-2">
        {statsQ.data && (
          <StatsCard
            stats={statsQ.data}
            onOpenHistory={() => setHistoryOpen(true)}
            className="md:col-span-2"
          />
        )}
        <RadarCard className="md:col-span-2" />
      </div>
      <PointsHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
