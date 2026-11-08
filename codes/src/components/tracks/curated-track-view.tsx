'use client';

import { CheckCircle2, ChevronRight, Crown, Lock, Play } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { TrackItem, TrackView } from '@/lib/api/tracks';
import { cn } from '@/lib/utils';
import { CheckpointCard } from './checkpoint-card';
import {
  checkpointOrdinals,
  countDone,
  groupSprintItems,
  isItemOpenable,
  isTierLocked,
} from './track-utils';

interface CuratedTrackViewProps {
  track: TrackView;
  onSwitchToCurriculum?: () => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: 'Selesai', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  SKIPPED: { label: 'Dilewati', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  IN_PROGRESS: { label: 'Sedang Belajar', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold' },
  UNLOCKED: { label: 'Terbuka', className: 'bg-secondary text-secondary-foreground' },
  LOCKED: { label: 'Terkunci', className: 'bg-muted text-muted-foreground' },
  COMING_SOON: { label: 'Segera Hadir', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
};

function SubModuleCard({
  item,
  dayLabel,
  onSwitchToCurriculum,
}: {
  item: TrackItem;
  dayLabel?: string;
  onSwitchToCurriculum?: () => void;
}) {
  const sm = item.sub_module;
  if (!sm) return null;

  const openable = isItemOpenable(item);
  const tierLocked = isTierLocked(item);
  const isComingSoon = sm.content_state !== 'AVAILABLE';
  const isDone = sm.status === 'COMPLETED' || sm.status === 'SKIPPED';
  const isInProgress = sm.status === 'IN_PROGRESS';

  const badgeCfg = isComingSoon
    ? STATUS_BADGE.COMING_SOON
    : STATUS_BADGE[sm.status] ?? STATUS_BADGE.LOCKED;

  const content = (
    <Card
      data-testid={`sub-module-item-${sm.sub_module_code}`}
      className={cn(
        'group relative border transition-all',
        openable
          ? 'cursor-pointer hover:border-primary/50 hover:bg-accent/40 hover:shadow-sm'
          : 'opacity-70 bg-muted/10',
        isInProgress ? 'border-primary ring-1 ring-primary bg-primary/5' : '',
        isDone ? 'border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10' : '',
      )}
    >
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 shrink-0">
            {isDone ? (
              <span className="flex size-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" aria-hidden="true" />
              </span>
            ) : isInProgress ? (
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/20 text-primary animate-pulse">
                <Play className="size-3.5 fill-current" aria-hidden="true" />
              </span>
            ) : openable ? (
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <span className="text-xs font-semibold">{item.position}</span>
              </span>
            ) : (
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Lock className="size-3.5" aria-hidden="true" />
              </span>
            )}
          </div>

          <div className="grid gap-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {dayLabel ? (
                <span className="text-xs font-bold uppercase tracking-wider text-primary">{dayLabel}</span>
              ) : null}
              <span className="text-xs font-medium text-muted-foreground">{sm.sub_module_code}</span>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', badgeCfg.className)}>
                {badgeCfg.label}
              </Badge>
              {sm.mastery_crown === 'GOLD' ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                  <Crown className="mr-1 size-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                  Gold
                </Badge>
              ) : sm.mastery_crown === 'SILVER' ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-600 border-slate-300">
                  <Crown className="mr-1 size-3 fill-slate-400 text-slate-400" aria-hidden="true" />
                  Silver
                </Badge>
              ) : null}
            </div>

            <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {sm.title}
            </h4>

            {tierLocked ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <span>{sm.lock_reason?.message ?? 'Terkunci oleh Tier.'}</span>
                {onSwitchToCurriculum ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs font-semibold underline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSwitchToCurriculum();
                    }}
                  >
                    Lihat Boss Stage
                  </Button>
                ) : null}
              </div>
            ) : sm.lock_reason?.message && sm.status === 'LOCKED' ? (
              <p className="text-xs text-muted-foreground">{sm.lock_reason.message}</p>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {sm.progress_percent > 0 && !isDone ? (
            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">{sm.progress_percent}%</span>
              <Progress value={sm.progress_percent} className="w-16 h-1" />
            </div>
          ) : null}
          {openable ? (
            <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
          ) : null}
        </div>
      </div>
    </Card>
  );

  if (openable) {
    return (
      <Link href={`/belajar/${sm.sub_module_code}`} className="block outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">
        {content}
      </Link>
    );
  }

  return content;
}

export function CuratedTrackView({ track, onSwitchToCurriculum }: CuratedTrackViewProps) {
  const ordinals = React.useMemo(() => checkpointOrdinals(track.items), [track.items]);

  if (track.layout === 'SPRINT') {
    const sprintGroups = groupSprintItems(track.items);

    return (
      <div className="grid gap-8" data-testid="sprint-track-view">
        {sprintGroups.map((group, gIdx) => {
          const weekNumber = group.week ?? gIdx + 1;
          const { done, total } = countDone(group.items);
          const weekProgressPct = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <section
              key={`week-${weekNumber}`}
              aria-label={`Minggu ${weekNumber}`}
              className="grid gap-3 rounded-2xl border bg-card/60 p-5 shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3">
                <div className="grid gap-0.5">
                  <h3 className="text-lg font-bold text-foreground">Minggu {weekNumber}</h3>
                  <p className="text-xs text-muted-foreground">
                    Target 5 hari materi intensif dan 1 checkpoint mingguan
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {done}/{total} hari selesai ({weekProgressPct}%)
                  </span>
                  <Progress value={weekProgressPct} className="w-24 h-2" />
                </div>
              </div>

              <div className="grid gap-3 pt-2">
                {group.items.map((item) => {
                  if (item.kind === 'CHECKPOINT') {
                    const ord = ordinals.get(item.position) ?? 1;
                    return (
                      <CheckpointCard
                        key={`cp-${item.position}`}
                        item={item}
                        trackCode={track.code}
                        ordinal={ord}
                      />
                    );
                  }

                  const dayLabel = item.day_no ? `Hari ${item.day_no}` : undefined;
                  return (
                    <SubModuleCard
                      key={`sm-${item.position}-${item.sub_module?.sub_module_code}`}
                      item={item}
                      dayLabel={dayLabel}
                      onSwitchToCurriculum={onSwitchToCurriculum}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // Layout LIST
  return (
    <div className="grid gap-3" data-testid="curated-list-track-view">
      {track.items.map((item) => {
        if (item.kind === 'CHECKPOINT') {
          const ord = ordinals.get(item.position) ?? 1;
          return (
            <CheckpointCard
              key={`cp-${item.position}`}
              item={item}
              trackCode={track.code}
              ordinal={ord}
            />
          );
        }

        return (
          <SubModuleCard
            key={`sm-${item.position}-${item.sub_module?.sub_module_code}`}
            item={item}
            onSwitchToCurriculum={onSwitchToCurriculum}
          />
        );
      })}
    </div>
  );
}
