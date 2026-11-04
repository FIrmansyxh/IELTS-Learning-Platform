import type { Metadata } from 'next';
import { ExamHistory } from '@/components/history/exam-history';
import { HistoryTabs } from '@/components/history/history-tabs';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.history.exam.title };

export default function ExamHistoryPage() {
  return (
    <div>
      <HistoryTabs current="ujian" />
      <ExamHistory />
    </div>
  );
}
