'use client';

import { Swords } from 'lucide-react';
import { SkipTestButton } from './skip-test-button';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TierNode } from '@/contracts/curriculum';
import { fmt, id } from '@/i18n/id';
import { ModuleCard } from './module-card';
import { StatusBadge } from './status';
import type { Selection } from './sub-module-node';

function BossButton({ tier }: { tier: TierNode }) {
  const { boss } = tier;
  if (boss.available && boss.assessment_set_id) {
    return (
      <Button asChild>
        <Link href={`/ujian/mulai/${boss.assessment_set_id}`}>
          <Swords aria-hidden="true" />
          {id.tree.bossStage}
        </Link>
      </Button>
    );
  }
  const reason = boss.blocked_reason ? id.tree.bossBlocked[boss.blocked_reason] : id.tree.bossBlocked.NO_BOSS_PUBLISHED;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Tombol disabled tidak memicu tooltip; pembungkus fokusable menjaga akses keyboard/SR. */}
        <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Button type="button" aria-disabled="true" disabled className="pointer-events-none">
            <Swords aria-hidden="true" />
            {id.tree.bossStage}
            <span className="sr-only">. {reason}</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export function TierSection({
  tier,
  activeId,
  selectedId,
  onSelect,
}: {
  tier: TierNode;
  activeId: string | null;
  selectedId: string | null;
  onSelect: (s: Selection) => void;
}) {
  const headingId = React.useId();
  const hasAvailable = tier.modules.some((m) => m.sub_modules.some((s) => s.content_state === 'AVAILABLE'));
  const skipSet = tier.skip_test.available ? tier.skip_test.assessment_set_id : null;

  return (
    <li>
      <section aria-labelledby={headingId} className="grid gap-4">
        <header className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id={headingId} className="text-xl font-bold">
                {fmt(id.tree.tierLabel, { n: tier.tier_number })}: {tier.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {fmt(id.tree.targetBand, {
                  min: tier.target_band_min.toFixed(1),
                  max: tier.target_band_max.toFixed(1),
                })}{' '}
                · CEFR {tier.cefr_level}
              </p>
            </div>
            <StatusBadge status={tier.status} />
          </div>
          <div className="flex items-center gap-3">
            <Progress
              value={tier.progress_percent}
              aria-label={fmt(id.tree.progressLabel, { name: fmt(id.tree.tierLabel, { n: tier.tier_number }) })}
              className="bg-border"
            />
            <span className="w-10 text-right text-sm font-medium tabular-nums">{tier.progress_percent}%</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <BossButton tier={tier} />
            {skipSet ? (
              <SkipTestButton assessmentSetId={skipSet} thresholdPercent={tier.skip_test.threshold_percent} />
            ) : null}
          </div>
        </header>

        {tier.modules.length > 0 ? (
          <ol aria-label={fmt(id.tree.tierLabel, { n: tier.tier_number })} className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {tier.modules.map((m) => (
              <ModuleCard
                key={m.id}
                module={m}
                tier={tier}
                activeId={activeId}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </ol>
        ) : null}
        {!hasAvailable ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{id.tree.emptyTier}</p>
        ) : null}
      </section>
    </li>
  );
}
