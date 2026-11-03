'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Sparkles } from 'lucide-react';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { MarkdownArticle } from '@/components/player/markdown-article';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { importsApi } from '@/lib/api/imports';
import { ActionBadge } from './status-badge';

const t = id.importer.preview;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strList = (v: unknown): string[] => arr(v).map(str).filter(Boolean);

/**
 * Soal baca-saja untuk pratinjau admin. Tidak memanggil API attempt; kunci jawaban SENGAJA tampil
 * (hanya di pratinjau admin, bukan di pemutar pelajar).
 */
export function ReadOnlyQuestion({ q, index }: { q: Rec; index: number }) {
  const type = str(q.question_type);
  const options = strList(q.options);
  const correct = arr(q.correct_answers);
  const correctText = correct.map(str);
  const isAi = type === 'WRITING_TASK' || type === 'SPEAKING_TASK';
  return (
    <li className="grid gap-2 rounded-lg border bg-card p-3 text-sm" data-testid="preview-question">
      <p className="font-semibold">
        {fmt(t.questionNo, { n: index + 1 })}
        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
          {type}
          {typeof q.points === 'number' ? ` - ${fmt(t.points, { n: q.points })}` : ''}
        </span>
      </p>
      <p className="whitespace-pre-wrap break-words">{str(q.prompt)}</p>
      {options.length > 0 ? (
        <ul className="grid gap-1" aria-label={t.options}>
          {options.map((o, i) => {
            const ok = correctText.includes(o);
            return (
              <li
                key={`${i}-${o}`}
                className={`flex items-start gap-2 rounded-md border p-2 ${ok ? 'border-[var(--color-done)] bg-[var(--color-surface-muted)]' : ''}`}
              >
                <span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                <span className="min-w-0 break-words">{o}</span>
                {ok ? (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--color-done-text)]">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    {t.correctMark}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {isAi ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
          {t.aiTask}
        </p>
      ) : options.length === 0 && correct.length > 0 ? (
        <p>
          <span className="font-semibold">{t.correct}:</span>{' '}
          <span className="break-words">{correct.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join(' | ')}</span>
        </p>
      ) : null}
      {str(q.explanation_id) ? (
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{t.explanation}:</span> {str(q.explanation_id)}
        </p>
      ) : null}
    </li>
  );
}

function questionsOf(p: Rec): Rec[] {
  const drill = isRec(p.active_drill) ? p.active_drill : null;
  const list = arr(drill?.questions ?? p.questions).filter(isRec);
  if (list.length === 0 && typeof p.question_type === 'string') return [p];
  return list;
}

function PayloadView({ payload }: { payload: Rec }) {
  const materials = isRec(payload.materials) ? payload.materials : null;
  const article = str(materials?.article_markdown);
  const videos = arr(materials?.videos).filter(isRec);
  const slides = arr(materials?.slides).filter(isRec);
  const attachments = arr(materials?.attachments).filter(isRec);
  const mini = isRec(materials?.mini_task) ? materials.mini_task : null;
  const questions = questionsOf(payload);
  const title = str(payload.sub_module_title) || str(payload.title);

  return (
    <div className="grid gap-5 px-4 pb-6">
      {title ? <h3 className="text-lg font-semibold break-words">{title}</h3> : null}
      {article ? (
        <section aria-labelledby="pv-article" className="grid gap-2">
          <h4 id="pv-article" className="text-sm font-semibold">
            {t.article}
          </h4>
          <MarkdownArticle markdown={article} />
        </section>
      ) : null}
      {videos.length > 0 ? (
        <section aria-labelledby="pv-videos" className="grid gap-1">
          <h4 id="pv-videos" className="text-sm font-semibold">
            {t.videos}
          </h4>
          <ul className="grid gap-1 text-sm">
            {videos.map((v, i) => (
              <li key={i} className="break-words">
                {str(v.title)} <code className="font-mono text-xs text-muted-foreground">({str(v.video_id)})</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {slides.length > 0 ? (
        <section aria-labelledby="pv-slides" className="grid gap-1">
          <h4 id="pv-slides" className="text-sm font-semibold">
            {t.slides}
          </h4>
          <ol className="grid gap-1 text-sm">
            {slides.map((s, i) => (
              <li key={i} className="break-words">
                {str(s.caption)} <code className="font-mono text-xs text-muted-foreground">{str(s.asset_code)}</code>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {attachments.length > 0 ? (
        <section aria-labelledby="pv-att" className="grid gap-1">
          <h4 id="pv-att" className="text-sm font-semibold">
            {t.attachments}
          </h4>
          <ul className="grid gap-1 text-sm">
            {attachments.map((a, i) => (
              <li key={i} className="break-words">
                {str(a.title)} <code className="font-mono text-xs text-muted-foreground">{str(a.asset_code)}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {mini ? (
        <section aria-labelledby="pv-mini" className="grid gap-1">
          <h4 id="pv-mini" className="text-sm font-semibold">
            {t.miniTask}
          </h4>
          <p className="text-sm whitespace-pre-wrap break-words">{str(mini.prompt)}</p>
        </section>
      ) : null}
      {questions.length > 0 ? (
        <section aria-labelledby="pv-questions" className="grid gap-2">
          <h4 id="pv-questions" className="text-sm font-semibold">
            {t.questions} ({questions.length})
          </h4>
          <ol className="grid gap-3">
            {questions.map((q, i) => (
              <ReadOnlyQuestion key={`${str(q.question_id)}-${i}`} q={q} index={i} />
            ))}
          </ol>
        </section>
      ) : null}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">{t.raw}</summary>
        <pre tabIndex={0} className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted p-2">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function ItemPreviewSheet({
  batchId,
  row,
  onClose,
}: {
  batchId: string;
  row: number | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ['admin', 'import', batchId, 'item', row],
    queryFn: () => importsApi.item(batchId, row as number),
    enabled: row !== null,
  });
  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t.sheetTitle}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            {q.data ? (
              <>
                <span>
                  {t.kinds[q.data.entity_kind]} {q.data.entity_code ?? ''}
                </span>
                <ActionBadge action={q.data.action} />
              </>
            ) : (
              t.sheetDescription
            )}
          </SheetDescription>
        </SheetHeader>
        {q.isPending ? (
          <div className="grid gap-3 px-4" role="status" aria-label={id.common.loading}>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : q.isError ? (
          <div className="px-4">
            <ErrorState title={t.loadFailed} onRetry={() => void q.refetch()} />
          </div>
        ) : q.data.payload === null ? (
          <p className="px-4 text-sm text-muted-foreground">{t.purged}</p>
        ) : (
          <>
            <p className="px-4 text-sm text-muted-foreground">{t.sheetDescription}</p>
            <PayloadView payload={q.data.payload} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
