import type { Metadata } from 'next';
import { ExamIntro } from '@/components/exam/exam-intro';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.exam.intro.start };

export default async function ExamIntroPage({ params }: { params: Promise<{ assessment_set_id: string }> }) {
  const { assessment_set_id: setId } = await params;
  return (
    <main id="main" className="min-h-dvh bg-background px-4 py-8">
      <ExamIntro assessmentSetId={setId} />
    </main>
  );
}
