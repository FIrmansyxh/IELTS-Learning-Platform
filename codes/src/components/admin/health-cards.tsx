'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MinusCircle, RefreshCw, XCircle, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminHealth } from '@/contracts/admin';
import { fmt, id } from '@/i18n/id';
import { adminApi } from '@/lib/api/admin';

export type ComponentState = 'up' | 'down' | 'disabled';

const STATE_META: Record<ComponentState, { label: string; icon: LucideIcon; className: string }> = {
  up: { label: id.admin.health.up, icon: CheckCircle2, className: 'text-[var(--color-done-text)]' },
  down: { label: id.admin.health.down, icon: XCircle, className: 'text-destructive' },
  disabled: { label: id.admin.health.disabled, icon: MinusCircle, className: 'text-muted-foreground' },
};

export function StateBadge({ state }: { state: ComponentState }) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`h-6 gap-1 px-2.5 font-semibold ${meta.className}`}>
      <Icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

/** Detak worker diperbarui tiap 15 dtk (SPEC-002); lewat 45 dtk dianggap mati. */
export const WORKER_STALE_SEC = 45;

export function workerState(age: number | null): ComponentState {
  return age !== null && age <= WORKER_STALE_SEC ? 'up' : 'down';
}

function HealthCard({
  title,
  state,
  lines,
}: {
  title: string;
  state: ComponentState;
  lines: string[];
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>
          <h2 className="text-base font-semibold">{title}</h2>
        </CardTitle>
        <StateBadge state={state} />
      </CardHeader>
      <CardContent>
        <ul className="grid gap-0.5 text-sm text-muted-foreground">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function HealthGrid({ health }: { health: AdminHealth }) {
  const h = id.admin.health;
  const q = health.queue;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <HealthCard
        title={h.db}
        state={health.db.status}
        lines={health.db.latency_ms != null ? [fmt(h.latency, { ms: health.db.latency_ms })] : []}
      />
      <HealthCard
        title={h.queue}
        state="up"
        lines={[
          fmt(h.queueWaiting, { n: q.waiting }),
          fmt(h.queueActive, { n: q.active }),
          fmt(h.queueFailed, { n: q.failed_24h }),
          ...(q.oldest_waiting_age_sec != null ? [fmt(h.queueOldest, { n: q.oldest_waiting_age_sec })] : []),
        ]}
      />
      <HealthCard
        title={h.llm}
        state={health.llm.status}
        lines={[
          ...(health.llm.driver ? [fmt(h.llmDriver, { driver: health.llm.driver })] : []),
          ...(health.llm.model_writing ? [fmt(h.llmModel, { model: health.llm.model_writing })] : []),
        ]}
      />
      <HealthCard
        title={h.stt}
        state={health.stt.status}
        lines={health.stt.model ? [fmt(h.sttModel, { model: health.stt.model })] : []}
      />
      <HealthCard
        title={h.worker}
        state={workerState(health.worker.heartbeat_age_sec)}
        lines={[
          health.worker.heartbeat_age_sec === null
            ? h.workerNone
            : fmt(h.workerAge, { n: health.worker.heartbeat_age_sec }),
        ]}
      />
      <HealthCard
        title={h.disk}
        state="up"
        lines={[
          fmt(h.diskUsed, { n: health.disk.assets_used_mb }),
          fmt(h.diskFree, { n: health.disk.assets_free_mb }),
        ]}
      />
    </div>
  );
}

export function HealthOverview() {
  const health = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: adminApi.health,
    refetchInterval: 30_000,
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{id.admin.health.title}</h1>
        <Button variant="outline" size="sm" onClick={() => void health.refetch()} loading={health.isFetching && !health.isPending}>
          <RefreshCw aria-hidden="true" />
          {id.admin.health.refresh}
        </Button>
      </div>
      {health.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label={id.common.loading}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : health.isError ? (
        <ErrorState title={id.admin.health.cardFailed} onRetry={() => void health.refetch()} />
      ) : (
        <>
          <HealthGrid health={health.data} />
          <p className="text-sm text-muted-foreground">
            {fmt(id.admin.health.app, { version: health.data.app.version, node: health.data.app.node })}
          </p>
        </>
      )}
    </div>
  );
}
