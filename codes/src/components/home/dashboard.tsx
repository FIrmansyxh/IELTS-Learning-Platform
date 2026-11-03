'use client';

import { useMe } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { ResumeSection } from './resume-card';

/**
 * Dashboard `/` (SPEC-007): sapaan, ResumeCard PALING ATAS, lalu slot kartu lain yang diisi
 * SPEC-016 (poin/streak) dan SPEC-017 (radar, riwayat).
 */
export function Dashboard() {
  const me = useMe();
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">
        {me.data ? fmt(id.home.greeting, { name: me.data.display_name }) : id.home.title}
      </h1>
      <ResumeSection />
      <div id="dashboard-slots" data-slot="dashboard-slots" className="grid gap-4 md:grid-cols-2" />
    </div>
  );
}
