import type { Metadata } from 'next';
import { ImportsPanel } from '@/components/admin/import/imports-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.importer.title };

export default function Page() {
  return <ImportsPanel />;
}
