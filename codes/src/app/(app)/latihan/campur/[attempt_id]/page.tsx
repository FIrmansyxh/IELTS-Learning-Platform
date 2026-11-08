import type { Metadata } from 'next';
import { MixSession } from '@/components/mix/mix-session';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.mix.metaTitle };

export default async function MixSessionPage({ params }: { params: Promise<{ attempt_id: string }> }) {
  const { attempt_id: attemptId } = await params;
  return <MixSession attemptId={attemptId} />;
}
