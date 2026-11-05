import type { Metadata } from 'next';
import { PointsPanel } from '@/components/admin/points-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.admin.points.title };

export default function Page() {
  return <PointsPanel />;
}
