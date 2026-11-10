'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExamHistoryItemDTO } from '@/contracts/skills';
import { cn } from '@/lib/utils';

/** 3 ujian terakhir + antrean penilaian AI (esai/rekaman yang belum dinilai). */
export function RecentExamHistory({
  items,
  loading = false,
  className,
}: {
  items: readonly ExamHistoryItemDTO[] | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading || !items) {
    return <Skeleton className={cn('h-44 rounded-2xl', className)} role="status" aria-label="Memuat" />;
  }
  const recent = items.slice(0, 3);
  const queue = items.filter((i) => i.status === 'AWAITING_GRADING' || i.status === 'GRADING');
  return (
    <Card data-testid="dash-recent-exams" className={cn('gap-3 rounded-2xl p-5', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Ujian Terakhir</h2>
        <Link href="/riwayat" className="text-sm font-medium text-primary underline underline-offset-2">
          Semua riwayat
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="dash-exams-empty">
          Belum ada ujian. Coba Simulasi tes untuk melihat estimasi band.
        </p>
      ) : (
        <ul className="grid divide-y">
          {recent.map((e) => (
            <li key={e.attempt_id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {e.submitted_at ? new Date(e.submitted_at).toLocaleDateString('id-ID') : 'Belum dikirim'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-sm">
                {e.band_score !== null ? (
                  <span className="font-bold tabular-nums">Band {e.band_score.toFixed(1)}</span>
                ) : e.score_percent !== null ? (
                  <span className="font-bold tabular-nums">{Math.round(e.score_percent)}%</span>
                ) : null}
                <Link href={e.result_path} className="text-primary underline underline-offset-2">
                  Lihat
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {queue.length > 0 && (
        <p data-testid="dash-ai-queue" className="rounded-lg bg-[var(--color-primary-subtle)] p-2 text-xs">
          {queue.length} hasil menunggu penilaian AI.
        </p>
      )}
    </Card>
  );
}
