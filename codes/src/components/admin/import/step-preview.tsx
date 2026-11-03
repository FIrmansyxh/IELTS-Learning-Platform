'use client';

import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Batch, ImportItem } from '@/contracts/import';
import { fmt, id } from '@/i18n/id';
import { importsApi } from '@/lib/api/imports';
import { ItemPreviewSheet } from './item-preview-sheet';
import { ActionBadge } from './status-badge';

const t = id.importer.preview;

type Node = { module: ImportItem | null; subs: ImportItem[] };
export type PreviewTree = { tiers: Array<{ tier: string; modules: Array<[string, Node]> }>; other: ImportItem[] };

/** Pohon Tier > Modul > Sub-Modul dari kode entitas (`2.1`, `2.1.3`); sisanya (set, soal) dikelompokkan terpisah. */
export function buildTree(items: readonly ImportItem[]): PreviewTree {
  const byTier = new Map<string, Map<string, Node>>();
  const other: ImportItem[] = [];
  for (const it of items) {
    const code = it.entity_code ?? '';
    const parts = code.split('.');
    const treeable =
      (it.entity_kind === 'MODULE' && parts.length === 2) || (it.entity_kind === 'SUB_MODULE' && parts.length === 3);
    if (treeable && /^[1-4]$/.test(parts[0] ?? '') && parts.every((p) => /^\d{1,2}$/.test(p))) {
      const [tier, mod] = parts as [string, string];
      const moduleCode = `${tier}.${mod}`;
      const modules = byTier.get(tier) ?? new Map<string, Node>();
      const node = modules.get(moduleCode) ?? { module: null, subs: [] };
      if (it.entity_kind === 'MODULE') node.module = it;
      else node.subs.push(it);
      modules.set(moduleCode, node);
      byTier.set(tier, modules);
    } else {
      other.push(it);
    }
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
  const tiers = [...byTier.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([tier, mods]) => ({ tier, modules: [...mods.entries()].sort(([a], [b]) => cmp(a, b)) }));
  return { tiers, other };
}

function ItemRow({ item, onOpen }: { item: ImportItem; onOpen: (row: number) => void }) {
  const label = `${t.kinds[item.entity_kind] ?? item.entity_kind} ${item.entity_code ?? `#${item.row_number}`}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm">
      <span className="min-w-0 break-words">
        <span className="text-muted-foreground">{t.kinds[item.entity_kind]}</span>{' '}
        <span className="font-medium">{item.entity_code ?? `#${item.row_number}`}</span>
      </span>
      <span className="flex items-center gap-2">
        <ActionBadge action={item.action} />
        <Button variant="outline" size="sm" onClick={() => onOpen(item.row_number)} aria-label={`${t.open}: ${label}`}>
          {t.open}
        </Button>
      </span>
    </li>
  );
}

export function StepPreview({
  batch,
  onNext,
  onBack,
}: {
  batch: Batch;
  onNext: () => void;
  onBack: () => void;
}) {
  const [openRow, setOpenRow] = React.useState<number | null>(null);
  const items = useQuery({
    queryKey: ['admin', 'import', batch.id, 'items'],
    queryFn: () => importsApi.allItems(batch.id),
  });
  const tree = React.useMemo(() => buildTree(items.data ?? []), [items.data]);
  const counts = React.useMemo(() => {
    const c = { CREATE: 0, UPDATE: 0, NOOP: 0 };
    for (const it of items.data ?? []) if (it.action) c[it.action] += 1;
    return c;
  }, [items.data]);

  return (
    <div className="grid gap-5">
      <h2 className="text-xl font-semibold">{t.heading}</h2>
      {items.isPending ? (
        <div className="grid gap-2" role="status" aria-label={id.common.loading}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.isError ? (
        <ErrorState onRetry={() => void items.refetch()} />
      ) : items.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="preview-summary">
            {fmt(t.summary, { created: counts.CREATE, updated: counts.UPDATE, noop: counts.NOOP })}
          </p>
          <div className="grid gap-4" role="group" aria-label={t.treeLabel}>
            {tree.tiers.map(({ tier, modules }) => (
              <section key={tier} aria-labelledby={`tier-${tier}`} className="grid gap-2">
                <h3 id={`tier-${tier}`} className="text-base font-semibold">
                  {fmt(t.tier, { n: tier })}
                </h3>
                <div className="grid gap-3 border-l pl-3">
                  {modules.map(([code, node]) => (
                    <div key={code} className="grid gap-2">
                      <h4 className="text-sm font-semibold">{fmt(t.module, { code })}</h4>
                      <ul className="grid gap-2">
                        {node.module ? <ItemRow item={node.module} onOpen={setOpenRow} /> : null}
                        {node.subs.map((s) => (
                          <ItemRow key={s.row_number} item={s} onOpen={setOpenRow} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {tree.other.length > 0 ? (
              <section aria-labelledby="tier-other" className="grid gap-2">
                <h3 id="tier-other" className="text-base font-semibold">
                  {t.other}
                </h3>
                <ul className="grid gap-2">
                  {tree.other.map((s) => (
                    <ItemRow key={s.row_number} item={s} onOpen={setOpenRow} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={onBack}>
          {t.back}
        </Button>
        <Button size="lg" onClick={onNext}>
          {t.next}
        </Button>
      </div>

      <ItemPreviewSheet batchId={batch.id} row={openRow} onClose={() => setOpenRow(null)} />
    </div>
  );
}
