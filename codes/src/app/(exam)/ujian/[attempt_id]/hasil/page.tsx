import type { Metadata } from 'next';
import { ExamResult } from '@/components/exam/exam-result';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.exam.result.genericTitle };

export default async function ExamResultPage({ params }: { params: Promise<{ attempt_id: string }> }) {
  const { attempt_id: attemptId } = await params;
  return (
    <main id="main" className="min-h-dvh bg-background px-4 py-8">
      <ExamResult attemptId={attemptId} />
    </main>
  );
}
