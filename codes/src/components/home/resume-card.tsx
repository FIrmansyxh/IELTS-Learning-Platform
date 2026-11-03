'use client';

import { useQuery } from '@tanstack/react-query';
import { Map, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { ResumeCard as ResumeCardData } from '@/contracts/resume';
import { fmt, id } from '@/i18n/id';
import { resumeApi } from '@/lib/api/resume';

export const RESUME_KEY = ['resume-card'] as const;

/** Kartu "Lanjutkan Belajar" (design-system 5.10): satu CTA primer, satu klik langsung ke `resume_path`. */
export function ResumeCard({ card }: { card: ResumeCardData }) {
  const fallback = card.state === 'FALLBACK_NEXT';
  const title = card.sub_module.title;
  return (
    <Card
      data-testid="resume-card"
      className="bg-gradient-to-br from-[var(--color-primary-subtle)] to-[var(--color-surface)] rounded-2xl"
    >
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          {fallback ? id.resume.labelFallback : id.resume.label}
        </p>
        <CardTitle className="text-xl leading-snug">
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{fmt(id.resume.breadcrumb, { tier: card.breadcrumb.tier_label, module: card.breadcrumb.module_title })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm font-medium">{card.position_label}</p>
        <div className="grid gap-1">
          <Progress value={card.progress_percent} aria-label={fmt(id.resume.progress, { title })} />
          <p className="text-xs text-muted-foreground tabular-nums">{card.progress_percent}%</p>
        </div>
        <Button asChild size="lg" className="w-full sm:w-fit">
          <Link href={card.resume_path} aria-label={fmt(id.resume.ctaAria, { title })}>
            <PlayCircle aria-hidden="true" />
            {id.resume.cta}
          </Link>
        </Button>
        <Link href={card.change_path} className="w-fit text-sm font-medium text-primary underline underline-offset-2">
          {id.resume.change}
        </Link>
      </CardContent>
    </Card>
  );
}

function EmptyResume({ placementAvailable }: { placementAvailable: boolean }) {
  return (
    <Card data-testid="resume-empty">
      <CardHeader>
        <CardTitle className="text-xl">
          <h2>{id.resume.emptyTitle}</h2>
        </CardTitle>
        <CardDescription>{id.resume.emptyBody}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/peta">
            <Map aria-hidden="true" />
            {id.resume.startTier1}
          </Link>
        </Button>
        {placementAvailable ? (
          <Button asChild size="lg" variant="outline">
            <Link href="/placement">{id.resume.placement}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Memuat GET /me/last-learned lalu menampilkan kartu, empty state, skeleton, atau galat. */
export function ResumeSection({ placementAvailable = false }: { placementAvailable?: boolean }) {
  const q = useQuery({
    queryKey: RESUME_KEY,
    queryFn: ({ signal }) => resumeApi.get(signal),
    staleTime: 0,
  });
  if (q.isPending) {
    return <Skeleton className="h-64 w-full rounded-2xl" role="status" aria-label={id.common.loading} />;
  }
  if (q.isError) {
    return (
      <div className="grid gap-3">
        <ErrorState title={id.resume.loadFailedTitle} body={id.resume.loadFailedBody} onRetry={() => void q.refetch()} />
        <Link href="/peta" className="w-fit text-sm font-medium text-primary underline underline-offset-2">
          {id.resume.openMap}
        </Link>
      </div>
    );
  }
  return q.data ? <ResumeCard card={q.data} /> : <EmptyResume placementAvailable={placementAvailable} />;
}
