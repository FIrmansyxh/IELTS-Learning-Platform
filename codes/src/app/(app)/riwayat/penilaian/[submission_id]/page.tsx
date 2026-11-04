import type { Metadata } from 'next';
import { SubmissionDetail } from '@/components/ai/submission-detail';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.ai.history.detailTitle };

export default async function AssessmentDetailPage({ params }: { params: Promise<{ submission_id: string }> }) {
  const { submission_id: submissionId } = await params;
  return <SubmissionDetail submissionId={submissionId} />;
}
