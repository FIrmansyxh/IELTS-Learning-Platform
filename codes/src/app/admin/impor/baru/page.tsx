import type { Metadata } from 'next';
import { ImportWizard } from '@/components/admin/import/import-wizard';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.importer.title };

export default function Page() {
  return <ImportWizard batchId={null} />;
}
