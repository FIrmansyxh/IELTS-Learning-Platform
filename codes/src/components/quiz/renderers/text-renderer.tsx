'use client';

import { AlertTriangle } from 'lucide-react';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { fmt, id } from '@/i18n/id';
import { wordCount, type RendererProps } from '../answer-utils';

/** FILL_IN_BLANK / SHORT_ANSWER: input + penghitung kata live; melebihi batas hanya memberi peringatan (server menilai). */
export function TextRenderer({ question, value, onChange, disabled }: RendererProps) {
  const text = value && 'text' in value ? value.text : '';
  const max = question.max_words;
  const words = wordCount(text);
  const over = max !== null && words > max;
  const uid = React.useId();
  const helpId = `${uid}-help`;
  const errId = `${uid}-err`;
  return (
    <div className="grid gap-2">
      <label htmlFor={`${uid}-input`} className="text-sm font-medium">
        {id.quiz.answerLabel}
      </label>
      <Input
        id={`${uid}-input`}
        lang="en"
        value={text}
        maxLength={200}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-describedby={`${helpId}${over ? ` ${errId}` : ''}`}
        aria-invalid={over || undefined}
        onChange={(e) => onChange(e.target.value.length ? { text: e.target.value } : null)}
      />
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <p id={helpId}>{max !== null ? fmt(id.quiz.maxWords, { n: max }) : ''}</p>
        <p aria-hidden="true">{fmt(id.quiz.wordCount, { n: words })}</p>
      </div>
      {over ? (
        <p id={errId} role="alert" className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          {fmt(id.quiz.wordOver, { n: max ?? 0 })}
        </p>
      ) : null}
    </div>
  );
}
