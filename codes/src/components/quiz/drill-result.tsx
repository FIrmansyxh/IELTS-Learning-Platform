'use client';

import { CheckCircle2, ChevronDown, MinusCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { CrownBadge } from '@/components/gamification/crown-badge';
import { Button } from '@/components/ui/button';
import type { AttemptResult, QuestionPublic } from '@/contracts/attempts';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

/** Hasil Active Drill: skor besar, ambang ditandai garis, status Lulus/Belum lulus (ikon + teks), tinjauan soal. */
export function DrillResult({
  result,
  questions,
  onRetry,
  retrying,
  onReviewMaterial,
}: {
  result: AttemptResult;
  /** Soal yang disajikan (bila tersedia) untuk menampilkan teks soal pada tinjauan. */
  questions?: QuestionPublic[];
  onRetry: () => void;
  retrying: boolean;
  onReviewMaterial: () => void;
}) {
  const { attempt, progress } = result;
  const passed = attempt.passed === true;
  const pass = attempt.pass_percent ?? 75;
  const score = Math.max(0, Math.min(100, attempt.score_percent));
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const byId = new Map((questions ?? []).map((q, i) => [q.question_id, { q, n: i + 1 }]));
  const unlocked = progress?.unlocked ?? [];
  const next = progress?.next_sub_module_code ?? null;
  const crown = progress?.mastery_crown ?? 'NONE';

  return (
    <section aria-labelledby="drill-result-title" className="grid gap-5">
      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <h2 id="drill-result-title" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-muted-foreground outline-none">
          {id.quiz.result.score}
        </h2>
        <p className="text-5xl font-bold tabular-nums" data-testid="score-percent">
          {Number.isInteger(attempt.score_percent) ? attempt.score_percent : attempt.score_percent.toFixed(1).replace('.', ',')}%
        </p>
        <div>
          <div
            role="img"
            aria-label={`${id.quiz.result.score}: ${score}%. ${fmt(id.quiz.result.threshold, { n: pass })}`}
            className="relative h-3 w-full rounded-full bg-muted"
          >
            <div
              className={cn('h-full rounded-full', passed ? 'bg-[var(--color-done)]' : 'bg-[var(--color-accent)]')}
              style={{ width: `${score}%` }}
            />
            <div aria-hidden="true" className="absolute inset-y-[-4px] w-0.5 bg-foreground" style={{ left: `${pass}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{fmt(id.quiz.result.threshold, { n: pass })}</p>
        </div>
        <p
          role="status"
          className={cn(
            'flex items-center gap-2 text-lg font-bold',
            passed ? 'text-[var(--color-done-text)]' : 'text-[var(--color-accent-text)]',
          )}
        >
          {passed ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <XCircle className="size-5" aria-hidden="true" />}
          {passed ? id.quiz.result.passed : id.quiz.result.failed}
        </p>
        <p className="text-sm text-muted-foreground">
          {fmt(id.quiz.result.rawScore, { raw: attempt.raw_score, max: attempt.max_score })}
        </p>
        {crown !== 'NONE' && !result.gamification ? (
          <CrownBadge crown={crown} scorePercent={Math.round(progress?.best_score_percent ?? score)} />
        ) : null}

        {/* Gamifikasi: Mahkota, Poin & Streak */}
        {result.gamification && (
          <div className="rounded-lg border bg-accent/20 p-3 sm:p-4 grid gap-2" data-testid="drill-gamification">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CrownBadge
                  crown={result.gamification.crown?.current ?? crown}
                  size={24}
                  scorePercent={score}
                />
                {result.gamification.crown?.changed && (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {result.gamification.crown.current === 'GOLD' ? 'Mahkota Emas Diraih!' : 'Mahkota Perak Diraih!'}
                  </span>
                )}
              </div>
              <span className="text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                +{result.gamification.points.total} Poin
              </span>
            </div>

            {/* Rincian Poin */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t text-xs text-muted-foreground">
              {result.gamification.points.drill > 0 && (
                <div>Latihan: <strong className="text-foreground">+{result.gamification.points.drill}</strong></div>
              )}
              {result.gamification.points.speed_streak > 0 && (
                <div>Speed: <strong className="text-foreground">+{result.gamification.points.speed_streak}</strong></div>
              )}
              {result.gamification.points.crown > 0 && (
                <div>Mahkota: <strong className="text-foreground">+{result.gamification.points.crown}</strong></div>
              )}
              {result.gamification.points.daily > 0 && (
                <div>Harian: <strong className="text-foreground">+{result.gamification.points.daily}</strong></div>
              )}
              {result.gamification.daily_streak_days > 0 && (
                <div className="col-span-2 sm:col-span-4 flex items-center gap-1 pt-1 text-orange-600 dark:text-orange-400 font-medium">
                  Streak Belajar: {result.gamification.daily_streak_days} hari berturut-turut!
                </div>
              )}
            </div>
          </div>
        )}
        <p className="text-sm">{passed ? id.quiz.result.passedMessage : id.quiz.result.failedMessage}</p>
        {passed && unlocked.length > 0 ? (
          <p className="text-sm font-medium">{fmt(id.quiz.result.unlocked, { list: unlocked.map((u) => u.label).join(', ') })}</p>
        ) : null}
      </div>

      {result.per_skill.length > 1 ? (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">{id.quiz.result.perSkill}</h3>
          <ul className="grid gap-1 text-sm">
            {result.per_skill.map((s) => (
              <li key={s.skill} className="flex justify-between">
                <span>{s.skill}</span>
                <span className="tabular-nums">{s.score_percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {passed ? (
          <>
            {next ? (
              <Button asChild size="lg" className="sm:flex-1">
                <Link href={`/belajar/${next}`}>{id.quiz.result.nextSub}</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="sm:flex-1">
                <Link href="/peta">{id.quiz.result.backMap}</Link>
              </Button>
            )}
            <Button variant="outline" size="lg" onClick={onRetry} loading={retrying}>
              {retrying ? id.quiz.result.restarting : id.quiz.result.retry}
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="sm:flex-1" onClick={onRetry} loading={retrying}>
              {retrying ? id.quiz.result.restarting : id.quiz.result.retry}
            </Button>
            <Button variant="outline" size="lg" onClick={onReviewMaterial}>
              {id.quiz.result.review}
            </Button>
          </>
        )}
      </div>

      {result.review && result.review.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-base font-semibold">{id.quiz.result.reviewTitle}</h3>
          {result.review.map((r, i) => {
            const info = byId.get(r.question_id);
            const n = info?.n ?? i + 1;
            const state = r.is_correct == null ? 'skip' : r.is_correct ? 'ok' : 'bad';
            return (
              <details key={r.question_id} className="group rounded-lg border bg-card">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  {state === 'ok' ? (
                    <CheckCircle2 className="size-5 shrink-0 text-[var(--color-done-text)]" aria-hidden="true" />
                  ) : state === 'bad' ? (
                    <XCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
                  ) : (
                    <MinusCircle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="flex-1 text-sm font-medium">
                    {fmt(id.quiz.questionOf, { n, total: result.review!.length })}
                    {' · '}
                    {state === 'ok'
                      ? id.quiz.result.reviewCorrect
                      : state === 'bad'
                        ? id.quiz.result.reviewWrong
                        : id.quiz.result.reviewSkipped}
                  </span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="grid gap-2 border-t px-4 py-3 text-sm">
                  {info ? <p className="whitespace-pre-line font-medium">{info.q.prompt}</p> : null}
                  {r.correct_answer ? (
                    <div>
                      <p className="font-semibold">{id.quiz.correctAnswer}</p>
                      <ul lang="en" className="list-disc pl-5">
                        {r.correct_answer.display.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {r.explanation_id ? (
                    <div>
                      <p className="font-semibold">{id.quiz.explanation}</p>
                      <p className="whitespace-pre-line leading-relaxed">{r.explanation_id}</p>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
