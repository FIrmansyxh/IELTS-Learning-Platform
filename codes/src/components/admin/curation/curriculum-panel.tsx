'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Pencil, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { ErrorState, EmptyState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { curationApi } from '@/lib/api/curation';
import type { CurriculumModule, CurriculumSubModule, CurriculumTier, SetRef } from '@/lib/api/curation-contract';
import { cn } from '@/lib/utils';
import { CurationTabs } from './curation-tabs';
import { ModuleSheet } from './module-sheet';
import { ReviewStatusBadge } from './status';
import { StatusDialog, type StatusTarget } from './status-dialog';
import { SubModuleSheet } from './sub-module-sheet';

const t = id.curation.curriculum;

function SetRow({ kind, set, onStatus }: { kind: string; set: SetRef | null; onStatus: (s: SetRef) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid={`set-row-${kind}`}>
      <span className="min-w-28 font-medium">{kind}</span>
      {set ? (
        <>
          <ReviewStatusBadge status={set.status} />
          {set.question_count !== undefined ? <span className="text-muted-foreground">{fmt(t.questionsCount, { n: set.question_count })}</span> : null}
          <span className="text-muted-foreground tabular-nums">{fmt(t.versionLabel, { n: set.version })}</span>
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onStatus(set)} aria-label={`${t.changeStatus}: ${kind}`}>
              <Repeat2 aria-hidden="true" />
              {t.changeStatus}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/admin/konten/soal/${set.id}`} aria-label={`${t.openSet}: ${kind}`}>
                <ExternalLink aria-hidden="true" />
                {t.openSet}
              </Link>
            </Button>
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">{t.noSet}</span>
      )}
    </li>
  );
}

function SubModuleRow({
  sub,
  highlighted,
  onEdit,
  onStatus,
  onStatusSet,
}: {
  sub: CurriculumSubModule;
  highlighted: boolean;
  onEdit: () => void;
  onStatus: () => void;
  onStatusSet: (s: SetRef, label: string) => void;
}) {
  const label = fmt(t.subModule, { code: sub.sub_module_code, title: sub.title });
  return (
    <li
      id={`sub-${sub.id}`}
      data-testid={`sub-${sub.sub_module_code}`}
      data-highlighted={highlighted || undefined}
      aria-label={fmt(t.rowAria, { label, status: id.curation.status[sub.status] ?? sub.status })}
      className={cn('grid gap-2 rounded-lg border bg-card p-3', highlighted && 'border-primary ring-2 ring-primary/30')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{label}</p>
          <p className="text-xs text-muted-foreground">
            {fmt(t.passingScore, { n: sub.passing_score_percent })} · {fmt(t.versionLabel, { n: sub.content_version })}
            {sub.origin ? ` · ${id.curation.origin[sub.origin] ?? sub.origin}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStatusBadge status={sub.status} />
          {sub.blocker_count > 0 ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`${t.viewBlockers}: ${fmt(t.blockers, { n: sub.blocker_count })}`}
              className="inline-flex min-h-6 items-center gap-1 rounded-full border border-destructive px-2.5 text-xs font-semibold text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AlertTriangle className="size-3" aria-hidden="true" />
              {fmt(t.blockers, { n: sub.blocker_count })}
            </button>
          ) : null}
        </div>
      </div>
      <ul className="grid gap-1" aria-label={t.sets}>
        <SetRow kind={id.curation.setKinds.drill} set={sub.drill} onStatus={(s) => onStatusSet(s, `${label} (${id.curation.setKinds.drill})`)} />
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil aria-hidden="true" />
          {t.edit}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onStatus} aria-label={`${t.changeStatus}: ${label}`}>
          <Repeat2 aria-hidden="true" />
          {t.changeStatus}
        </Button>
      </div>
    </li>
  );
}

