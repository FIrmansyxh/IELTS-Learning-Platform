'use client';

import { useMutation } from '@tanstack/react-query';
import { Award, Lock, PlayCircle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { TrackItem } from '@/lib/api/tracks';
import { tracksApi } from '@/lib/api/tracks';
import { isApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { checkpointBlock } from './track-utils';

interface CheckpointCardProps {
  item: TrackItem;
  trackCode: string;
  ordinal: number;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }
> = {
  PASSED: { label: 'Lulus', variant: 'default', className: 'bg-[var(--color-done-text)] text-white dark:text-[#0e1822]' },
  ATTEMPTED: { label: 'Perlu Diulang', variant: 'secondary', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  READY: { label: 'Siap Dikerjakan', variant: 'default', className: 'bg-primary text-primary-foreground' },
  NOT_READY: { label: 'Belum Siap', variant: 'outline', className: 'text-muted-foreground' },
};

export function CheckpointCard({ item, trackCode, ordinal }: CheckpointCardProps) {
  const router = useRouter();
  const cp = item.checkpoint;

  const startMutation = useMutation({
    mutationFn: () => {
      if (!item.item_id) throw new Error('ID item checkpoint tidak ditemukan.');
      return tracksApi.startCheckpoint(trackCode, item.item_id);
    },
    onSuccess: (data) => {
      router.push(`/latihan/checkpoint/${data.attempt_id}`);
    },
    onError: (err: unknown) => {
      const code = isApiError(err) ? err.code : '';
      if (code === 'CHECKPOINT_NOT_READY') {
        toast.error('Selesaikan semua materi sebelum checkpoint terlebih dahulu.');
      } else if (code === 'CHECKPOINT_NOT_ENOUGH_QUESTIONS') {
        toast.error('Kolam soal belum mencukupi untuk checkpoint ini.');
      } else {
        toast.error('Gagal memulai checkpoint.');
      }
    },
  });

  if (!cp) return null;

  const block = checkpointBlock(cp);
  const cfg = STATUS_CONFIG[cp.status] ?? STATUS_CONFIG.NOT_READY;
  const isPassed = cp.status === 'PASSED';
  const isAttempted = cp.status === 'ATTEMPTED';

  let helperText = '';
  if (block === 'NOT_READY') {
    helperText = 'Selesaikan semua sub-modul sebelum checkpoint untuk membuka sesi ini.';
  } else if (block === 'NOT_ENOUGH') {
    helperText = 'Soal pada sub-modul belum mencukupi (minimal 5 soal).';
  } else if (isPassed) {
    helperText = `Lulus dengan skor terbaik ${cp.best_percent}%. Anda dapat mengulang kapan saja.`;
  } else if (isAttempted) {
    helperText = `Skor terbaik ${cp.best_percent}%. Ambang batas kelulusan adalah 75%.`;
  } else {
    helperText = 'Uji pemahaman Anda dengan 10 soal objektif acak dari materi terkait.';
  }

  return (
    <Card
      data-testid={`checkpoint-card-${ordinal}`}
      className={cn(
        'relative border-2 border-dashed p-4 transition-all',
        isPassed
          ? 'border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/10'
          : block === null
            ? 'border-blue-500/40 bg-blue-50/20 dark:bg-blue-950/10'
            : 'border-muted bg-muted/20 opacity-80',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Award className="size-4" aria-hidden="true" />
            </span>
            <h4 className="text-base font-bold text-foreground">Checkpoint {ordinal}</h4>
            <Badge variant={cfg.variant} className={cn('text-[11px] font-semibold', cfg.className)}>
              {cfg.label}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">{helperText}</p>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            <span>
              Mencakup: <strong className="text-foreground">{cp.covers.join(', ')}</strong>
            </span>
            <span>•</span>
            <span>Kolam: {cp.pool_size} soal</span>
            {cp.best_percent !== null ? (
              <>
                <span>•</span>
                <span>
                  Skor: <strong className="text-foreground">{cp.best_percent}%</strong> (target 75%)
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 pt-2 sm:pt-0">
          <Button
            type="button"
            variant={isPassed ? 'outline' : 'default'}
            size="sm"
            disabled={block !== null || startMutation.isPending}
            onClick={() => startMutation.mutate()}
            className="w-full sm:w-auto"
          >
            {startMutation.isPending ? (
              <RefreshCw className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
            ) : block === 'NOT_READY' ? (
              <Lock className="mr-1.5 size-4" aria-hidden="true" />
            ) : (
              <PlayCircle className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {isPassed ? 'Latihan Ulang' : isAttempted ? 'Coba Lagi' : 'Mulai Checkpoint'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
