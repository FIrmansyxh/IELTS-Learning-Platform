import type { Metadata } from 'next';
import { SubmissionHistory } from '@/components/ai/submission-history';
import { HistoryTabs } from '@/components/history/history-tabs';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.ai.history.title };

export default function AssessmentHistoryPage() {
  return (
    <div>
      <HistoryTabs current="penilaian" />
      <SubmissionHistory />
    </div>
  );
}
