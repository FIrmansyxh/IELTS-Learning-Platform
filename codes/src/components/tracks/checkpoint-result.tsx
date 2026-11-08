'use client';

import { CheckCircle2, Map, XCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttemptResult } from '@/contracts/attempts';
import { cn } from '@/lib/utils';

interface CheckpointResultViewProps {
  result: AttemptResult;
}

export function CheckpointResultView({ result }: CheckpointResultViewProps) {
  const isPassed = Boolean(result.attempt.passed) || result.attempt.score_percent >= 75;

  return (
    <div className="mx-auto grid max-w-xl gap-6 p-4">
      <Card
        className={cn(
          'border-2 text-center',
          isPassed
            ? 'border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10'
            : 'border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/10',
        )}
      >
        <CardHeader className="flex flex-col items-center gap-2 pt-8">
          <span
            className={cn(
              'flex size-16 items-center justify-center rounded-full',
              isPassed
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
            )}
          >
            {isPassed ? <CheckCircle2 className="size-8" /> : <XCircle className="size-8" />}
          </span>

          <CardTitle className="text-2xl font-bold">
            {isPassed ? 'Selamat, Anda Lulus Checkpoint!' : 'Belum Mencapai Target Kelulusan'}
          </CardTitle>

          <p className="text-sm text-muted-foreground">
            {isPassed
              ? 'Pemahaman Anda pada materi yang dicakup sudah sangat baik (minimal 75%).'
              : 'Ambang kelulusan checkpoint adalah 75%. Anda dapat mereview materi dan mengulang checkpoint ini.'}
          </p>
        </CardHeader>

        <CardContent className="grid gap-6 pb-8">
          <div className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4">
            <div className="grid gap-1 border-r">
              <span className="text-xs text-muted-foreground">Skor Akhir</span>
              <span className="text-3xl font-extrabold text-foreground">{result.attempt.score_percent}%</span>
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <span
                className={cn(
                  'text-lg font-bold flex items-center justify-center gap-1 mt-1',
                  isPassed ? 'text-emerald-600' : 'text-amber-600',
                )}
              >
                {isPassed ? 'LULUS' : 'PERLU ULANG'}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/peta">
                <Map className="mr-2 size-4" />
                Kembali ke Peta Belajar
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
