'use client';

import { Info } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fmt, id } from '@/i18n/id';
import { SPEAKING_CRITERIA, WRITING_CRITERIA } from '@/lib/api/ai-contract';
import { formatBand } from '@/components/band/band-display';

const BANDS = Array.from({ length: 19 }, (_, i) => i * 0.5);

/** Form self-assessment: satu Select band 0-9 (langkah 0,5) per kriteria; skor akhir dihitung server. */
export function SelfAssessmentForm({
  speaking,
  pending,
  onSubmit,
  onCancel,
}: {
  speaking: boolean;
  pending: boolean;
  onSubmit: (scores: Record<string, number>) => void;
  onCancel: () => void;
}) {
  const keys: readonly string[] = speaking ? SPEAKING_CRITERIA : WRITING_CRITERIA;
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [showErr, setShowErr] = React.useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (keys.some((k) => values[k] === undefined)) {
      setShowErr(true);
      return;
    }
    onSubmit(Object.fromEntries(keys.map((k) => [k, Number(values[k])])));
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="self-title">
      <div className="grid gap-1">
        <h3 id="self-title" className="text-lg font-semibold">
          {id.ai.self.title}
        </h3>
        <p className="text-sm text-muted-foreground">{id.ai.self.intro}</p>
      </div>
      {showErr ? (
        <p role="alert" className="text-sm text-destructive">
          {id.ai.self.pickAll}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {keys.map((k) => {
          const name = id.ai.self.criteriaNames[k] ?? k;
          const desc = id.ai.self.descriptors[k];
          return (
            <div key={k} className="grid gap-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`self-${k}`}>{name}</Label>
                {desc ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={fmt(id.ai.self.descriptorLabel, { name })}
                        className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <Info className="size-4" aria-hidden="true" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-xs text-sm">
                      <p className="font-semibold">{fmt(id.ai.self.descriptorTitle, { name })}</p>
                      <ul className="mt-1 grid gap-0.5">
                        {[5, 6, 7].map((b) => (
                          <li key={b}>
                            <span className="font-semibold tabular-nums">Band {b}:</span> {desc[b]}
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
              <Select value={values[k]} onValueChange={(v) => setValues((p) => ({ ...p, [k]: v }))}>
                <SelectTrigger id={`self-${k}`} className="w-full" aria-label={fmt(id.ai.self.bandLabel, { name })} aria-invalid={showErr && values[k] === undefined}>
                  <SelectValue placeholder="Band" />
                </SelectTrigger>
                <SelectContent>
                  {BANDS.map((b) => (
                    <SelectItem key={b} value={String(b)}>
                      {formatBand(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          {pending ? id.ai.self.submitting : id.ai.self.submit}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {id.ai.self.cancel}
        </Button>
      </div>
    </form>
  );
}
