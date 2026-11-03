import type { Metadata } from 'next';
import { ImportWizard } from '@/components/admin/import/import-wizard';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.importer.title };

export default async function Page({ params }: { params: Promise<{ batch_id: string }> }) {
  const { batch_id } = await params;
  return <ImportWizard batchId={batch_id} />;
}