function ModuleBlock({
  mod,
  highlightId,
  onEditModule,
  onStatusModule,
  onEditSub,
  onStatusSub,
  onStatusSet,
}: {
  mod: CurriculumModule;
  highlightId: string | null;
  onEditModule: () => void;
  onStatusModule: () => void;
  onEditSub: (s: CurriculumSubModule) => void;
  onStatusSub: (s: CurriculumSubModule) => void;
  onStatusSet: (s: SetRef, label: string) => void;
}) {
  const label = fmt(t.module, { code: mod.module_code, title: mod.title });
  return (
    <li className="grid gap-3 rounded-xl border bg-[var(--color-surface-muted)] p-3 sm:p-4" data-testid={`module-${mod.module_code}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-bold break-words">{label}</h4>
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStatusBadge status={mod.status} />
          <Button type="button" variant="outline" size="sm" onClick={onEditModule} aria-label={`${t.edit}: ${label}`}>
            <Pencil aria-hidden="true" />
            {t.edit}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onStatusModule} aria-label={`${t.changeStatus}: ${label}`}>
            <Repeat2 aria-hidden="true" />
            {t.changeStatus}
          </Button>
        </div>
      </div>
      <ul className="grid gap-1" aria-label={t.sets}>
        <SetRow kind={id.curation.setKinds.skip} set={mod.skip_set} onStatus={(s) => onStatusSet(s, `${label} (${id.curation.setKinds.skip})`)} />
      </ul>
      {mod.sub_modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noSubModules}</p>
      ) : (
        <ul className="grid gap-2">
          {mod.sub_modules.map((s) => (
            <SubModuleRow
              key={s.id}
              sub={s}
              highlighted={highlightId === s.id}
              onEdit={() => onEditSub(s)}
              onStatus={() => onStatusSub(s)}
              onStatusSet={onStatusSet}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TierBlock({ tier, children }: { tier: CurriculumTier; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`tier-${tier.tier_number}`} className="grid gap-3" data-testid={`tier-${tier.tier_number}`}>
      <h3 id={`tier-${tier.tier_number}`} className="text-xl font-bold">
        {fmt(t.tier, { n: tier.tier_number, title: tier.title })}
      </h3>
      {children}
    </section>
  );
}

/** `/admin/konten/kurikulum`: pohon Tier > Modul > Sub-Modul dengan status, penghalang, dan set soal. */
export function CurriculumPanel() {
  const q = useQuery({ queryKey: ['admin', 'curriculum'], queryFn: ({ signal }) => curationApi.curriculum(signal) });
  const [statusTarget, setStatusTarget] = React.useState<StatusTarget | null>(null);
  const [subId, setSubId] = React.useState<string | null>(null);
  const [moduleEdit, setModuleEdit] = React.useState<CurriculumModule | null>(null);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);

  // Tautan "Dipakai oleh" (SPEC-018): `?sub_modul=<id>` menyorot baris dan membuka Sheet sunting.
  const deepLinked = React.useRef(false);
  React.useEffect(() => {
    if (deepLinked.current || !q.data || typeof window === 'undefined') return;
    const target = new URLSearchParams(window.location.search).get('sub_modul');
    if (!target) return;
    deepLinked.current = true;
    const exists = q.data.tiers.some((tier) => tier.modules.some((m) => m.sub_modules.some((s) => s.id === target)));
    if (!exists) return;
    setHighlightId(target);
    setSubId(target);
    requestAnimationFrame(() => document.getElementById(`sub-${target}`)?.scrollIntoView?.({ block: 'center' }));
  }, [q.data]);

  const setStatus = (s: SetRef, label: string) =>
    setStatusTarget({ entity: 'assessment-sets', entityId: s.id, label, current: s.status, needsAiConfirm: s.origin === 'AI_GENERATED_REVIEWED' });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>
      <CurationTabs current="kurikulum" />

      {q.isPending ? (
        <div className="grid gap-3" role="status" aria-label={id.common.loading}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState title={t.loadFailed} onRetry={() => void q.refetch()} />
      ) : q.data.tiers.length === 0 ? (
        <EmptyState message={t.noTiers} />
      ) : (
        <div className="grid gap-8">
          {q.data.tiers.map((tier) => (
            <TierBlock key={tier.tier_number} tier={tier}>
              <ul className="grid gap-1 rounded-lg border bg-card p-3" aria-label={t.sets}>
                <SetRow kind={id.curation.setKinds.skip} set={tier.skip_set} onStatus={(s) => setStatus(s, `Tier ${tier.tier_number} (${id.curation.setKinds.skip})`)} />
                <SetRow kind={id.curation.setKinds.boss} set={tier.boss} onStatus={(s) => setStatus(s, `Tier ${tier.tier_number} (${id.curation.setKinds.boss})`)} />
              </ul>
              <ul className="grid gap-3">
                {tier.modules.map((m) => (
                  <ModuleBlock
                    key={m.id}
                    mod={m}
                    highlightId={highlightId}
                    onEditModule={() => setModuleEdit(m)}
                    onStatusModule={() =>
                      setStatusTarget({ entity: 'modules', entityId: m.id, label: fmt(t.module, { code: m.module_code, title: m.title }), current: m.status })
                    }
                    onEditSub={(s) => setSubId(s.id)}
                    onStatusSub={(s) =>
                      setStatusTarget({
                        entity: 'sub-modules',
                        entityId: s.id,
                        label: fmt(t.subModule, { code: s.sub_module_code, title: s.title }),
                        current: s.status,
                        needsAiConfirm: s.origin === 'AI_GENERATED_REVIEWED',
                      })
                    }
                    onStatusSet={setStatus}
                  />
                ))}
              </ul>
            </TierBlock>
          ))}
          <section aria-labelledby="placement-sets" className="grid gap-2">
            <h3 id="placement-sets" className="text-xl font-bold">
              {t.placement}
            </h3>
            <ul className="rounded-lg border bg-card p-3">
              <SetRow kind={id.curation.setKinds.placement} set={q.data.placement} onStatus={(s) => setStatus(s, t.placement)} />
            </ul>
          </section>
        </div>
      )}

      <StatusDialog target={statusTarget} onClose={() => setStatusTarget(null)} />
      <SubModuleSheet subModuleId={subId} onClose={() => setSubId(null)} />
      <ModuleSheet module={moduleEdit} onClose={() => setModuleEdit(null)} />
    </div>
  );
}

