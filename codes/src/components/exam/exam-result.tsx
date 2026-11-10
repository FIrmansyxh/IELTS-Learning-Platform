'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FastForward, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { BandBadge, BandResultBlock } from '@/components/band/band-display';
import { CURRICULUM_TREE_KEY } from '@/components/skill-tree/skill-tree-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AttemptResult } from '@/contracts/attempts';
import { SkipResultSchema, type SkipResult } from '@/contracts/exams';
import type { CurriculumTree } from '@/contracts/curriculum';
import { fmt, id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { curriculumApi } from '@/lib/api/curriculum';
import { formatScorePercent, formatTimeWib } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BossResultView } from './boss-result-view';
import { PlacementResultView } from './placement-result-view';

/** Sub-modul pertama (AVAILABLE) di bawah Modul/Tier target, untuk "Mulai Belajar dari Awal Modul". */
export function firstSubModuleCode(tree: CurriculumTree | undefined, scope: SkipResult['scope']): string | null {
  if (!tree) return null;
  for (const t of tree.tiers) {
    const modules = scope.kind === 'TIER' ? (t.id === scope.id ? t.modules : []) : t.modules.filter((m) => m.id === scope.id);
    for (const m of modules) {
      const s = m.sub_modules.find((x) => x.content_state === 'AVAILABLE');
      if (s) return s.sub_module_code;
    }
  }
  return null;
}

/**
 * Hasil ujian mode EXAM: skor agregat, ambang, status, dan rincian per skill. TIDAK menampilkan benar/salah per
 * soal, kunci, maupun pembahasan (QA F-08-01, ADR-003 #27); `review` dari server diabaikan di sini.
 */
