'use client';

import { CheckCircle2, Download, PanelRightClose, PanelRightOpen } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LearnSubtabType, SubModuleDetail } from '@/contracts/player';
import { fmt, id } from '@/i18n/id';
import { formatBytes } from '@/lib/format';
import { usePersistentToggle } from '@/lib/use-persistent-toggle';
import { cn } from '@/lib/utils';
import { extractToc, MarkdownArticle } from './markdown-article';
import { SlidesCarousel } from './slides-carousel';
import { VideoCard } from './video-card';

/** Batas bawaan `learn.min_active_seconds`; nilai pasti dikembalikan server pada 409 (details[].message). */
export const DEFAULT_MIN_ACTIVE_SECONDS = 60;

export type UnmetRequirement = { key: string; text: string };

/** Syarat "Selesai Belajar" yang belum terpenuhi (untuk petunjuk di bawah tombol). */
export function unmetRequirements(
  detail: SubModuleDetail,
  serverMessages: string[] | null,
): UnmetRequirement[] {
  const { progress, material } = detail;
  if (progress.learn_completed_at) return [];
  const out: UnmetRequirement[] = [];
  if (serverMessages && serverMessages.length > 0) {
    return serverMessages.map((m, i) => ({ key: `srv-${i}`, text: m }));
  }
  if (progress.learn_active_seconds < DEFAULT_MIN_ACTIVE_SECONDS) {
    out.push({ key: 'time', text: fmt(id.player.learn.needTime, { n: DEFAULT_MIN_ACTIVE_SECONDS }) });
  }
  const need: LearnSubtabType[] = ['ARTICLE'];
  if (material.videos.length > 0) need.push('VIDEO');
  if (material.slides.length > 0) need.push('SLIDES');
  for (const s of need) {
    if (!progress.learn_visited_subtabs.includes(s)) {
      out.push({ key: `sub-${s}`, text: fmt(id.player.learn.needSubtab, { name: id.player.subtabs[s] ?? s }) });
    }
  }
  if (!progress.learn_ready && out.length === 0) {
    out.push({ key: 'time', text: fmt(id.player.learn.needTime, { n: DEFAULT_MIN_ACTIVE_SECONDS }) });
  }
  return out;
}

