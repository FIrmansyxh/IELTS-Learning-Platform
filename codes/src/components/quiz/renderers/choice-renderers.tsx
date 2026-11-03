'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import { letter, type RendererProps } from '../answer-utils';

/** MCQ_SINGLE / MCQ_MULTI: kartu radio/checkbox min 56px, huruf A-D = posisi tampil. */
export function McqRenderer({ question, value, onChange, disabled, feedback }: RendererProps) {
  const options = question.options ?? [];
  const multi = question.question_type === 'MCQ_MULTI';
  const selected = new Set(value && 'option_ids' in value ? value.option_ids : []);
  const limit = multi ? (question.choose_count ?? options.length) : 1;
  const correctTexts = new Set(feedback?.correct_answer.display ?? []);

  const toggle = (optionId: string) => {
    if (disabled) return;
    if (!multi) {
      onChange({ option_ids: [optionId] });
      return;
    }
    const next = new Set(selected);
    if (next.has(optionId)) next.delete(optionId);
    else if (next.size < limit) next.add(optionId);
    onChange(next.size ? { option_ids: [...next] } : null);
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {multi ? fmt(id.quiz.chooseN, { n: question.choose_count ?? 1 }) : id.quiz.selectOne}
      </p>
      <div role={multi ? 'group' : 'radiogroup'} aria-label={question.prompt} className="grid gap-3">
        {options.map((o, i) => {
          const checked = selected.has(o.option_id);
          const isCorrect = feedback ? correctTexts.has(o.text) : false;
          const isWrongPick = feedback ? checked && !isCorrect : false;
          const full = multi && !checked && selected.size >= limit;
          return (
            <label
              key={o.option_id}
              className={cn(
                'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                checked && !feedback && 'border-primary bg-accent',
                isCorrect && 'border-[var(--color-done)] bg-[color-mix(in_srgb,var(--color-done)_10%,var(--color-surface))]',
                isWrongPick && 'border-destructive bg-[color-mix(in_srgb,var(--color-error)_8%,var(--color-surface))]',
                (disabled || full) && 'cursor-not-allowed opacity-80',
              )}
            >
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={`q-${question.question_id}`}
                checked={checked}
                disabled={disabled || full}
                onChange={() => toggle(o.option_id)}
                className="size-5 shrink-0 accent-[var(--color-primary)]"
              />
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-content-center rounded-full bg-muted text-sm font-semibold"
              >
                {letter(i)}
              </span>
              <span lang="en" className="flex-1 text-base">
                {o.text}
              </span>
              {isCorrect ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-done-text)]">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {id.quiz.correctAnswer}
                </span>
              ) : null}
              {isWrongPick ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-destructive">
                  <XCircle className="size-4" aria-hidden="true" />
                  {id.quiz.yourPick}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** TFNG / YNNG: tiga tombol segmented sama lebar; istilah tetap Inggris dengan bantuan Indonesia. */
export function TriChoiceRenderer({ question, value, onChange, disabled }: RendererProps) {
  const choices = question.fixed_choices ?? [];
  const current = value && 'choice' in value ? value.choice : null;
  return (
    <div role="radiogroup" aria-label={question.prompt} className="grid grid-cols-3 gap-2">
      {choices.map((c) => {
        const checked = current === c;
        const help = id.quiz.tfngHelp[c];
        const label = (
          <label
            className={cn(
              'flex min-h-14 cursor-pointer items-center justify-center rounded-lg border bg-card px-2 text-center text-sm font-semibold transition-colors sm:text-base',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
              checked && 'border-primary bg-accent',
              disabled && 'cursor-not-allowed opacity-80',
            )}
          >
            <input
              type="radio"
              name={`q-${question.question_id}`}
              value={c}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange({ choice: c })}
              className="sr-only"
              aria-describedby={help ? `help-${question.question_id}-${c.replace(/\s/g, '')}` : undefined}
            />
            <span lang="en">{c}</span>
          </label>
        );
        return help ? (
          <Tooltip key={c}>
            <TooltipTrigger asChild>{label}</TooltipTrigger>
            <TooltipContent>{help}</TooltipContent>
          </Tooltip>
        ) : (
          <div key={c}>{label}</div>
        );
      })}
      {choices.map((c) => {
        const help = id.quiz.tfngHelp[c];
        return help ? (
          <span key={c} id={`help-${question.question_id}-${c.replace(/\s/g, '')}`} className="sr-only">
            {help}
          </span>
        ) : null;
      })}
    </div>
  );
}
