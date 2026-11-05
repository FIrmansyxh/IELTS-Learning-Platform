'use client';

import * as React from 'react';
import { CheckCircle2, ChevronRight, Loader2, Sparkles, XCircle } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BandBadge, BandResultBlock } from '@/components/band/band-display';
import type { AttemptResult } from '@/contracts/attempts';
import { BossResultSchema, type BossResultDTO } from '@/contracts/exams';
import { fmt, id } from '@/i18n/id';
import { formatTimeWib } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getSkillIcon } from './section-gate';

export function BossResultView({
  result,
  onRefetch,
}: {
  result: AttemptResult;
  onRefetch?: () => void;
}) {
  const parsed = BossResultSchema.safeParse(result.boss);
  const boss: BossResultDTO | null = parsed.success ? parsed.data : null;

  // Polling jika masih ada evaluasi AI yang tertunda (maks 10 menit)
  React.useEffect(() => {
    if (!boss || boss.pending_ai === 0 || !onRefetch) return;
    const start = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - start > 10 * 60 * 1000) {
        clearInterval(interval);
        return;
      }
      onRefetch();
    }, 10000);
    return () => clearInterval(interval);
  }, [boss, onRefetch]);

  if (!boss) return null;

  const passed = boss.passed;
  const isPercent = boss.gate.type === 'PERCENT';
  const gateTargetText = isPercent
    ? fmt(id.boss.targetPercentVsResult, { target: boss.gate.value, result: boss.percent })
    : fmt(id.boss.targetBandVsResult, { target: boss.gate.value.toFixed(1), result: boss.boss_band.toFixed(1) });

  return (
    <div className="mx-auto grid max-w-2xl gap-5 p-4 sm:p-6" data-testid="boss-result-view">
      <Card className="text-center">
        <CardHeader className="pb-3">
          <div className="mx-auto mb-2 flex items-center justify-center gap-2">
            <Sparkles className="size-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Hasil Boss Stage - Tier {boss.tier.tier_number}</h1>
          </div>
          <CardDescription className="text-base font-medium">{gateTargetText}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <BandResultBlock>
            <div className="flex flex-col items-center gap-2">
              <BandBadge band={boss.boss_band} size="lg" />
              <p className="text-xs text-muted-foreground">Band Listening + Reading</p>
            </div>
          </BandResultBlock>

          <div
            role="status"
            className={cn(
              'flex items-center justify-center gap-2 text-xl font-bold',
              passed ? 'text-[var(--color-done-text)]' : 'text-[var(--color-accent-text)]',
            )}
          >
            {passed ? <CheckCircle2 className="size-6" aria-hidden="true" /> : <XCircle className="size-6" aria-hidden="true" />}
            <span>{passed ? id.exam.result.passed : id.exam.result.failed}</span>
          </div>

          {passed ? (
            <div className="rounded-lg border bg-emerald-500/10 p-4 text-left text-sm">
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                Selamat! Anda berhasil melampaui ambang batas Tier {boss.tier.tier_number}.
              </p>
              {boss.unlocked.length > 0 && (
                <p className="mt-1 text-muted-foreground">
                  {fmt(id.boss.unlockedList, { list: boss.unlocked.map((u) => u.label).join(', ') })}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-4 text-left text-sm">
              <p className="font-semibold">Tetap semangat! Anda belum mencapai target kelulusan.</p>
              {boss.retry.next_allowed_at && (
                <p className="mt-1 text-muted-foreground">
                  {fmt(id.exam.result.retryAt, { time: formatTimeWib(boss.retry.next_allowed_at) })}
                </p>
              )}
              <p className="text-muted-foreground">
                {fmt(id.exam.result.attemptsLeft, { n: boss.retry.attempts_remaining_today })}
              </p>
            </div>
          )}

          <div className="pt-2">
            <Button asChild size="lg" className="w-full">
              <Link href="/peta">
                {passed ? fmt(id.boss.unlockNextTier, { n: boss.tier.tier_number + 1 }) : id.exam.result.openMap}
                <ChevronRight className="size-4 ml-2" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rincian per Section / Skill */}
      <section className="grid gap-4" aria-label="Rincian Section">
        <h2 className="text-lg font-bold">Rincian Nilai per Keterampilan</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {boss.sections.map((sec) => {
            const isObjective = sec.skill === 'LISTENING' || sec.skill === 'READING';
            const hasSubmission = sec.submission_ids.length > 0;
            const notDone = !isObjective && !hasSubmission && sec.status === 'EXPIRED';

            return (
              <Card key={sec.skill} className="flex flex-col justify-between" data-testid={`skill-card-${sec.skill.toLowerCase()}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getSkillIcon(sec.skill)}
                      <CardTitle className="text-base font-semibold">{sec.skill}</CardTitle>
                    </div>
                    <Badge variant={sec.counts_toward_gate ? 'default' : 'secondary'} className="text-xs">
                      {sec.counts_toward_gate ? 'Menentukan' : 'Masukan'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {isObjective ? (
                    <div>
                      <p className="text-muted-foreground">
                        Skor mentah: {sec.raw_score ?? 0}/{sec.max_score ?? 0}
                      </p>
                      <p className="text-muted-foreground">
                        Setara: {sec.raw_40 ?? 0}/40
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-medium">Band:</span>
                        {sec.band !== null ? <BandBadge band={sec.band} /> : '-'}
                      </div>
                    </div>
                  ) : notDone ? (
                    <p className="text-muted-foreground italic">{id.boss.notAttempted}</p>
                  ) : sec.band !== null ? (
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Band AI:</span>
                        <BandBadge band={sec.band} />
                      </div>
                      {hasSubmission && (
                        <div className="pt-2">
                          <Link
                            href={`/riwayat/penilaian/${sec.submission_ids[0]}`}
                            className="text-xs font-medium text-primary underline underline-offset-2"
                          >
                            {id.boss.viewFeedback}
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                      <span>{id.boss.aiWaiting}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Overall Band Estimate bila 4 keterampilan terisi */}
      {boss.overall_band_estimate !== null && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{id.boss.overallBandEstimate}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Rata-rata 4 keterampilan resmi IELTS</p>
              <p className="text-xs text-muted-foreground mt-1">{boss.disclaimer}</p>
            </div>
            <BandBadge band={boss.overall_band_estimate} size="lg" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