export function LearnTab({
  detail,
  subtab,
  onSubtabChange,
  resumeVideoAt,
  onVideoPlaying,
  onVideoPosition,
  onComplete,
  completing,
  serverUnmet,
}: {
  detail: SubModuleDetail;
  subtab: LearnSubtabType;
  onSubtabChange: (next: LearnSubtabType) => void;
  resumeVideoAt: number | null;
  onVideoPlaying: (videoId: string, playing: boolean) => void;
  onVideoPosition: (videoId: string, seconds: number) => void;
  onComplete: () => void;
  completing: boolean;
  serverUnmet: string[] | null;
}) {
  const { material, progress } = detail;
  const available: LearnSubtabType[] = ['ARTICLE'];
  if (material.videos.length > 0) available.push('VIDEO');
  if (material.slides.length > 0) available.push('SLIDES');
  const active = available.includes(subtab) ? subtab : 'ARTICLE';
  const toc = React.useMemo(() => extractToc(material.article_markdown), [material.article_markdown]);
  const [tocOpen, setTocOpen] = usePersistentToggle('ielts.learn.toc', true);
  const showToc = toc.length > 1 && tocOpen;
  const done = progress.learn_completed_at !== null;
  const unmet = unmetRequirements(detail, serverUnmet);
  const canComplete = done || progress.learn_ready;

  return (
    <div className="grid gap-6">
      {available.length > 1 ? (
        <Tabs value={active} onValueChange={(v) => onSubtabChange(v as LearnSubtabType)}>
          <TabsList aria-label={id.player.subtabs.label} className="h-11 w-full sm:w-fit">
            {available.map((s) => (
              <TabsTrigger key={s} value={s} className="min-h-9 px-4">
                {id.player.subtabs[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {active === 'ARTICLE' ? (
        <div
          className={cn(
            'grid grid-cols-[minmax(0,1fr)] gap-6 lg:items-start',
            showToc && 'lg:grid-cols-[minmax(0,1fr)_16rem]',
          )}
        >
          <article>
            {toc.length > 1 && !tocOpen ? (
              <div className="mb-2 hidden justify-end lg:flex">
                <Button type="button" variant="ghost" size="sm" onClick={() => setTocOpen(true)}>
                  <PanelRightOpen aria-hidden="true" />
                  {id.player.tocShow}
                </Button>
              </div>
            ) : null}
            {toc.length > 1 ? (
              // Di bawah lg daftar isi samping tidak tampil: sediakan versi lipat agar artikel panjang tetap bisa dilompati.
              <details className="mb-4 rounded-lg border bg-card lg:hidden" data-testid="toc-mobile">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                  {id.player.toc} ({toc.length})
                </summary>
                <ul className="grid max-h-[50dvh] gap-0.5 overflow-y-auto border-t px-2 py-2 text-sm">
                  {toc.map((t) => (
                    <li key={t.id} className={cn(t.level === 3 && 'pl-3')}>
                      <a
                        href={`#${t.id}`}
                        onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
                        className="flex min-h-9 items-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        {t.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <MarkdownArticle markdown={material.article_markdown} />
            {material.attachments.length > 0 ? (
              <section aria-label={id.player.downloads} className="mt-6 flex flex-wrap gap-2">
                {material.attachments.map((a) => (
                  <Button key={a.asset_id} asChild variant="outline">
                    <a href={a.url} download>
                      <Download aria-hidden="true" />
                      {fmt(id.player.download, { type: a.file_type, size: formatBytes(a.size_bytes) })}
                      <span className="sr-only">: {a.title}</span>
                    </a>
                  </Button>
                ))}
              </section>
            ) : null}
            {material.attribution_text ? (
              <p className="mt-6 max-w-[110ch] text-xs text-muted-foreground">{material.attribution_text}</p>
            ) : null}
          </article>
          {showToc ? (
            <nav aria-label={id.player.toc} className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{id.player.toc}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setTocOpen(false)}
                  aria-label={id.player.tocHide}
                  title={id.player.tocHide}
                >
                  <PanelRightClose aria-hidden="true" />
                </Button>
              </div>
              <ul className="grid gap-1 border-l text-sm">
                {toc.map((t) => (
                  <li key={t.id} className={cn(t.level === 3 && 'pl-3')}>
                    <a href={`#${t.id}`} className="block py-1 pl-3 text-muted-foreground hover:text-foreground">
                      {t.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      ) : null}

      {active === 'VIDEO' ? (
        <div className="grid gap-6">
          {material.videos.map((v, i) => (
            <VideoCard
              key={v.asset_id}
              video={v}
              resumeAt={i === 0 ? resumeVideoAt : null}
              onPlayingChange={onVideoPlaying}
              onPosition={onVideoPosition}
            />
          ))}
        </div>
      ) : null}

      {active === 'SLIDES' ? <SlidesCarousel slides={material.slides} /> : null}

      <div className="grid gap-2 border-t pt-4">
        {done ? (
          <p role="status" className="flex items-center gap-2 font-medium text-[var(--color-done-text)]">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            {id.player.learn.done}
          </p>
        ) : (
          <>
            <Button
              size="lg"
              className={cn('w-full sm:w-auto', !canComplete && 'opacity-60')}
              aria-disabled={!canComplete || completing || undefined}
              disabled={completing}
              loading={completing}
              onClick={() => {
                if (canComplete && !completing) onComplete();
              }}
              aria-describedby={unmet.length > 0 ? 'learn-unmet' : undefined}
            >
              {completing ? id.player.learn.completing : id.player.learn.complete}
            </Button>
            {(!canComplete || (serverUnmet?.length ?? 0) > 0) && unmet.length > 0 ? (
              <div id="learn-unmet" className="text-sm text-muted-foreground">
                <p>{id.player.learn.unmet}</p>
                <ul className="list-disc pl-5">
                  {unmet.map((u) => (
                    <li key={u.key}>{u.text}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
