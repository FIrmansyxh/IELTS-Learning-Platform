'use client';

import { StatsCard } from '@/components/gamification/stats-card';
import { RadarCard } from '@/components/radar/radar-card';
import { useMe } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { PlacementStatusCard, placementStartHref, usePlacementStatus } from './placement-entry';
import { ResumeSection } from './resume-card';

/**
 * Dashboard `/` (SPEC-007): sapaan, ResumeCard PALING ATAS, lalu slot kartu lain yang diisi
 * SPEC-016 (StatsCard poin/streak) dan SPEC-017 (RadarCard + prediksi band).
 */
export function Dashboard() {
  const me = useMe();
  const placement = usePlacementStatus();
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">
        {me.data ? fmt(id.home.greeting, { name: me.data.display_name }) : id.home.title}
      </h1>
      <PlacementStatusCard status={placement.data} />
      <ResumeSection placementHref={placementStartHref(placement.data)} />
      <div id="dashboard-slots" data-slot="dashboard-slots" className="grid gap-4 md:grid-cols-2">
        <StatsCard />
        <RadarCard />
      </div>
    </div>
  );
}
