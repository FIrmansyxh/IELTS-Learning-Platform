import type { Metadata } from 'next';
import { CurriculumPanel } from '@/components/admin/curation/curriculum-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.curation.curriculum.title };

export default function Page() {
  return <CurriculumPanel />;
}
