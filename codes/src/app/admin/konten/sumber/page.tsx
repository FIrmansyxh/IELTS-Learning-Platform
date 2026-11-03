import type { Metadata } from 'next';
import { SourcesPanel } from '@/components/admin/sources-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.assets.sourcesTitle };

export default function Page() {
  return <SourcesPanel />;
}
