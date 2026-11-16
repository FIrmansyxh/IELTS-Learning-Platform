'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  BookOpen,
  Headphones,
  Home,
  Mic,
  PenTool,
  RotateCcw,
} from 'lucide-react';
import { simulationsApi } from '@/lib/api/simulations';
import type { SimulationSection } from '@/contracts/simulation';
import { fmt, id } from '@/i18n/id';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const SECTION_ICONS: Record<SimulationSection, React.ComponentType<{ className?: string }>> = {
  LISTENING: Headphones,
  READING: BookOpen,
  WRITING: PenTool,
  SPEAKING: Mic,
};

export function SimulationResultView({ attemptId }: { attemptId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['simulations', attemptId, 'result'],
    queryFn: () => simulationsApi.getResult(attemptId),
    refetchInterval: (query) => {
      // Auto-refresh jika ada section yang pending penilaian
      const hasPending = query.state.data?.sections.some(
        (s) => s.status === 'AWAITING_GRADING' || (s.section === 'SPEAKING' && s.status !== 'GRADED'),
      );
      return hasPending ? 5000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-6 py-12">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full py-12 text-center">
        <AlertCircle className="mx-auto size-12 text-destructive" />
        <h2 className="mt-4 text-xl font-bold">Hasil simulasi tidak ditemukan</h2>
        <Button className="mt-4" onClick={() => refetch()}>
          Coba Lagi
        </Button>
      </div>
    );
  }

  const { overall, sections, disclaimer } = data;

  return (
    <div className="w-full space-y-8 py-6">
      {/* Disclaimer Atas (Wajib) */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center text-xs font-semibold text-amber-900 dark:text-amber-200">
        {disclaimer}
      </div>

      {/* Header */}
      <div className="text-center">
        <h1 className="font-heading text-2xl font-bold md:text-3xl">{id.simulation.result.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          IELTS General Training Simulation • {sections.length} Section Terpilih
        </p>
      </div>

      {/* Kartu Overall Band */}
      <Card className="border-primary/20 bg-primary/5 text-center shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
            {overall.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-6">
          {overall.status === 'COMPLETE' && overall.band !== null ? (
            <div className="text-5xl font-black text-primary md:text-6xl">
              {overall.band.toFixed(1)}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-3xl font-bold text-muted-foreground">—</div>
              {overall.indicative_band !== null && (
                <p className="text-sm font-medium text-primary">
                  {fmt(id.simulation.result.indicativeBand, { band: overall.indicative_band.toFixed(1) })}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kartu Skor per Section */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((sec) => {
          const Icon = SECTION_ICONS[sec.section];
          const isGraded = sec.status === 'GRADED';
          const isAwaiting = sec.status === 'AWAITING_GRADING';

          return (
            <Card key={sec.section} className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-md bg-muted text-foreground">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle className="text-base font-semibold">
                    {id.simulation.sections[sec.section]}
                  </CardTitle>
                </div>
                {isGraded && sec.band !== null ? (
                  <Badge className="font-mono text-base font-bold">Band {sec.band.toFixed(1)}</Badge>
                ) : isAwaiting ? (
                  <Badge variant="outline" className="text-amber-600">
                    Menilai...
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Belum dinilai
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {/* Detail Reading / Listening */}
                {(sec.section === 'READING' || sec.section === 'LISTENING') && (
                  <p className="text-muted-foreground">
                    Skor Mentah:{' '}
                    <strong>
                      {sec.raw_score !== null ? sec.raw_score : 0} / {sec.max_score ?? 40}
                    </strong>{' '}
                    soal benar
                  </p>
                )}

                {/* Detail Writing */}
                {sec.section === 'WRITING' && (
                  <div className="space-y-1 text-muted-foreground">
                    {sec.detail && 'task1_band' in sec.detail && (
                      <p>
                        Task 1: Band {sec.detail.task1_band.toFixed(1)} • Task 2: Band{' '}
                        {sec.detail.task2_band.toFixed(1)}
                      </p>
                    )}
                    {sec.verified === false && (
                      <p className="text-amber-600 dark:text-amber-400">
                        {id.simulation.result.unverifiedNotice}
                      </p>
                    )}
                  </div>
                )}

                {/* Detail Speaking */}
                {sec.section === 'SPEAKING' && (
                  <div className="space-y-2">
                    {sec.detail && 'part1_band' in sec.detail ? (
                      <p className="text-muted-foreground">
                        P1: {sec.detail.part1_band !== null ? `Band ${sec.detail.part1_band.toFixed(1)}` : '—'} • P2:{' '}
                        {sec.detail.part2_band !== null ? `Band ${sec.detail.part2_band.toFixed(1)}` : '—'} • P3:{' '}
                        {sec.detail.part3_band !== null ? `Band ${sec.detail.part3_band.toFixed(1)}` : '—'}
                      </p>
                    ) : null}
                    {!isGraded && (
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link href={`/simulasi/${attemptId}`}>
                          <Mic className="mr-1.5 size-3.5" />
                          {id.simulation.result.inputSpeakingBtn}
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Disclaimer Bawah (Wajib) */}
      <div className="rounded-lg bg-muted/50 p-3 text-center text-xs text-muted-foreground">
        {disclaimer}
      </div>

      {/* Tombol Aksi */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <Button asChild variant="outline">
          <Link href="/">
            <Home className="mr-2 size-4" />
            {id.simulation.result.backToHome}
          </Link>
        </Button>
        <Button asChild>
          <Link href="/simulasi">
            <RotateCcw className="mr-2 size-4" />
            {id.simulation.result.tryAgain}
          </Link>
        </Button>
      </div>
    </div>
  );
}
