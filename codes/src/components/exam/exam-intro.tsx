'use client';

import { useQuery } from '@tanstack/react-query';
import { Compass, FastForward, Headphones, Info, Mic, Swords } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { examsApi, type ExamIntroData } from '@/lib/api/exams';
import { formatTimeWib } from '@/lib/format';
import { AudioPrecheck } from './audio-precheck';
import { AlreadyPassedNote, BossIntroBlock } from './boss/boss-intro';

export const examIntroKey = (setId: string) => ['exam-intro', setId] as const;

type StartBlock = { title: string; body: string } | null;

function blockedText(intro: ExamIntroData): string | null {
  if (intro.available || !intro.blocked_reason) return null;
  const tpl = id.exam.intro.blocked[intro.blocked_reason];
  if (!tpl) return null;
  const at = intro.cooldown.next_allowed_at;
  return fmt(tpl, { time: at ? formatTimeWib(at) : '' }).trim();
}

/** Layar pra-ujian generik (Skip; dipakai juga Boss/Placement). Tombol "Mulai Ujian" memanggil POST /attempts. */
export function ExamIntroView({ intro }: { intro: ExamIntroData }) {
  const router = useRouter();
  const [starting, setStarting] = React.useState(false);
  const [dialog, setDialog] = React.useState<StartBlock>(null);
  const [audioOk, setAudioOk] = React.useState(false);
  const resumeId = intro.active_attempt_id;
  const reason = blockedText(intro);
  const alreadyPassed = intro.blocked_reason === 'BOSS_ALREADY_PASSED' && !resumeId;
  const needsAudioCheck = intro.requires_audio && !resumeId && !alreadyPassed;
  const audioBlocked = needsAudioCheck && !audioOk;
  const disabled = (!intro.available && !resumeId) || audioBlocked;
  const boss = intro.assessment_type === 'TIER_BOSS_EXAM' ? (intro.boss ?? null) : null;
  const isPlacement = intro.assessment_type === 'PLACEMENT_TEST';
  const HeaderIcon = boss ? Swords : isPlacement ? Compass : FastForward;

  async function start() {
    if (resumeId) {
      router.push(`/ujian/${resumeId}`);
      return;
    }
    setStarting(true);
    try {
      const attempt = await attemptsApi.start(intro.assessment_set_id);
      router.push(`/ujian/${attempt.id}`);
    } catch (e) {
      setStarting(false);
      if (isApiError(e) && e.code === 'COOLDOWN_ACTIVE') {
        const iso = e.details[0]?.message;
        setDialog({
          title: id.exam.intro.dialogTitle,
          body: iso ? fmt(id.exam.intro.dialogCooldown, { time: formatTimeWib(iso) }) : id.apiErrors.COOLDOWN_ACTIVE!,
        });
      } else if (isApiError(e) && e.code === 'DAILY_ATTEMPT_LIMIT') {
        setDialog({ title: id.exam.intro.dialogTitle, body: id.exam.intro.dialogLimit });
      } else if (isApiError(e) && e.code === 'SKIP_NOT_AVAILABLE') {
        setDialog({ title: id.exam.intro.dialogTitle, body: id.exam.intro.dialogNotAvailable });
      } else if (isApiError(e) && ['BOSS_NOT_AVAILABLE', 'BOSS_ALREADY_PASSED', 'PLACEMENT_NOT_AVAILABLE'].includes(e.code)) {
        setDialog({ title: id.exam.intro.dialogTitle, body: id.apiErrors[e.code] ?? id.exam.intro.startFailed });
      } else {
        toast.error(id.exam.intro.startFailed);
      }
    }
  }

  const minutes = Math.max(1, Math.round(intro.time_limit_seconds / 60));
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <HeaderIcon className="size-6" aria-hidden="true" />
            <h1>{intro.title}</h1>
          </CardTitle>
          {intro.scope ? <CardDescription>{intro.scope.label}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-5">
          {boss ? (
            <BossIntroBlock boss={boss} />
          ) : (
            <>
              {intro.threshold ? (
                <p className="flex items-start gap-2 rounded-md border bg-accent p-3 text-sm font-medium">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {fmt(id.exam.intro.banner, { n: intro.threshold.value })}
                </p>
              ) : null}
              <p className="text-lg font-semibold">{fmt(id.exam.intro.summary, { q: intro.question_count, m: minutes })}</p>
            </>
          )}
          <section aria-labelledby="exam-rules">
            <h2 id="exam-rules" className="mb-2 text-sm font-semibold">
              {id.exam.intro.rulesTitle}
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {intro.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
          {intro.requires_audio || intro.requires_microphone ? (
            <section aria-labelledby="exam-device">
              <h2 id="exam-device" className="mb-2 text-sm font-semibold">
                {id.exam.intro.deviceTitle}
              </h2>
              <ul className="grid gap-2 text-sm">
                {intro.requires_audio ? (
                  <li className="flex items-center gap-2">
                    <Headphones className="size-4" aria-hidden="true" />
                    {id.exam.intro.audio}
                  </li>
                ) : null}
                {intro.requires_microphone ? (
                  <li className="flex items-center gap-2">
                    <Mic className="size-4" aria-hidden="true" />
                    {id.exam.intro.mic}
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
          {needsAudioCheck ? <AudioPrecheck confirmed={audioOk} onConfirmedChange={setAudioOk} /> : null}
          <p className="text-sm text-muted-foreground">
            {fmt(id.exam.intro.attempts, { n: intro.cooldown.attempts_in_window, max: intro.cooldown.max_attempts })}
          </p>
          <div className="grid gap-2">
            {alreadyPassed ? (
              <AlreadyPassedNote />
            ) : (
              <Button
                size="lg"
                className="w-full sm:w-fit"
                disabled={disabled}
                loading={starting}
                onClick={() => void start()}
                aria-describedby={reason ? 'exam-blocked' : audioBlocked ? 'exam-audio-blocked' : undefined}
              >
                {starting ? id.exam.intro.starting : resumeId ? id.exam.intro.resume : id.exam.intro.start}
              </Button>
            )}
            {audioBlocked && !reason ? (
              <p id="exam-audio-blocked" className="text-sm text-muted-foreground">
                {id.exam.intro.audioCheckFirst}
              </p>
            ) : null}
            {reason && (disabled || alreadyPassed) ? (
              <p id="exam-blocked" className="text-sm text-muted-foreground">
                {reason}
              </p>
            ) : null}
            {intro.blocked_reason === 'RESULT_PENDING_APPLY' ? (
              <Link href="/" className="w-fit text-sm font-medium text-primary underline underline-offset-2">
                {id.exam.intro.goHome}
              </Link>
            ) : null}
            <Link href="/peta" className="w-fit text-sm font-medium text-primary underline underline-offset-2">
              {id.exam.intro.backToMap}
            </Link>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.title}</DialogTitle>
            <DialogDescription>{dialog?.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDialog(null)}>{id.exam.intro.dialogClose}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Memuat intro lalu menampilkan layar pra-ujian dengan state loading/404/galat. */
export function ExamIntro({ assessmentSetId }: { assessmentSetId: string }) {
  const q = useQuery({
    queryKey: examIntroKey(assessmentSetId),
    queryFn: ({ signal }) => examsApi.intro(assessmentSetId, signal),
    staleTime: 0,
  });
  if (q.isPending) return <Skeleton className="mx-auto h-96 max-w-2xl rounded-xl" role="status" aria-label={id.common.loading} />;
  if (q.isError) {
    const e = q.error;
    if (isApiError(e) && (e.status === 404 || e.status === 400)) {
      return (
        <div className="mx-auto grid max-w-md gap-3 rounded-lg border bg-card p-6 text-center">
          <h1 className="text-xl font-bold">{id.exam.intro.notFoundTitle}</h1>
          <p className="text-muted-foreground">{id.exam.intro.notFoundBody}</p>
          <Button asChild className="mx-auto w-fit">
            <Link href="/peta">{id.exam.intro.backToMap}</Link>
          </Button>
        </div>
      );
    }
    return <ErrorState title={id.exam.intro.loadFailed} onRetry={() => void q.refetch()} />;
  }
  return <ExamIntroView intro={q.data} />;
}
