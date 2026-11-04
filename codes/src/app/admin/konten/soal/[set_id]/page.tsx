import type { Metadata } from 'next';
import { SetDetail } from '@/components/admin/curation/set-detail';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.curation.sets.title };

export default async function Page({ params }: { params: Promise<{ set_id: string }> }) {
  const { set_id } = await params;
  return <SetDetail setId={set_id} />;
}
