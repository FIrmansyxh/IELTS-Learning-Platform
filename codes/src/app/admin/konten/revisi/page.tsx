import type { Metadata } from 'next';
import { RevisionsPanel } from '@/components/admin/curation/revisions-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.adminCuration.revisionsTitle };

export default function Page() {
  return <RevisionsPanel />;
}

