import type { Metadata } from 'next';
import { CheckpointSession } from '@/components/tracks/checkpoint-session';

export const metadata: Metadata = {
  title: 'Sesi Checkpoint',
};

export default async function CheckpointPage({ params }: { params: Promise<{ attempt_id: string }> }) {
  const { attempt_id } = await params;
  return (
    <div className="container py-6">
      <CheckpointSession attemptId={attempt_id} />
    </div>
  );
}
