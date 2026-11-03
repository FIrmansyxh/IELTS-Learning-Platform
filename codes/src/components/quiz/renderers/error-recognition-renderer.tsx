'use client';

import { AlertTriangle } from 'lucide-react';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import type { RendererProps } from '../answer-utils';

const MAX_MARKS = 3;

/** ERROR_RECOGNITION: ketuk kata yang salah. Penanda = garis bawah bergelombang + ikon + teks "Ditandai". */
export function ErrorRecognitionRenderer({ question, value, onChange, disabled }: RendererProps) {
  const tokens = question.tokens ?? [];
  const marked = new Set(value && 'token_indexes' in value ? value.token_indexes : []);

  const toggle = (index: number) => {
    if (disabled) return;
    const next = new Set(marked);
    if (next.has(index)) next.delete(index);
    else if (next.size < MAX_MARKS) next.add(index);
    onChange(next.size ? { token_indexes: [...next].sort((a, b) => a - b) } : null);
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{fmt(id.quiz.errorRec.help, { n: MAX_MARKS })}</p>
      <ul lang="en" aria-label={id.quiz.errorRec.tokens} className="flex flex-wrap gap-x-1 gap-y-2 text-lg leading-10">
        {tokens.map((t) => {
          const on = marked.has(t.index);
          return (
            <li key={t.index}>
              <button
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(t.index)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1 rounded-md px-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
                  on && 'bg-accent font-semibold underline decoration-destructive decoration-wavy decoration-2 underline-offset-4',
                )}
              >
                {on ? <AlertTriangle className="size-4 text-destructive" aria-hidden="true" /> : null}
                <span>{t.text}</span>
                {on ? <span className="sr-only">{id.quiz.errorRec.marked}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
