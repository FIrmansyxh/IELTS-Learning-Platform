import type { Metadata } from 'next';
import { ExamRunner } from '@/components/exam/exam-runner';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.exam.result.genericTitle };

export default async function ExamRunPage({ params }: { params: Promise<{ attempt_id: string }> }) {
  const { attempt_id: attemptId } = await params;
  return <ExamRunner attemptId={attemptId} />;
}
