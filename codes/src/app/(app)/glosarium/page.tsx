import type { Metadata } from 'next';
import { GlossaryView } from '@/components/glossary/glossary-view';

export const metadata: Metadata = { title: 'Glosarium' };

export default function GlossaryPage() {
  return <GlossaryView />;
}
