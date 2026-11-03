import type { Metadata } from 'next';
import { BandPanel } from '@/components/admin/band-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.band.admin.title };

export default function Page() {
  return <BandPanel />;
}
