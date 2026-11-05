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
    if (activeId) {
      for (const tier of tree.tiers) {
        for (const mod of tier.modules) {
          for (const node of mod.sub_modules) {
            if (node.id === activeId) return { node, module: mod, tier };
          }
        }
      }
    }
    // Fallback bila belum ada node berstatus IN_PROGRESS/UNLOCKED:
    for (const tier of tree.tiers) {
      for (const mod of tier.modules) {
        if (mod.sub_modules.length > 0) {
          return { node: mod.sub_modules[0], module: mod, tier };
        }
      }
    }
    return null;
  }, [tree, activeId]);

  const activeTier = React.useMemo(() => {
    return tree.tiers.find((t) => t.status === 'IN_PROGRESS') ?? tree.tiers[0];
  }, [tree]);

  const treeStats = React.useMemo(() => {
    let totalModules = 0;
    let totalSubModules = 0;
    let completedCount = 0;
    for (const tier of tree.tiers) {
      totalModules += tier.modules.length;
      for (const mod of tier.modules) {
        totalSubModules += mod.sub_modules.length;
        for (const sm of mod.sub_modules) {
          if (sm.status === 'COMPLETED' || sm.status === 'SKIPPED') completedCount++;
        }
      }
    }
    return { totalModules, totalSubModules, completedCount };
  }, [tree]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
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
      <div className="hidden lg:block">
        <div className="sticky top-6 grid gap-4">
          <DetailPanel selection={selection ?? defaultSelection} />

          {activeTier && (
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <h3 className="mb-2.5 text-sm font-semibold text-foreground">
                Ringkasan Progres Belajar
              </h3>
              <div className="grid gap-2 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Tier Aktif</span>
                  <span className="font-medium text-foreground">
                    Tier {activeTier.tier_number}: {activeTier.title}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Target Band</span>
                  <span className="font-medium text-foreground">
                    {activeTier.target_band_min.toFixed(1)} – {activeTier.target_band_max.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>CEFR Level</span>
                  <span className="font-medium text-foreground">{activeTier.cefr_level}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Sub-modul Diselesaikan</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {treeStats.completedCount} / {treeStats.totalSubModules}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-card p-4 shadow-sm text-xs">
            <h3 className="mb-2.5 text-sm font-semibold text-foreground">Panduan Simbol & Status</h3>
            <ul className="grid gap-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-muted text-xs">🔒</span>
                <span><strong className="text-foreground">Terkunci:</strong> Selesaikan materi dan latihan prasyarat</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-xs text-primary">⚡</span>
                <span><strong className="text-foreground">Tersedia / Aktif:</strong> Siap dipelajari dan dikerjakan</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-xs text-emerald-500">✓</span>
                <span><strong className="text-foreground">Selesai:</strong> Lulus latihan (dapat diulang)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-amber-500/10 text-xs text-amber-500">👑</span>
                <span><strong className="text-foreground">Mahkota:</strong> Capai skor latihan 80%+</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-indigo-500/10 text-xs text-indigo-500">⚔️</span>
                <span><strong className="text-foreground">Boss Stage:</strong> Ujian gerbang kenaikan Tier</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
