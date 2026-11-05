'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Award, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { AttemptResult } from '@/contracts/attempts';
import { PlacementResultSchema, type PlacementResultDTO } from '@/contracts/placement';
import { placementApi } from '@/lib/api/placement';
import { apiErrorMessage } from '@/lib/api/errors';
import { fmt, id } from '@/i18n/id';

export function PlacementResultView({ result }: { result: AttemptResult }) {
  const router = useRouter();
  const parsed = PlacementResultSchema.safeParse(result.placement);
  const placement: PlacementResultDTO | null = parsed.success ? parsed.data : null;

  const [selectedTier, setSelectedTier] = React.useState<number>(() => {
    return placement?.recommended_tier ?? 1;
  });

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [tierToApply, setTierToApply] = React.useState<number>(() => {
    return placement?.recommended_tier ?? 1;
  });
  const [applying, setApplying] = React.useState(false);

  if (!placement) return null;

  const recTier = placement.recommended_tier;
  const currentRecOption = placement.tier_options.find((t) => t.tier_number === recTier);

  const openConfirm = (tierNumber: number) => {
    setTierToApply(tierNumber);
    setConfirmOpen(true);
  };

  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await placementApi.apply(result.attempt.id, tierToApply);
      toast.success(fmt(id.placement.appliedToast, { n: tierToApply }));
      setConfirmOpen(false);
      router.replace('/peta');
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setApplying(false);
    }
  };

  const skippedTiersText = Array.from({ length: tierToApply - 1 }, (_, i) => i + 1).join(', ');

  return (
    <div className="mx-auto grid max-w-xl gap-6 p-4 sm:p-6" data-testid="placement-result-view">
      {/* Kartu Rekomendasi Utama */}
      <Card className="text-center shadow-sm">
        <CardHeader className="pb-3">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Award className="size-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {fmt(id.placement.recommendationTitle, { n: recTier })}
          </CardTitle>
          <CardDescription className="text-sm font-medium">
            {fmt(id.placement.scoreSummary, {
              correct: placement.correct_count,
              served: placement.served_count,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {/* Detail Tier Rekomendasi */}
          {currentRecOption && (
            <div className="rounded-xl border bg-card p-4 text-left shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-base">
                  Tier {currentRecOption.tier_number}: {currentRecOption.title}
                </span>
                <Badge variant="secondary">{currentRecOption.cefr_level}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Target Band IELTS: {currentRecOption.target_band_min.toFixed(1)} -{' '}
                {currentRecOption.target_band_max.toFixed(1)}
              </p>
            </div>
          )}

          {/* Tombol Tindakan */}
          <div className="grid gap-3 pt-2">
            <Button
              size="lg"
              className="w-full text-base"
              onClick={() => openConfirm(recTier)}
              data-testid="apply-recommended-btn"
            >
              {fmt(id.placement.applyRecommendBtn, { n: recTier })}
              <ChevronRight className="size-4 ml-1.5" aria-hidden="true" />
            </Button>

            {recTier > 1 && (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => openConfirm(1)}
                data-testid="start-tier-1-btn"
              >
                {id.placement.startTier1Btn}
              </Button>
            )}

            {/* Pilihan Tier Lain jika rekomendasi > 2 */}
            {recTier > 2 && (
              <div className="flex items-center justify-between gap-3 pt-2 border-t">
                <span className="text-sm font-medium text-muted-foreground">
                  {id.placement.chooseOtherTier}:
                </span>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(selectedTier)}
                    onValueChange={(val) => {
                      const t = Number(val);
                      setSelectedTier(t);
                    }}
                  >
                    <SelectTrigger className="w-[160px]" data-testid="select-tier-trigger">
                      <SelectValue placeholder="Pilih Tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {placement.tier_options.map((t) => (
                        <SelectItem key={t.tier_number} value={String(t.tier_number)}>
                          Tier {t.tier_number} ({t.cefr_level})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openConfirm(selectedTier)}
                    data-testid="apply-selected-btn"
                  >
                    Pilih
                  </Button>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground pt-2">{id.placement.disclaimer}</p>
        </CardContent>
      </Card>

      {/* Dialog Konfirmasi Apply */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.placement.confirmDialogTitle}</DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              {tierToApply > 1
                ? fmt(id.placement.confirmDialogBody, {
                    tiers: skippedTiersText,
                    chosen: tierToApply,
                  })
                : 'Anda akan memulai belajar dari awal pada Tier 1.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={applying}>
              {id.common.cancel}
            </Button>
            <Button onClick={() => void handleApply()} loading={applying} data-testid="confirm-apply-btn">
              {id.placement.confirmApplyBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

