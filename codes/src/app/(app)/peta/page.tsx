import type { Metadata } from 'next';
import { SkillTreeView } from '@/components/skill-tree/skill-tree-view';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.tree.title };

export default function MapPage() {
  return <SkillTreeView />;
}
