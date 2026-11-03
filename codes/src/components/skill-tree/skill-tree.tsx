'use client';

import * as React from 'react';
import type { CurriculumTree } from '@/contracts/curriculum';
import { id } from '@/i18n/id';
import { DetailPanel } from './detail-panel';
import { TierSection } from './tier-section';
import type { Selection } from './sub-module-node';

/** Sub-modul pertama (urutan dokumen) yang `IN_PROGRESS`, jika tidak ada yang `UNLOCKED`. */
export function findActiveNodeId(tree: CurriculumTree): string | null {
  let firstUnlocked: string | null = null;
  for (const tier of tree.tiers) {
    for (const mod of tier.modules) {
      for (const sm of mod.sub_modules) {
        if (sm.content_state !== 'AVAILABLE') continue;
        if (sm.status === 'IN_PROGRESS') return sm.id;
        if (sm.status === 'UNLOCKED' && !firstUnlocked) firstUnlocked = sm.id;
      }
    }
  }
  return firstUnlocked;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : true;
}

export function SkillTree({ tree }: { tree: CurriculumTree }) {
  const activeId = React.useMemo(() => findActiveNodeId(tree), [tree]);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const selectedId = selection?.node.id ?? activeId;

  // Auto-scroll ke node aktif saat peta dibuka.
  const scrolled = React.useRef(false);
  React.useEffect(() => {
    if (scrolled.current || !activeId) return;
    scrolled.current = true;
    const el = document.querySelector<HTMLElement>('[data-active-node="true"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [activeId]);

  const defaultSelection = React.useMemo<Selection | null>(() => {
    if (!activeId) return null;
    for (const tier of tree.tiers)
      for (const mod of tier.modules)
        for (const node of mod.sub_modules) if (node.id === activeId) return { node, module: mod, tier };
    return null;
  }, [tree, activeId]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ol aria-label={id.tree.title} className="grid gap-8">
        {tree.tiers.map((tier) => (
          <TierSection
            key={tier.id}
            tier={tier}
            activeId={activeId}
            selectedId={selectedId}
            onSelect={setSelection}
          />
        ))}
      </ol>
      <div>
        <DetailPanel selection={selection ?? defaultSelection} />
      </div>
    </div>
  );
}
