import type { Metadata } from 'next';
import { QuestionsPanel } from '@/components/admin/curation/questions-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.adminCuration.questionsTitle };

export default function Page() {
  return <QuestionsPanel />;
}

