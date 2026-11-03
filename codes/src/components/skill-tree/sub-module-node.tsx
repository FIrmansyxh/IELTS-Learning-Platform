'use client';

import Link from 'next/link';
import { SkipTestButton } from './skip-test-button';
import * as React from 'react';
import { CrownBadge } from '@/components/gamification/crown-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ModuleNode, SubModuleNode, TierNode } from '@/contracts/curriculum';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import { STATUS_META } from './status';

export type Selection = { node: SubModuleNode; module: ModuleNode; tier: TierNode };

type Props = {
  node: SubModuleNode;
  module: ModuleNode;
  tier: TierNode;
  isLast: boolean;
  isActive: boolean;
  selected: boolean;
  onSelect: (s: Selection) => void;
};

/** Set Uji Kompetensi terdekat yang tersedia (modul dulu, lalu tier). */
function skipTarget(module: ModuleNode, tier: TierNode): { id: string; threshold: number } | null {
  if (module.skip_test.available && module.skip_test.assessment_set_id)
    return { id: module.skip_test.assessment_set_id, threshold: module.skip_test.threshold_percent };
  if (tier.skip_test.available && tier.skip_test.assessment_set_id)
    return { id: tier.skip_test.assessment_set_id, threshold: tier.skip_test.threshold_percent };
  return null;
}

const rowClasses =
  'flex min-h-11 w-full items-center gap-3 rounded-md py-1 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring';

function NodeBody({ node, active }: { node: SubModuleNode; active: boolean }) {
  const meta = STATUS_META[node.status];
  const Icon = meta.icon;
  const comingSoon = node.content_state === 'COMING_SOON';
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'relative z-[1] flex size-10 shrink-0 items-center justify-center rounded-full border-2',
          meta.circle,
          comingSoon && 'opacity-70',
        )}
      >
        <Icon className="size-5" />
        {active ? (
          <span className="absolute -inset-1 rounded-full border-2 border-[var(--color-progress)] opacity-60 motion-safe:animate-pulse" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug font-medium break-words" lang="en">
          {node.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className={cn('font-semibold', comingSoon ? 'text-muted-foreground' : meta.text)}>
            {comingSoon ? id.tree.comingSoon : meta.label}
          </span>
          {node.status === 'UNLOCKED' || node.status === 'IN_PROGRESS' ? (
            <span className="text-muted-foreground tabular-nums">{node.progress_percent}%</span>
          ) : null}
          <CrownBadge crown={node.mastery_crown} scorePercent={node.best_score_percent} />
        </span>
      </span>
    </>
  );
}

export function SubModuleNodeItem({ node, module, tier, isLast, isActive, selected, onSelect }: Props) {
  const meta = STATUS_META[node.status];
  const select = () => onSelect({ node, module, tier });
  const comingSoon = node.content_state === 'COMING_SOON';
  const openable = !comingSoon && node.status !== 'LOCKED';
  const skipSet = skipTarget(module, tier);

  return (
    <li className="relative" data-node-id={node.id} data-active-node={isActive ? 'true' : undefined}>
      {!isLast ? (
        <span
          aria-hidden="true"
          className={cn('absolute top-11 bottom-[-4px] left-[19px] w-0 border-l-2', meta.line)}
        />
      ) : null}
      {openable ? (
        <Link
          href={`/belajar/${node.sub_module_code}`}
          className={cn(rowClasses, 'hover:bg-accent', selected && 'bg-accent/60')}
          onFocus={select}
          onMouseEnter={select}
        >
          <NodeBody node={node} active={isActive} />
        </Link>
      ) : comingSoon ? (
        <div className={cn(rowClasses, 'cursor-default')} onMouseEnter={select}>
          <NodeBody node={node} active={false} />
        </div>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(rowClasses, 'cursor-pointer hover:bg-accent', selected && 'bg-accent/60')}
              onFocus={select}
              onMouseEnter={select}
            >
              <NodeBody node={node} active={false} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <p className="mb-1 text-sm font-semibold">{id.tree.lockedPopoverTitle}</p>
            <p className="text-sm text-muted-foreground">{node.lock_reason?.message ?? id.status.LOCKED}</p>
            {skipSet ? (
              <SkipTestButton assessmentSetId={skipSet.id} thresholdPercent={skipSet.threshold} size="sm" className="mt-3" />
            ) : null}
          </PopoverContent>
        </Popover>
      )}
    </li>
  );
}
