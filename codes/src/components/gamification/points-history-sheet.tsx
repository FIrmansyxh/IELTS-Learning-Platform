'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { gamificationApi } from '@/lib/api/gamification';
import type { PointLedgerItemDTO } from '@/contracts/gamification';
import { id } from '@/i18n/id';
import { formatDate } from '@/lib/format';

export interface PointsHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  DRILL: 'Latihan',
  SPEED_STREAK: 'Speed Streak',
  CROWN: 'Mahkota',
  MINI_TASK: 'Mini-Task',
  BOSS: 'Boss Stage',
  DAILY: 'Aktivitas Harian',
  ADJUSTMENT: 'Penyesuaian',
};

export function PointsHistorySheet({ open, onOpenChange }: PointsHistorySheetProps) {
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<PointLedgerItemDTO[]>([]);
  const [total, setTotal] = React.useState(0);
  const pageSize = 15;

  const loadPoints = React.useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await gamificationApi.points({ page: p, page_size: pageSize });
      setItems(res.data);
      setTotal(res.meta.total);
    } catch {
      // Non-kritis
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      void loadPoints(page);
    }
  }, [open, page, loadPoints]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="points-history-dialog">
        <DialogHeader>
          <DialogTitle>{id.gamification.pointsHistoryTitle}</DialogTitle>
          <DialogDescription>
            {total} riwayat perolehan poin tercatat.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {id.gamification.pointsHistoryEmpty}
            </p>
          ) : (
            <div className="divide-y text-sm">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5">
                  <div className="grid gap-0.5">
                    <span className="font-medium text-xs sm:text-sm">
                      {item.note || SOURCE_LABELS[item.source] || item.source}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                  <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    +{item.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <span className="text-xs text-muted-foreground">
              Halaman {page} dari {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Selanjutnya
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
