'use client';

import { Dumbbell } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { ActiveDrill } from '@/components/quiz/active-drill';
import { DrillResult } from '@/components/quiz/drill-result';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Attempt, AttemptResult } from '@/contracts/attempts';
import type { SubModuleDetail } from '@/contracts/player';
import { fmt, id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { apiErrorMessage } from '@/lib/api/errors';

type Phase =
  | { kind: 'summary' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'drill'; attempt: Attempt }
  | { kind: 'result'; result: AttemptResult; attempt: Attempt | null };

/**
 * Tab Latihan: ringkasan Drill, "Mulai Latihan", lalu Active Drill (SPEC-006). Attempt dipulihkan lewat
 * `?attempt=` (SPEC-007) atau lewat POST /attempts yang mengembalikan attempt IN_PROGRESS yang sama.
 */
export function DrillTab({
  detail,
  initialAttemptId,
  initialQuestionIndex,
  onAttemptChange,
  onQuestionIndex,
  onFinished,
  onReviewMaterial,
}: {
  detail: SubModuleDetail;
  initialAttemptId: string | null;
  initialQuestionIndex: number | null;
  onAttemptChange: (attemptId: string | null) => void;
  onQuestionIndex: (index: number, attemptId: string) => void;
  /** Dipanggil setelah submit agar progres/peta dimuat ulang. */
  onFinished: () => void;
  onReviewMaterial: () => void;
}) {
  const { drill, progress } = detail;
  const [phase, setPhase] = React.useState<Phase>(initialAttemptId ? { kind: 'loading' } : { kind: 'summary' });
  const [starting, setStarting] = React.useState(false);
  const resumeQ = React.useRef(initialQuestionIndex);

  // Pulihkan attempt dari URL.
  React.useEffect(() => {
    if (!initialAttemptId) return;
    const ctl = new AbortController();
    (async () => {
      try {
        const attempt = await attemptsApi.get(initialAttemptId, ctl.signal);
        if (attempt.status === 'IN_PROGRESS' && attempt.questions.length > 0) {
          setPhase({ kind: 'drill', attempt });
        } else if (attempt.status === 'IN_PROGRESS') {
          setPhase({ kind: 'summary' });
          onAttemptChange(null);
        } else {
          const result = await attemptsApi.result(initialAttemptId, ctl.signal);
          setPhase({ kind: 'result', result, attempt: null });
        }
      } catch {
        if (ctl.signal.aborted) return;
        // Attempt tidak valid/bukan milik pengguna: mulai dari layar pembuka.
        resumeQ.current = null;
        onAttemptChange(null);
        setPhase({ kind: 'summary' });
      }
    })();
    return () => ctl.abort();
    // Hanya saat mount: URL adalah sumber awal, bukan dikendalikan terus-menerus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (!drill.assessment_set_id || starting) return;
    setStarting(true);
    try {
      const attempt = await attemptsApi.start(drill.assessment_set_id);
      resumeQ.current = attempt.resumed ? resumeQ.current : null;
      onAttemptChange(attempt.id);
      setPhase({ kind: 'drill', attempt });
    } catch (e) {
      toast.error(apiErrorMessage(e) || id.player.drill.startFailed);
    } finally {
      setStarting(false);
    }
  };

  if (phase.kind === 'loading') {
    return <Skeleton className="h-96 w-full rounded-xl" role="status" aria-label={id.common.loading} />;
  }

  if (phase.kind === 'error') {
    return <ErrorState title={id.quiz.loadFailed} onRetry={() => setPhase({ kind: 'summary' })} />;
  }

  if (phase.kind === 'drill') {
    return (
      <ActiveDrill
        key={phase.attempt.id}
        attempt={phase.attempt}
        startIndex={resumeQ.current}
        onIndexChange={onQuestionIndex}
        onFinished={(result) => {
          onAttemptChange(null);
          onFinished();
          setPhase({ kind: 'result', result, attempt: phase.attempt });
        }}
      />
    );
  }

  if (phase.kind === 'result') {
    return (
      <DrillResult
        result={phase.result}
        questions={phase.attempt?.questions}
        retrying={starting}
        onRetry={() => void start()}
        onReviewMaterial={onReviewMaterial}
      />
    );
  }

  const blocked = drill.blocked_reason ? id.player.drill.blocked[drill.blocked_reason] : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Dumbbell className="size-5" aria-hidden="true" />
          {id.player.drill.title}
        </CardTitle>
        <CardDescription>
          {fmt(id.player.drill.summary, {
            n: drill.question_count,
            m: Math.max(1, Math.round(drill.time_limit_seconds / 60)),
            p: drill.pass_percent,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {progress.best_score_percent > 0 ? (
          <p className="text-sm text-muted-foreground">
            {fmt(id.player.drill.bestScore, { n: progress.best_score_percent })}
          </p>
        ) : null}
        <Button size="lg" disabled={!drill.can_start} loading={starting} onClick={() => void start()} aria-describedby={blocked ? 'drill-blocked' : undefined}>
          {starting ? id.player.drill.starting : id.player.drill.start}
        </Button>
        {blocked ? (
          <p id="drill-blocked" className="text-sm text-muted-foreground">
            {blocked}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
