import type { Metadata } from 'next';
import { MixBuilder } from '@/components/mix/mix-builder';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.mix.metaTitle };

export default function MixBuilderPage() {
  return <MixBuilder />;
}
