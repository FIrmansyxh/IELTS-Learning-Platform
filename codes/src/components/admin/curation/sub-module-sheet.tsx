'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/admin/dialogs';
import { RightsBadge } from '@/components/admin/license-badges';
import { ErrorState } from '@/components/common/state-views';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { MarkdownArticle } from '@/components/player/markdown-article';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { curationApi } from '@/lib/api/curation';
import type { MiniTask, SubModuleDetail, UpdateMaterialRequest, UpdateSubModuleRequest } from '@/lib/api/curation-contract';
import { apiErrorMessage, detailMessage } from '@/lib/api/errors';
import { BlockersList } from './blockers-list';
import { Field, NativeSelect, Textarea } from './fields';
import { ReviewStatusBadge } from './status';
import { useDiscardGuard } from './use-discard-guard';

const t = id.curation.subSheet;
const MINI_TYPES = ['AI_SHORT_WRITING', 'AI_SHORT_SPEAKING', 'SELF_CHECK'] as const;

/** Path `details[]` server -> kunci galat field di form ini. */
export function errorFieldKey(path: string): string {
  if (path.startsWith('mini_task.prompt')) return 'mini_prompt';
  if (path.startsWith('mini_task.ai_rubric_criteria')) return 'mini_rubric';
  return path.split('.')[0] ?? '';
}

type Mini = { task_type: MiniTask['task_type']; prompt: string; ai_rubric_criteria: string } | null;

function sameMini(a: Mini, b: Mini): boolean {
  if (a === null || b === null) return a === b;
  return a.task_type === b.task_type && a.prompt === b.prompt && a.ai_rubric_criteria === b.ai_rubric_criteria;
}

function AssetLine({ assetId, title, rights, extra }: { assetId: string; title: string; rights: Parameters<typeof RightsBadge>[0]['status']; extra?: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
      <span className="min-w-0 break-words">
        {title}
        {extra ? <span className="text-muted-foreground"> ({extra})</span> : null}
      </span>
      <span className="flex items-center gap-2">
        <RightsBadge status={rights} />
        <Link
          href={`/admin/konten/aset?buka=${assetId}`}
          className="font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${t.openAsset}: ${title}`}
        >
          {t.openAsset}
        </Link>
      </span>
    </li>
  );
}