export function ExamResultView({ result, onRefetch }: { result: AttemptResult; onRefetch?: () => void }) {
  const skip = React.useMemo(() => {
    const p = SkipResultSchema.safeParse(result.skip);
    return p.success ? p.data : null;
  }, [result.skip]);

  const tree = useQuery({
    queryKey: CURRICULUM_TREE_KEY,
    queryFn: ({ signal }) => curriculumApi.tree(signal),
    enabled: skip !== null && !skip.passed,
    staleTime: 0,
  });

  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (result.boss) {
    return <BossResultView result={result} onRefetch={onRefetch} />;
  }

  if (result.placement) {
    return <PlacementResultView result={result} />;
  }

  const { attempt } = result;
  const passed = skip ? skip.passed : attempt.passed === true;
  const threshold = skip?.threshold_percent ?? attempt.pass_percent;
  const score = Math.max(0, Math.min(100, attempt.score_percent));

  const title = skip
    ? skip.passed
      ? id.exam.result.skipPassedTitle
      : id.exam.result.skipFailedTitle
    : id.exam.result.genericTitle;
  const firstCode = skip && !skip.passed ? firstSubModuleCode(tree.data, skip.scope) : null;

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <h1 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-2xl font-bold outline-none">
          {skip?.passed ? <FastForward className="size-6" aria-hidden="true" /> : null}
          {title}
        </h1>
        {skip ? <p className="text-sm text-muted-foreground">{skip.scope.label}</p> : null}
        <div>
          <p className="text-sm font-semibold text-muted-foreground">{id.exam.result.score}</p>
          <p className="text-5xl font-bold tabular-nums" data-testid="score-percent">
            {formatScorePercent(attempt.score_percent)}%
          </p>
        </div>
        {threshold !== null ? (
          <div>
            <div
              role="img"
              aria-label={`${id.exam.result.score}: ${formatScorePercent(score)}%. ${fmt(id.exam.result.threshold, { n: threshold })}`}
              className="relative h-3 w-full rounded-full bg-muted"
            >
              <div
                className={cn('h-full rounded-full', passed ? 'bg-[var(--color-done)]' : 'bg-[var(--color-accent)]')}
                style={{ width: `${score}%` }}
              />
              <div aria-hidden="true" className="absolute inset-y-[-4px] w-0.5 bg-foreground" style={{ left: `${threshold}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{fmt(id.exam.result.threshold, { n: threshold })}</p>
          </div>
        ) : null}
        <p
          role="status"
          className={cn('flex items-center gap-2 text-lg font-bold', passed ? 'text-[var(--color-done-text)]' : 'text-[var(--color-accent-text)]')}
        >
          {passed ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <XCircle className="size-5" aria-hidden="true" />}
          {passed ? id.exam.result.passed : id.exam.result.failed}
        </p>
        <p className="text-sm text-muted-foreground">{fmt(id.exam.result.rawScore, { raw: attempt.raw_score, max: attempt.max_score })}</p>

        {skip?.passed ? (
          <div className="grid gap-1 text-sm">
            <p className="font-medium">{fmt(id.exam.result.skipPassedBody, { n: skip.skipped_sub_module_count })}</p>
            {skip.unlocked.length > 0 ? (
              <p>{fmt(id.exam.result.unlocked, { list: skip.unlocked.map((u) => u.label).join(', ') })}</p>
            ) : null}
          </div>
        ) : null}
        {skip && !skip.passed ? (
          <div className="grid gap-1 text-sm">
            <p>{id.exam.result.skipFailedBody}</p>
            {skip.retry.next_allowed_at ? (
              <p className="font-medium">{fmt(id.exam.result.retryAt, { time: formatTimeWib(skip.retry.next_allowed_at) })}</p>
            ) : null}
            <p className="text-muted-foreground">{fmt(id.exam.result.attemptsLeft, { n: skip.retry.attempts_remaining_today })}</p>
          </div>
        ) : null}

        {attempt.band_score !== null ? (
          <BandResultBlock>
            <BandBadge band={attempt.band_score} size="lg" />
          </BandResultBlock>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          {skip && !skip.passed ? (
            <Button asChild size="lg">
              <Link href={firstCode ? `/belajar/${firstCode}` : '/peta'}>{id.exam.result.startFromBeginning}</Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link href="/peta">{id.exam.result.openMap}</Link>
            </Button>
          )}
          {skip && !skip.passed ? (
            <Button asChild size="lg" variant="outline">
              <Link href="/peta">{id.exam.result.openMap}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {result.per_skill.length > 0 ? (
        <section className="rounded-xl border bg-card p-4" aria-labelledby="per-skill">
          <h2 id="per-skill" className="mb-2 text-sm font-semibold">
            {id.exam.result.perSkill}
          </h2>
          <ul className="grid gap-1 text-sm">
            {result.per_skill.map((s) => (
              <li key={s.skill} className="flex justify-between">
                <span>{s.skill}</span>
                <span className="tabular-nums">{formatScorePercent(s.score_percent)}%</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

    </div>
  );
}

/** Memuat GET /attempts/{id}/result; attempt yang belum selesai dialihkan kembali ke ujian. */
export function ExamResult({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['exam-result', attemptId],
    queryFn: ({ signal }) => attemptsApi.result(attemptId, signal),
    staleTime: Infinity,
    retry: false,
  });
  const notFinished = q.isError && isApiError(q.error) && q.error.code === 'ATTEMPT_NOT_FINISHED';
  React.useEffect(() => {
    if (notFinished) router.replace(`/ujian/${attemptId}`);
  }, [notFinished, router, attemptId]);
  if (q.isPending || notFinished) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-xl" role="status" aria-label={id.common.loading} />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <div className="mx-auto grid max-w-md gap-3 rounded-lg border bg-card p-6 text-center">
          <h1 className="text-xl font-bold">{id.exam.run.notFoundTitle}</h1>
          <Button asChild className="mx-auto w-fit">
            <Link href="/peta">{id.exam.intro.backToMap}</Link>
          </Button>
        </div>
      );
    }
    return <ErrorState title={id.exam.result.loadFailed} onRetry={() => void q.refetch()} />;
  }
  return <ExamResultView result={q.data} onRefetch={() => void q.refetch()} />;
}
