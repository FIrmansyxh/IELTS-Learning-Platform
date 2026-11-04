'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { curationApi } from '@/lib/api/curation';
import type { AdminQuestion, UpdateQuestionRequest } from '@/lib/api/curation-contract';
import { apiErrorMessage, detailMessage } from '@/lib/api/errors';
import { Field, NativeSelect, Textarea } from './fields';
import {
  AI_QUESTION_TYPES,
  fromLines,
  isType,
  MATCH_TYPES,
  MCQ_TYPES,
  parseIndexes,
  sameJson,
  TEXT_TYPES,
  TFNG_CHOICES,
  toLines,
  toPreviewQuestion,
  YNNG_CHOICES,
} from './question-model';
import { useDiscardGuard } from './use-discard-guard';

const t = id.curation.question;
const noop = () => undefined;

function intOrNull(v: string): number | null | 'bad' {
  const s = v.trim();
  if (s === '') return null;
  return /^-?\d+$/.test(s) ? Number(s) : 'bad';
}

function QuestionForm({
  setId,
  question: q,
  locked,
  onLocked,
  onClose,
}: {
  setId: string;
  question: AdminQuestion;
  locked: boolean;
  onLocked: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isAi = isType(q, AI_QUESTION_TYPES);
  const isMcq = isType(q, MCQ_TYPES);
  const isText = isType(q, TEXT_TYPES);
  const isMatch = isType(q, MATCH_TYPES);
  const isTf = q.question_type === 'TFNG' || q.question_type === 'YNNG';

  const origOptions = q.options ?? [];
  const origCorrectText = (q.correct_answers ?? []).map(String);
  const [prompt, setPrompt] = React.useState(q.prompt);
  const [explanation, setExplanation] = React.useState(q.explanation_id ?? '');
  const [points, setPoints] = React.useState(String(q.points ?? 1));
  const [target, setTarget] = React.useState(q.target_time_ms == null ? '' : String(q.target_time_ms));
  const [difficulty, setDifficulty] = React.useState(q.difficulty == null ? '' : String(q.difficulty));
  const [passageNo, setPassageNo] = React.useState(q.passage_no == null ? '' : String(q.passage_no));
  const [sectionNo, setSectionNo] = React.useState(q.section_no == null ? '' : String(q.section_no));
  const [optionsText, setOptionsText] = React.useState(fromLines(origOptions));
  const [correctIdx, setCorrectIdx] = React.useState<number[]>(() =>
    origOptions.flatMap((o, i) => (origCorrectText.includes(o) ? [i] : [])),
  );
  const [answersText, setAnswersText] = React.useState(fromLines(origCorrectText));
  const [tfAnswer, setTfAnswer] = React.useState(origCorrectText[0] ?? '');
  const [maxWords, setMaxWords] = React.useState(q.max_words == null ? '' : String(q.max_words));
  const [leftText, setLeftText] = React.useState(fromLines(q.matching?.left));
  const [rightText, setRightText] = React.useState(fromLines(q.matching?.right));
  const [indexesText, setIndexesText] = React.useState((q.correct_answers ?? []).join(', '));
  const [segmentsText, setSegmentsText] = React.useState(fromLines(q.segments));
  const [tokensText, setTokensText] = React.useState(fromLines(q.tokens));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const options = toLines(optionsText);

  /** Hitung body PATCH (hanya field yang berubah) dan galat klien. */
  function build(): { body: UpdateQuestionRequest; errs: Record<string, string> } {
    const errs: Record<string, string> = {};
    const body: UpdateQuestionRequest = {};
    const range = id.fieldErrors.out_of_range!;

    const p = prompt.trim();
    if (p.length < 1) errs.prompt = t.promptRequired;
    else if (p.length > 2000) errs.prompt = range;
    else if (p !== q.prompt) body.prompt = p;

    const ex = explanation.trim();
    if (!isAi || ex !== '') {
      if (ex.length < 1 || ex.length > 2000) errs.explanation_id = range;
      else if (ex !== (q.explanation_id ?? '')) body.explanation_id = ex;
    }
    if (isAi) return { body, errs };

    const pts = intOrNull(points);
    if (pts === null || pts === 'bad' || pts < 1 || pts > 20) errs.points = range;
    else if (pts !== (q.points ?? 1)) body.points = pts;

    const opt = (raw: string, orig: number | null | undefined, key: string, lo: number, hi: number, nullable: boolean) => {
      const v = intOrNull(raw);
      if (v === 'bad') errs[key] = t.numberInvalid;
      else if (v === null) {
        if (!nullable) errs[key] = range;
        else if (orig != null) body[key] = null;
      } else if (v < lo || v > hi) errs[key] = range;
      else if (v !== orig) body[key] = v;
    };
    opt(target, q.target_time_ms, 'target_time_ms', 1000, 600000, true);
    opt(difficulty, q.difficulty, 'difficulty', 1, 5, true);
    opt(passageNo, q.passage_no, 'passage_no', 1, 3, true);
    opt(sectionNo, q.section_no, 'section_no', 1, 4, true);

    if (isMcq) {
      if (options.some((o) => o === '')) errs.options = t.linesInvalid;
      const picked = correctIdx.filter((i) => i < options.length).map((i) => options[i]!);
      if (picked.length === 0) errs.correct_answers = t.correctRequired;
      if (!errs.options && !sameJson(options, origOptions)) body.options = options;
      if (!errs.correct_answers && !sameJson(picked, origCorrectText)) body.correct_answers = picked;
      // Opsi berubah dan jawaban benar mengikuti indeks: kirim keduanya agar server memvalidasi silang.
      if (body.options && !body.correct_answers && !errs.correct_answers) body.correct_answers = picked;
    } else if (isTf) {
      if (tfAnswer !== (origCorrectText[0] ?? '')) body.correct_answers = [tfAnswer];
    } else if (isText) {
      const lines = toLines(answersText);
      if (lines.length === 0 || lines.some((l) => l === '')) errs.correct_answers = t.linesInvalid;
      else if (!sameJson(lines, origCorrectText)) body.correct_answers = lines;
      const mw = intOrNull(maxWords);
      if (mw === 'bad') errs.max_words = t.numberInvalid;
      else if (mw === null) {
        if (q.question_type === 'SHORT_ANSWER') errs.max_words = range;
        else if (q.max_words != null) body.max_words = null;
      } else if (mw < 1 || mw > 10) errs.max_words = range;
      else if (mw !== q.max_words) body.max_words = mw;
    } else if (isMatch) {
      const left = toLines(leftText);
      const right = toLines(rightText);
      if (left.some((l) => l === '') || right.some((l) => l === '')) errs.matching = t.linesInvalid;
      const idx = parseIndexes(indexesText);
      if (idx === null) errs.correct_answers = t.indexesInvalid;
      if (!errs.matching) {
        const m = { left, right, allow_reuse: q.matching?.allow_reuse ?? false };
        if (!sameJson({ left: q.matching?.left, right: q.matching?.right }, { left, right })) body.matching = m;
      }
      if (idx && !sameJson(idx, q.correct_answers)) body.correct_answers = idx;
    } else if (q.question_type === 'SENTENCE_REORDER') {
      const segs = toLines(segmentsText);
      if (segs.some((l) => l === '')) errs.segments = t.linesInvalid;
      else if (!sameJson(segs, q.segments)) body.segments = segs;
    } else if (q.question_type === 'ERROR_RECOGNITION') {
      const toks = toLines(tokensText);
      if (toks.some((l) => l === '')) errs.tokens = t.linesInvalid;
      else if (!sameJson(toks, q.tokens)) body.tokens = toks;
      const idx = parseIndexes(indexesText);
      if (idx === null) errs.correct_answers = t.indexesInvalid;
      else if (!sameJson(idx, q.correct_answers)) body.correct_answers = idx;
    }
    return { body, errs };
  }

  const current = JSON.stringify([prompt, explanation, points, target, difficulty, passageNo, sectionNo, optionsText, correctIdx, answersText, tfAnswer, maxWords, leftText, rightText, indexesText, segmentsText, tokensText]);
  const [initialSnapshot] = React.useState(current);
  const dirty = current !== initialSnapshot;
  const guard = useDiscardGuard(dirty, onClose, { title: t.discardTitle, body: t.discardBody, action: t.discardAction });

  const save = useMutation({
    mutationFn: (body: UpdateQuestionRequest) => curationApi.updateQuestion(setId, q.question_id, body),
    onSuccess: (res) => {
      toast.success(fmt(t.saved, { n: res.set.version }));
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-set', setId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-quality', setId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-sets'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curriculum'] });
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'SET_HAS_ACTIVE_ATTEMPTS') {
        onLocked();
        setFormError(apiErrorMessage(e));
        return;
      }
      const next: Record<string, string> = {};
      if (isApiError(e)) {
        for (const d of e.details) {
          const root = d.path.split('.')[0]?.replace(/\[\d+\]/, '') ?? '';
          next[root] = detailMessage(d.code, d.message);
        }
      }
      setErrors(next);
      setFormError(Object.keys(next).length > 0 ? t.errorSummary : apiErrorMessage(e));
    },
  });

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const { body, errs } = build();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setFormError(t.errorSummary);
      return;
    }
    if (Object.keys(body).length === 0) {
      setFormError(t.noChanges);
      return;
    }
    setFormError(null);
    save.mutate(body);
  }

  const previewQ = React.useMemo(
    () =>
      toPreviewQuestion(q, {
        prompt,
        options,
        correctCount: correctIdx.filter((i) => i < options.length).length,
        maxWords: intOrNull(maxWords) === 'bad' ? null : (intOrNull(maxWords) as number | null),
        left: toLines(leftText).filter(Boolean),
        right: toLines(rightText).filter(Boolean),
        allowReuse: q.matching?.allow_reuse ?? false,
        segments: toLines(segmentsText).filter(Boolean),
        tokens: toLines(tokensText).filter(Boolean),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `options` diturunkan dari optionsText
    [q, prompt, optionsText, correctIdx, maxWords, leftText, rightText, segmentsText, tokensText],
  );

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && guard.requestClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" data-testid="question-sheet">
          <SheetHeader>
            <SheetTitle>{t.title}</SheetTitle>
            <SheetDescription className="break-words">
              <code className="font-mono">{q.question_id}</code> · {q.question_type} · {q.skill}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onSubmit} noValidate className="grid gap-5 px-4 pb-6">
            <FormErrorSummary message={locked ? id.curation.setDetail.locked : formError} />
            <p className="text-sm text-muted-foreground">{isAi ? t.aiOnlyNote : t.readonlyNote}</p>

            <Field id="q-prompt" label={t.fieldPrompt} error={errors.prompt}>
              {(a) => <Textarea {...a} lang="en" rows={3} disabled={locked} value={prompt} onChange={(e) => setPrompt(e.target.value)} />}
            </Field>

            {isMcq ? (
              <>
                <Field id="q-options" label={t.fieldOptions} error={errors.options}>
                  {(a) => <Textarea {...a} lang="en" rows={5} disabled={locked} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />}
                </Field>
                <fieldset className="grid gap-2" aria-describedby={errors.correct_answers ? 'q-correct-err' : undefined}>
                  <legend className="mb-1 text-sm font-medium">
                    {t.fieldCorrect} <span className="font-normal text-muted-foreground">({t.correctMcqHint})</span>
                  </legend>
                  {options.map((o, i) => {
                    const checked = correctIdx.includes(i);
                    const cid = `q-correct-${i}`;
                    return (
                      <div key={i} className="flex min-h-11 items-center gap-3 rounded-md border p-2">
                        {q.question_type === 'MCQ_MULTI' ? (
                          <Checkbox
                            id={cid}
                            disabled={locked}
                            checked={checked}
                            onCheckedChange={(c) => setCorrectIdx((cur) => (c === true ? [...cur, i] : cur.filter((x) => x !== i)))}
                          />
                        ) : (
                          <input
                            id={cid}
                            type="radio"
                            name="q-correct"
                            disabled={locked}
                            checked={checked}
                            onChange={() => setCorrectIdx([i])}
                            className="size-4 accent-[var(--color-primary)]"
                          />
                        )}
                        <Label htmlFor={cid} lang="en" className="flex-1 font-normal break-words">
                          {o || `(${i + 1})`}
                        </Label>
                      </div>
                    );
                  })}
                  {errors.correct_answers ? (
                    <p id="q-correct-err" role="alert" className="text-sm text-destructive">
                      {errors.correct_answers}
                    </p>
                  ) : null}
                </fieldset>
              </>
            ) : null}

            {isTf ? (
              <Field id="q-tf" label={t.fieldCorrect} error={errors.correct_answers}>
                {(a) => (
                  <NativeSelect {...a} disabled={locked} value={tfAnswer} onChange={(e) => setTfAnswer(e.target.value)}>
                    {(q.question_type === 'TFNG' ? TFNG_CHOICES : YNNG_CHOICES).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            ) : null}

            {isText ? (
              <>
                <Field id="q-answers" label={t.fieldCorrect} hint={t.correctTextHint} error={errors.correct_answers}>
                  {(a) => <Textarea {...a} lang="en" rows={3} disabled={locked} value={answersText} onChange={(e) => setAnswersText(e.target.value)} />}
                </Field>
                <Field id="q-maxwords" label={t.fieldMaxWords} error={errors.max_words}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={10} disabled={locked} value={maxWords} onChange={(e) => setMaxWords(e.target.value)} />}
                </Field>
              </>
            ) : null}

            {isMatch ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="q-left" label={t.fieldLeft} error={errors.matching}>
                    {(a) => <Textarea {...a} lang="en" rows={5} disabled={locked} value={leftText} onChange={(e) => setLeftText(e.target.value)} />}
                  </Field>
                  <Field id="q-right" label={t.fieldRight}>
                    {(a) => <Textarea {...a} lang="en" rows={5} disabled={locked} value={rightText} onChange={(e) => setRightText(e.target.value)} />}
                  </Field>
                </div>
                <Field id="q-idx" label={t.correctIndexes} error={errors.correct_answers}>
                  {(a) => <Input {...a} inputMode="numeric" disabled={locked} value={indexesText} onChange={(e) => setIndexesText(e.target.value)} />}
                </Field>
              </>
            ) : null}

            {q.question_type === 'SENTENCE_REORDER' ? (
              <Field id="q-seg" label={t.fieldSegments} error={errors.segments}>
                {(a) => <Textarea {...a} lang="en" rows={5} disabled={locked} value={segmentsText} onChange={(e) => setSegmentsText(e.target.value)} />}
              </Field>
            ) : null}

            {q.question_type === 'ERROR_RECOGNITION' ? (
              <>
                <Field id="q-tokens" label={t.fieldTokens} error={errors.tokens}>
                  {(a) => <Textarea {...a} lang="en" rows={6} disabled={locked} value={tokensText} onChange={(e) => setTokensText(e.target.value)} />}
                </Field>
                <Field id="q-idx" label={t.correctIndexes} error={errors.correct_answers}>
                  {(a) => <Input {...a} inputMode="numeric" disabled={locked} value={indexesText} onChange={(e) => setIndexesText(e.target.value)} />}
                </Field>
              </>
            ) : null}

            <Field id="q-expl" label={t.fieldExplanation} error={errors.explanation_id}>
              {(a) => <Textarea {...a} lang="id" rows={4} disabled={locked} value={explanation} onChange={(e) => setExplanation(e.target.value)} />}
            </Field>

            {!isAi ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="q-points" label={t.fieldPoints} error={errors.points}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={20} disabled={locked} value={points} onChange={(e) => setPoints(e.target.value)} />}
                </Field>
                <Field id="q-target" label={t.fieldTarget} hint={t.optionalHint} error={errors.target_time_ms}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" disabled={locked} value={target} onChange={(e) => setTarget(e.target.value)} />}
                </Field>
                <Field id="q-diff" label={t.fieldDifficulty} error={errors.difficulty}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={5} disabled={locked} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} />}
                </Field>
                <Field id="q-passage" label={t.fieldPassageNo} error={errors.passage_no}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={3} disabled={locked} value={passageNo} onChange={(e) => setPassageNo(e.target.value)} />}
                </Field>
                <Field id="q-section" label={t.fieldSectionNo} error={errors.section_no}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={4} disabled={locked} value={sectionNo} onChange={(e) => setSectionNo(e.target.value)} />}
                </Field>
              </div>
            ) : null}

            <section aria-labelledby="q-preview-title" className="grid gap-2">
              <h3 id="q-preview-title" className="text-sm font-semibold">
                {t.preview}
              </h3>
              <p className="text-sm text-muted-foreground">{t.previewNote}</p>
              <div inert className="pointer-events-none rounded-md border bg-[var(--color-surface-muted)] p-3" data-testid="question-preview" lang="en">
                <QuestionRenderer question={previewQ} value={null} onChange={noop} disabled feedback={null} />
              </div>
            </section>

            <Button type="submit" loading={save.isPending} disabled={locked || !dirty}>
              {t.save}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
      {guard.dialog}
    </>
  );
}

/** Sheet sunting satu soal (field sesuai tipe). `question_type`, `skill`, dan `question_id` tidak dapat diubah. */
export function QuestionSheet({
  setId,
  question,
  locked,
  onLocked,
  onClose,
}: {
  setId: string;
  question: AdminQuestion | null;
  locked: boolean;
  onLocked: () => void;
  onClose: () => void;
}) {
  if (!question) return null;
  return <QuestionForm key={question.question_id} setId={setId} question={question} locked={locked} onLocked={onLocked} onClose={onClose} />;
}
