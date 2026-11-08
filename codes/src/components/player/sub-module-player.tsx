'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { CURRICULUM_TREE_KEY } from '@/components/skill-tree/skill-tree-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LearnSubtabType, SubModuleDetail } from '@/contracts/player';
import { useActiveLearnTimer } from '@/hooks/use-active-learn-timer';
import { usePositionRecorder, type PositionInput } from '@/hooks/use-position-recorder';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { playerApi } from '@/lib/api/player';
import { tracksApi } from '@/lib/api/tracks';
import { cn } from '@/lib/utils';
import { ApplyTab } from './apply-tab';
import { DrillTab } from './drill-tab';
import { LearnTab } from './learn-tab';
import { paramFromSubtab, subtabFromParam, SUB_MODULE_CODE_RE, type PlayerQuery, type PlayerTab } from './query';

export const subModuleKey = (code: string) => ['sub-module', code] as const;

const TAB_TO_RESUME = { pelajari: 'LEARN', latihan: 'DRILL', terapkan: 'MINI_TASK' } as const;

function Skeletons() {
  return (
    <div className="grid gap-4" role="status" aria-label={id.common.loading}>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-11 w-full sm:w-96" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

function LockedView({ reasonCode }: { reasonCode: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-5" aria-hidden="true" />
          <h1 className="text-xl font-bold">{id.player.lockedTitle}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-muted-foreground">
          {(reasonCode && id.player.lockedReason[reasonCode]) || id.player.lockedDefault}
        </p>
        <Button asChild className="w-fit">
          <Link href="/peta">{id.player.back}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function NotFoundView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-bold">{id.player.notFoundTitle}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-muted-foreground">{id.player.notFoundBody}</p>
        <Button asChild className="w-fit">
          <Link href="/peta">{id.player.back}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function TabLabel({ label, done }: { label: string; done: boolean }) {
  return (
    <>
      {done ? <Check className="size-4 text-[var(--color-done-text)]" aria-hidden="true" /> : null}
      <span>{label}</span>
      {done ? <span className="sr-only">({id.player.tabDone})</span> : null}
    </>
  );
}

/** Halaman /belajar/[kode]: kerangka header + tab Pelajari/Latihan/Terapkan (SPEC-005/006/007). */
export function SubModulePlayer({ code, initial }: { code: string; initial: PlayerQuery }) {
  const validCode = SUB_MODULE_CODE_RE.test(code);
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: subModuleKey(code),
    queryFn: ({ signal }) => playerApi.detail(code, signal),
    enabled: validCode,
    staleTime: 0,
  });
  const data = detailQ.data;
  const subModuleId = data?.sub_module.id ?? null;

  const [tab, setTab] = React.useState<PlayerTab>(initial.tab);
  const [subtab, setSubtab] = React.useState<LearnSubtabType>(subtabFromParam(initial.sub));
  const [attemptId, setAttemptId] = React.useState<string | null>(initial.attempt);
  const [resumeAt] = React.useState<number | null>(initial.t);
  const [serverUnmet, setServerUnmet] = React.useState<string[] | null>(null);
  const h1Ref = React.useRef<HTMLHeadingElement | null>(null);

  /* ---------- URL (tanpa navigasi Next; hanya replaceState) ---------- */
  const syncUrl = React.useCallback((next: { tab: PlayerTab; sub: LearnSubtabType; attempt: string | null }) => {
    const p = new URLSearchParams();
    p.set('tab', next.tab);
    if (next.tab === 'pelajari') p.set('sub', paramFromSubtab(next.sub));
    if (next.tab === 'latihan' && next.attempt) p.set('attempt', next.attempt);
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
    } catch {
      /* lingkungan tanpa History API */
    }
  }, []);

  /* ---------- perekam posisi (SPEC-007) ---------- */
  const recorder = usePositionRecorder(subModuleId);
  const record = recorder.record;
  const recordRef = React.useRef(record);
  recordRef.current = record;

  const positionFor = React.useCallback(
    (t: PlayerTab, s: LearnSubtabType): PositionInput => ({
      activeTab: TAB_TO_RESUME[t],
      subtab: t === 'pelajari' ? s : null,
    }),
    [],
  );

  const bootRecorded = React.useRef(false);
  React.useEffect(() => {
    if (!subModuleId || bootRecorded.current) return;
    bootRecorded.current = true;
    const base = positionFor(tab, subtab);
    const first = data?.material.videos[0];
    recordRef.current(
      tab === 'pelajari' && subtab === 'VIDEO' && first
        ? { ...base, videoId: first.video_id, videoSec: resumeAt ?? first.start_sec }
        : base,
    );
    h1Ref.current?.focus();
  }, [subModuleId, data, tab, subtab, resumeAt, positionFor]);

  /* ---------- bukti belajar (SPEC-005) ---------- */
  const patchProgress = React.useCallback(
    (patch: Partial<SubModuleDetail['progress']>) => {
      qc.setQueryData<SubModuleDetail>(subModuleKey(code), (d) => (d ? { ...d, progress: { ...d.progress, ...patch } } : d));
    },
    [qc, code],
  );

  const timer = useActiveLearnTimer({
    enabled: Boolean(subModuleId) && tab === 'pelajari',
    subtab,
    onFlush: async (s, seconds, keepalive) => {
      if (!subModuleId) return;
      const res = await playerApi.learnProgress(subModuleId, { subtab: s, active_seconds: seconds }, keepalive);
      patchProgress({
        learn_active_seconds: res.learn_active_seconds,
        learn_visited_subtabs: res.learn_visited_subtabs,
        learn_ready: res.learn_ready,
      });
    },
  });

  const completeLearn = useMutation({
    mutationFn: () => playerApi.learnComplete(subModuleId!),
    onSuccess: (res) => {
      setServerUnmet(null);
      qc.setQueryData<SubModuleDetail>(subModuleKey(code), (d) =>
        d
          ? {
              ...d,
              progress: { ...d.progress, learn_completed_at: res.learn_completed_at, learn_ready: true },
              drill: { ...d.drill, can_start: res.drill_can_start, blocked_reason: res.drill_can_start ? null : d.drill.blocked_reason },
            }
          : d,
      );
      changeTab('latihan');
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'LEARN_REQUIREMENTS_NOT_MET') {
        setServerUnmet(e.details.map((x) => x.message));
        void qc.invalidateQueries({ queryKey: subModuleKey(code) });
        return;
      }
      toast.error(apiErrorMessage(e));
    },
  });

  const markMiniTask = useMutation({
    mutationFn: () => playerApi.miniTaskComplete(subModuleId!),
    onSuccess: (res) => patchProgress({ mini_task_completed_at: res.mini_task_completed_at }),
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const setStyleMutation = useMutation({
    mutationFn: (newStyle: 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED' | null) =>
      tracksApi.setStyle(code, newStyle),
    onSuccess: () => {
      toast.success('Gaya penyampaian materi diperbarui');
      void qc.invalidateQueries({ queryKey: subModuleKey(code) });
    },
    onError: () => {
      toast.error('Gagal memperbarui gaya penyampaian.');
    },
  });

  /* ---------- perpindahan tab ---------- */
  function changeTab(next: PlayerTab) {
    timer.flushFor(subtab);
    setTab(next);
    syncUrl({ tab: next, sub: subtab, attempt: next === 'latihan' ? attemptId : null });
    recordRef.current(positionFor(next, subtab));
  }

  const changeSubtab = (next: LearnSubtabType) => {
    timer.flushFor(subtab);
    setSubtab(next);
    syncUrl({ tab, sub: next, attempt: null });
    const v = data?.material.videos[0];
    recordRef.current(
      next === 'VIDEO' && v
        ? { activeTab: 'LEARN', subtab: next, videoId: v.video_id, videoSec: v.start_sec }
        : { activeTab: 'LEARN', subtab: next },
    );
  };

  const onVideoPlaying = (_videoId: string, playing: boolean) => timer.setVideoPlaying(playing);
  const onVideoPosition = (videoId: string, seconds: number) =>
    recordRef.current({ activeTab: 'LEARN', subtab: 'VIDEO', videoId, videoSec: seconds }, { throttle: true });

  const onAttemptChange = (next: string | null) => {
    setAttemptId(next);
    syncUrl({ tab: 'latihan', sub: subtab, attempt: next });
  };
  const onQuestionIndex = (index: number, attId: string) =>
    recordRef.current({ activeTab: 'DRILL', questionIndex: index, attemptId: attId });
  const onDrillFinished = () => {
    void qc.invalidateQueries({ queryKey: subModuleKey(code) });
    void qc.invalidateQueries({ queryKey: CURRICULUM_TREE_KEY });
  };

  /* ---------- render ---------- */
  if (!validCode) return <NotFoundView />;
  if (detailQ.isPending) return <Skeletons />;
  if (detailQ.isError) {
    const e = detailQ.error;
    if (isApiError(e) && e.status === 403) return <LockedView reasonCode={e.details[0]?.code ?? null} />;
    if (isApiError(e) && (e.status === 404 || e.status === 400)) return <NotFoundView />;
    return (
      <ErrorState title={id.player.loadFailedTitle} body={apiErrorMessage(e)} onRetry={() => void detailQ.refetch()} />
    );
  }

  const d = data!;
  const { sub_module: sm, progress, drill, navigation } = d;
  const drillDone = progress.best_score_percent >= drill.pass_percent && progress.best_score_percent > 0;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <header className="grid gap-3">
        <div className="flex items-start gap-2">
          <Button asChild variant="ghost" size="icon" aria-label={id.player.backAria}>
            <Link href="/peta">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">
              {fmt(id.resume.breadcrumb, { tier: fmt(id.tree.tierLabel, { n: sm.tier.tier_number }), module: sm.module.title })}
              {' · '}
              {sm.sub_module_code}
            </p>
            <h1 ref={h1Ref} tabIndex={-1} className="text-2xl font-bold leading-tight outline-none">
              {sm.title}
            </h1>
          </div>
        </div>
        <Progress value={progress.progress_percent} aria-label={id.player.progressLabel} />
      </header>

      {d.delivery && d.delivery.available_styles.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">Cara belajar:</span>
          <div className="flex flex-wrap gap-1">
            {d.delivery.available_styles.map((st) => {
              const isCurrent = d.delivery?.applied_style === st;
              const names: Record<string, string> = {
                LEARN_FIRST: 'Belajar dulu',
                PRACTICE_FIRST: 'Latihan dulu',
                CASE_BASED: 'Studi kasus',
              };
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStyleMutation.mutate(st)}
                  disabled={setStyleMutation.isPending}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    isCurrent
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {names[st] ?? st}
                </button>
              );
            })}
          </div>
          {d.delivery.source === 'USER_OVERRIDE' ? (
            <button
              type="button"
              onClick={() => setStyleMutation.mutate(null)}
              disabled={setStyleMutation.isPending}
              className="ml-auto text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Reset ke bawaan jalur
            </button>
          ) : null}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => changeTab(v as PlayerTab)} className="gap-5">
        <TabsList aria-label={id.player.tabs.label} className="h-12 w-full sm:w-fit">
          <TabsTrigger value="pelajari" className="min-h-10 sm:px-6">
            <TabLabel label={id.player.tabs.learn} done={progress.learn_completed_at !== null} />
          </TabsTrigger>
          <TabsTrigger value="latihan" className="min-h-10 sm:px-6">
            <TabLabel label={id.player.tabs.drill} done={drillDone} />
          </TabsTrigger>
          <TabsTrigger value="terapkan" className="min-h-10 sm:px-6">
            <TabLabel label={id.player.tabs.apply} done={progress.mini_task_completed_at !== null} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pelajari">
          <LearnTab
            detail={d}
            subtab={subtab}
            onSubtabChange={changeSubtab}
            resumeVideoAt={resumeAt}
            onVideoPlaying={onVideoPlaying}
            onVideoPosition={onVideoPosition}
            onComplete={() => completeLearn.mutate()}
            completing={completeLearn.isPending}
            serverUnmet={serverUnmet}
          />
        </TabsContent>
        <TabsContent value="latihan">
          <DrillTab
            detail={d}
            initialAttemptId={attemptId}
            initialQuestionIndex={initial.q}
            onAttemptChange={onAttemptChange}
            onQuestionIndex={onQuestionIndex}
            onFinished={onDrillFinished}
            onReviewMaterial={() => changeTab('pelajari')}
          />
        </TabsContent>
        <TabsContent value="terapkan">
          <ApplyTab detail={d} onMarkDone={() => markMiniTask.mutate()} marking={markMiniTask.isPending} />
        </TabsContent>
      </Tabs>

      <nav aria-label={id.player.tabs.label} className="flex items-center justify-between gap-3 border-t pt-4">
        {navigation.prev_sub_module_code ? (
          <Button asChild variant="outline">
            <Link href={`/belajar/${navigation.prev_sub_module_code}`}>
              <ArrowLeft aria-hidden="true" />
              {id.player.prev}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {navigation.next_sub_module_code ? (
          <Button asChild variant="outline">
            <Link href={`/belajar/${navigation.next_sub_module_code}`}>
              {id.player.next}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </nav>
    </div>
  );
}
