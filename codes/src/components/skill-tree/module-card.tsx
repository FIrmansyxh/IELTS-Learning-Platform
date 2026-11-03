'use client';

import { ChevronDown } from 'lucide-react';
import { SkipTestButton } from './skip-test-button';
import * as React from 'react';
import { Progress } from '@/components/ui/progress';
import type { ModuleNode, TierNode } from '@/contracts/curriculum';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import { StatusBadge } from './status';
import { SubModuleNodeItem, type Selection } from './sub-module-node';

export function ModuleCard({
  module,
  tier,
  activeId,
  selectedId,
  onSelect,
}: {
  module: ModuleNode;
  tier: TierNode;
  activeId: string | null;
  selectedId: string | null;
  onSelect: (s: Selection) => void;
}) {
  const done = module.status === 'COMPLETED' || module.status === 'SKIPPED';
  const [open, setOpen] = React.useState(!done);
  const listId = React.useId();
  const comingSoon = module.content_state === 'COMING_SOON';
  const skipSet = module.skip_test.available ? module.skip_test.assessment_set_id : null;

  return (
    <li className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-md p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('mt-1 size-5 shrink-0 transition-transform motion-reduce:transition-none', !open && '-rotate-90')}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-muted-foreground">
              {fmt(id.tree.module, { code: module.module_code })}
            </span>
            <span className="block text-base font-semibold break-words" lang="en">
              {module.title}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              {comingSoon ? (
                <span className="text-xs font-semibold text-muted-foreground">{id.tree.comingSoon}</span>
              ) : (
                <StatusBadge status={module.status} />
              )}
              <span className="text-xs text-muted-foreground tabular-nums">{module.progress_percent}%</span>
            </span>
          </span>
        </button>
        {skipSet ? (
          <SkipTestButton assessmentSetId={skipSet} thresholdPercent={module.skip_test.threshold_percent} size="sm" />
        ) : null}
      </div>
      <div className="px-4 pb-1">
        <Progress
          value={module.progress_percent}
          aria-label={fmt(id.tree.progressLabel, { name: module.title })}
          className="h-1.5 bg-border"
        />
      </div>
      <ol
        id={listId}
        hidden={!open}
        aria-label={fmt(id.tree.module, { code: module.module_code })}
        className="grid gap-1 p-3 pt-2"
      >
        {module.sub_modules.map((sm, idx) => (
          <SubModuleNodeItem
            key={sm.id}
            node={sm}
            module={module}
            tier={tier}
            isLast={idx === module.sub_modules.length - 1}
            isActive={sm.id === activeId}
            selected={sm.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ol>
    </li>
  );
}
