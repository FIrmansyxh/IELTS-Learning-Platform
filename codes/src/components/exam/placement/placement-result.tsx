'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Compass } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CURRICULUM_TREE_KEY } from '@/components/skill-tree/skill-tree-view';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { placementApi } from '@/lib/api/placement';
import type { PlacementResult } from '@/lib/api/placement-contract';
import { PLACEMENT_STATUS_KEY } from '../../home/placement-entry';
import { RESUME_KEY } from '../../home/resume-card';

/** Tier yang dilewati bila memulai di `tier` (null bila tidak ada), mis. "Tier 1 dan 2". */
export function skippedTiersText(tier: number): string | null {
  if (tier <= 1) return null;
  if (tier === 2) return fmt(id.placement.result.skipOne, { a: 1 });
  if (tier === 3) return fmt(id.placement.result.skipTwo, { a: 1, b: 2 });
  return fmt(id.placement.result.skipThree, { a: 1, b: 2, c: tier - 1 });
}

/**
 * Hasil Placement Test (SPEC-015): rekomendasi Tier + pilihan Tier awal (<= rekomendasi). Penerapan hanya lewat
 * POST /placement/apply setelah konfirmasi yang menyebut Tier yang dilewati; kelayakan Tier diputuskan server.
 */
export function PlacementResultView({ attemptId, placement }: { attemptId: string; placement: PlacementResult }) {
  const router = useRouter();
  const qc = useQueryClient();
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const [pending, setPending] = React.useState<number | null>(null);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState(placement.applied);

  const rec = placement.recommended_tier;
  const recOption = placement.tier_options.find((t) => t.tier_number === rec);
  const between = placement.tier_options.filter((t) => t.tier_number > 1 && t.tier_number < rec);

  async function apply(tier: number) {
    setApplying(true);
    setError(null);
    try {
      await placementApi.apply({ attempt_id: attemptId, tier_number: tier });
      setApplied(true);
      setPending(null);
      toast.success(fmt(id.placement.result.applied, { n: tier }));
      void qc.invalidateQueries({ queryKey: CURRICULUM_TREE_KEY });
      void qc.invalidateQueries({ queryKey: PLACEMENT_STATUS_KEY });
      void qc.invalidateQueries({ queryKey: RESUME_KEY });
      router.push('/peta');
    } catch (e) {
      setApplying(false);
      if (isApiError(e) && e.code === 'PLACEMENT_ALREADY_APPLIED') setApplied(true);
      setPending(null);
      setError(apiErrorMessage(e));
    }
  }

  const skipText = pending !== null ? skippedTiersText(pending) : null;
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <h1 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-2xl font-bold outline-none">
          <Compass className="size-6" aria-hidden="true" />
          {id.placement.result.title}
        </h1>
        <section aria-labelledby="placement-reco" className="grid gap-2 rounded-lg border bg-accent p-4">
          <h2 id="placement-reco" className="text-xl font-bold" data-testid="placement-reco">
            {fmt(id.placement.result.recommendation, { n: rec })}
          </h2>
          {recOption ? (
            <p className="text-sm">
              {fmt(id.placement.result.tierMeta, {
                title: recOption.title,
                cefr: recOption.cefr_level,
                min: recOption.target_band_min.toFixed(1),
                max: recOption.target_band_max.toFixed(1),
              })}
            </p>
          ) : null}
          <p className="text-sm font-medium">{fmt(id.placement.result.correct, { correct: placement.correct_count, served: placement.served_count })}</p>
        </section>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {applied ? (
          <div className="grid gap-3">
            <p role="status" className="flex items-center gap-2 font-semibold text-[var(--color-done-text)]">
              <CheckCircle2 className="size-5" aria-hidden="true" />
              {id.placement.result.alreadyApplied}
            </p>
            <Button asChild size="lg" className="w-full sm:w-fit">
              <Link href="/peta">{id.placement.result.openMap}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => setPending(rec)}>
                {fmt(id.placement.result.startAt, { n: rec })}
              </Button>
              {rec > 1 ? (
                <Button size="lg" variant="outline" onClick={() => setPending(1)}>
                  {id.placement.result.startAtOne}
                </Button>
              ) : null}
            </div>
            {between.length > 0 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="placement-other">{id.placement.result.otherTier}</Label>
                <select
                  id="placement-other"
                  value=""
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1) setPending(n);
                  }}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-fit"
                >
                  <option value="">{id.placement.result.otherTierPlaceholder}</option>
                  {between.map((t) => (
                    <option key={t.tier_number} value={t.tier_number}>
                      {fmt(id.placement.result.tierOption, { n: t.tier_number, title: t.title })}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        )}
        <p className="text-sm text-muted-foreground">{id.placement.result.disclaimer}</p>
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && !applying && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fmt(id.placement.result.confirmTitle, { n: pending ?? rec })}</DialogTitle>
            <DialogDescription>
              {skipText ? fmt(id.placement.result.confirmSkip, { list: skipText }) : id.placement.result.confirmNone}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={applying} onClick={() => setPending(null)}>
              {id.common.cancel}
            </Button>
            <Button loading={applying} onClick={() => pending !== null && void apply(pending)}>
              {applying ? id.placement.result.applying : id.placement.result.confirmApply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
