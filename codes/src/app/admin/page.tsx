import type { Metadata } from 'next';
import { HealthOverview } from '@/components/admin/health-cards';
import { LicenseBanner } from '@/components/admin/license-banner';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.admin.health.title };

export default function Page() {
  return (
    <div className="grid gap-6">
      <LicenseBanner />
      <HealthOverview />
    </div>
  );
}
