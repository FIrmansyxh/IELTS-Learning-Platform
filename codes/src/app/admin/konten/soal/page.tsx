import type { Metadata } from 'next';
import { SetsPanel } from '@/components/admin/curation/sets-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.curation.sets.title };

export default function Page() {
  return <SetsPanel />;
}