function SubModuleForm({ detail, onClose }: { detail: SubModuleDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const sub = detail.sub_module;
  const mat = detail.material;
  const initialMini: Mini = mat?.mini_task ?? null;

  const [title, setTitle] = React.useState(sub.title);
  const [order, setOrder] = React.useState(String(sub.order_index));
  const [passing, setPassing] = React.useState(String(sub.passing_score_percent));
  const [article, setArticle] = React.useState(mat?.article_markdown ?? '');
  const [attribution, setAttribution] = React.useState(mat?.attribution_text ?? '');
  const [mini, setMini] = React.useState<Mini>(initialMini);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [confirmPublished, setConfirmPublished] = React.useState(false);
  const previewText = React.useDeferredValue(article);

  const subDirty = title !== sub.title || order !== String(sub.order_index) || passing !== String(sub.passing_score_percent);
  const matDirty = mat !== null && (article !== mat.article_markdown || attribution !== (mat.attribution_text ?? '') || !sameMini(mini, initialMini));
  const dirty = subDirty || matDirty;
  const guard = useDiscardGuard(dirty, onClose, { title: t.discardTitle, body: t.discardBody, action: t.discardAction });

  const save = useMutation({
    mutationFn: async (p: { sub: UpdateSubModuleRequest | null; material: UpdateMaterialRequest | null }) => {
      if (p.sub) await curationApi.updateSubModule(sub.id, p.sub);
      if (p.material) await curationApi.updateMaterial(sub.id, p.material);
    },
    onSuccess: () => {
      toast.success(t.saved);
      setConfirmPublished(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'curriculum'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-sub-module', sub.id] });
      onClose();
    },
    onError: (e) => {
      setConfirmPublished(false);
      const next: Record<string, string> = {};
      if (isApiError(e)) {
        for (const d of e.details) next[errorFieldKey(d.path)] = detailMessage(d.code, d.message);
        if (e.code === 'ORDER_INDEX_TAKEN') next.order_index = apiErrorMessage(e);
      }
      setErrors(next);
      setFormError(Object.keys(next).length > 0 ? t.errorSummary : apiErrorMessage(e));
      void qc.invalidateQueries({ queryKey: ['admin', 'curriculum'] });
    },
  });

  function validate(): { sub: UpdateSubModuleRequest | null; material: UpdateMaterialRequest | null } | null {
    const next: Record<string, string> = {};
    const trimmed = title.trim();
    if (trimmed.length < 1 || trimmed.length > 200) next.title = id.fieldErrors.out_of_range!;
    const o = Number(order);
    if (!Number.isInteger(o) || o < 1) next.order_index = id.fieldErrors.out_of_range!;
    const p = Number(passing);
    if (!Number.isInteger(p) || p < 1 || p > 100) next.passing_score_percent = id.fieldErrors.out_of_range!;
    if (mat) {
      if (article.length < 1 || article.length > 100_000) next.article_markdown = id.fieldErrors.out_of_range!;
      if (attribution.length > 500) next.attribution_text = id.fieldErrors.out_of_range!;
      if (mini) {
        if (mini.prompt.trim().length < 1 || mini.prompt.length > 2000) next.mini_prompt = id.fieldErrors.out_of_range!;
        if (mini.ai_rubric_criteria.trim().length < 1 || mini.ai_rubric_criteria.length > 1000) next.mini_rubric = id.fieldErrors.out_of_range!;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError(t.errorSummary);
      return null;
    }
    const subBody: UpdateSubModuleRequest = {};
    if (trimmed !== sub.title) subBody.title = trimmed;
    if (o !== sub.order_index) subBody.order_index = o;
    if (p !== sub.passing_score_percent) subBody.passing_score_percent = p;
    const matBody: UpdateMaterialRequest = {};
    if (mat) {
      if (article !== mat.article_markdown) matBody.article_markdown = article;
      const attr = attribution.trim() === '' ? null : attribution.trim();
      if (attr !== (mat.attribution_text ?? null)) matBody.attribution_text = attr;
      if (!sameMini(mini, initialMini)) {
        matBody.mini_task = mini ? { task_type: mini.task_type, prompt: mini.prompt.trim(), ai_rubric_criteria: mini.ai_rubric_criteria.trim() } : null;
      }
    }
    const hasSub = Object.keys(subBody).length > 0;
    const hasMat = Object.keys(matBody).length > 0;
    if (!hasSub && !hasMat) {
      setFormError(t.noChanges);
      return null;
    }
    setFormError(null);
    return { sub: hasSub ? subBody : null, material: hasMat ? matBody : null };
  }

  const pending = React.useRef<ReturnType<typeof validate>>(null);
  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const payload = validate();
    if (!payload) return;
    if (sub.status === 'PUBLISHED') {
      pending.current = payload;
      setConfirmPublished(true);
    } else {
      save.mutate(payload);
    }
  }

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && guard.requestClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" data-testid="sub-module-sheet">
          <SheetHeader>
            <SheetTitle>{t.title}</SheetTitle>
            <SheetDescription className="break-words">
              {sub.sub_module_code} {sub.title}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onSubmit} noValidate className="grid gap-6 px-4 pb-6">
            <FormErrorSummary message={formError} />

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <ReviewStatusBadge status={sub.status} />
              <span className="text-muted-foreground">{fmt(t.versionNow, { n: sub.content_version })}</span>
              <Link
                href={`/admin/konten/revisi?tipe=SUB_MODULE&id=${sub.id}`}
                className="inline-flex min-h-8 items-center gap-1 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <History className="size-4" aria-hidden="true" />
                {t.revisions}
              </Link>
            </div>

            <section aria-labelledby="sub-blockers" className="grid gap-2">
              <h3 id="sub-blockers" className="text-sm font-semibold">
                {id.curation.blockers.title}
              </h3>
              <BlockersList blockers={detail.blockers} />
            </section>

            <section aria-labelledby="sub-basics" className="grid gap-4">
              <h3 id="sub-basics" className="text-sm font-semibold">
                {t.basics}
              </h3>
              <Field id="sub-title" label={t.fieldTitle} error={errors.title}>
                {(a) => <Input {...a} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="sub-order" label={t.fieldOrder} error={errors.order_index}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" min={1} value={order} onChange={(e) => setOrder(e.target.value)} />}
                </Field>
                <Field id="sub-passing" label={t.fieldPassing} hint={t.passingHint} error={errors.passing_score_percent}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={100} value={passing} onChange={(e) => setPassing(e.target.value)} />}
                </Field>
              </div>
            </section>

            <section aria-labelledby="sub-material" className="grid gap-4">
              <h3 id="sub-material" className="text-sm font-semibold">
                {t.material}
              </h3>
              {mat === null ? (
                <p className="text-sm text-muted-foreground">{t.noMaterial}</p>
              ) : (
                <>
                  <Field id="sub-article" label={t.article} hint={t.articleHint} error={errors.article_markdown}>
                    {(a) => <Textarea {...a} lang="id" rows={12} className="font-mono text-sm" value={article} onChange={(e) => setArticle(e.target.value)} />}
                  </Field>
                  <div className="grid gap-1.5">
                    <p className="text-sm font-medium">{t.preview}</p>
                    <div className="max-h-72 overflow-y-auto rounded-md border bg-[var(--color-surface-muted)] p-3" data-testid="article-preview">
                      {previewText.trim() ? <MarkdownArticle markdown={previewText} /> : <p className="text-sm text-muted-foreground">{t.previewEmpty}</p>}
                    </div>
                  </div>
                  <Field id="sub-attr" label={t.attribution} error={errors.attribution_text}>
                    {(a) => <Input {...a} value={attribution} maxLength={500} onChange={(e) => setAttribution(e.target.value)} />}
                  </Field>

                  <fieldset className="grid gap-3 rounded-md border p-3">
                    <legend className="px-1 text-sm font-semibold">{t.miniTask}</legend>
                    {mini === null ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm text-muted-foreground">{t.miniTaskNone}</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => setMini({ task_type: 'SELF_CHECK', prompt: '', ai_rubric_criteria: '' })}>
                          <Plus aria-hidden="true" />
                          {t.miniTaskAdd}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Field id="mini-type" label={t.miniType}>
                          {(a) => (
                            <NativeSelect {...a} value={mini.task_type} onChange={(e) => setMini({ ...mini, task_type: e.target.value as MiniTask['task_type'] })}>
                              {MINI_TYPES.map((m) => (
                                <option key={m} value={m}>
                                  {t.miniTypes[m]}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        </Field>
                        <Field id="mini-prompt" label={t.miniPrompt} error={errors.mini_prompt}>
                          {(a) => <Textarea {...a} rows={3} value={mini.prompt} onChange={(e) => setMini({ ...mini, prompt: e.target.value })} />}
                        </Field>
                        <Field id="mini-rubric" label={t.miniRubric} error={errors.mini_rubric}>
                          {(a) => <Textarea {...a} rows={3} value={mini.ai_rubric_criteria} onChange={(e) => setMini({ ...mini, ai_rubric_criteria: e.target.value })} />}
                        </Field>
                        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setMini(null)}>
                          <Trash2 aria-hidden="true" />
                          {t.miniTaskRemove}
                        </Button>
                      </>
                    )}
                  </fieldset>
                </>
              )}
            </section>

            {mat && (mat.videos.length > 0 || mat.slides.length > 0 || mat.attachments.length > 0) ? (
              <section aria-labelledby="sub-assets" className="grid gap-3">
                <h3 id="sub-assets" className="text-sm font-semibold">
                  {t.assets}
                </h3>
                <p className="text-sm text-muted-foreground">{t.assetsReadonly}</p>
                <ul className="grid gap-2" aria-label={t.videos}>
                  {mat.videos.map((v) => (
                    <AssetLine key={`v-${v.asset_id}`} assetId={v.asset_id} title={v.title} rights={v.rights_status} extra={t.videos} />
                  ))}
                  {mat.slides.map((s) => (
                    <AssetLine key={`s-${s.asset_id}`} assetId={s.asset_id} title={s.caption} rights={s.rights_status} extra={`${t.slides} ${s.order}`} />
                  ))}
                  {mat.attachments.map((a) => (
                    <AssetLine key={`a-${a.asset_id}`} assetId={a.asset_id} title={a.title} rights={a.rights_status} extra={`${t.attachments}, ${a.file_type}`} />
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="sub-drill" className="grid gap-2">
              <h3 id="sub-drill" className="text-sm font-semibold">
                {t.drillSet}
              </h3>
              {detail.drill ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <ReviewStatusBadge status={detail.drill.status} />
                  {detail.drill.question_count !== undefined ? <span>{fmt(id.curation.curriculum.questionsCount, { n: detail.drill.question_count })}</span> : null}
                  <Link href={`/admin/konten/soal/${detail.drill.id}`} className="font-medium underline underline-offset-2">
                    {id.curation.curriculum.openSet}
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.noDrill}</p>
              )}
            </section>

            <Button type="submit" loading={save.isPending} disabled={!dirty}>
              {t.save}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
      {guard.dialog}
      <ConfirmDialog
        open={confirmPublished}
        onOpenChange={setConfirmPublished}
        title={t.confirmTitle}
        body={t.confirmBody}
        confirmLabel={t.confirmAction}
        pending={save.isPending}
        onConfirm={() => pending.current && save.mutate(pending.current)}
      />
    </>
  );
}

/** Sheet sunting sub-modul: metadata + materi (artikel, atribusi, Mini-Task) + penghalang + aset baca-saja. */
export function SubModuleSheet({ subModuleId, onClose }: { subModuleId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['admin', 'curation-sub-module', subModuleId],
    queryFn: ({ signal }) => curationApi.subModule(subModuleId as string, signal),
    enabled: subModuleId !== null,
  });
  if (subModuleId === null) return null;
  if (q.data) {
    return <SubModuleForm key={`${q.data.sub_module.id}-${q.data.sub_module.content_version}`} detail={q.data} onClose={onClose} />;
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription>{id.common.loading}</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          {q.isError ? (
            <ErrorState title={t.loadFailed} onRetry={() => void q.refetch()} />
          ) : (
            <div className="grid gap-3" role="status" aria-label={id.common.loading}>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
