'use client';

import { ArrowDown, ArrowRight, Check, CircleHelp, RotateCcw, X } from 'lucide-react';
import * as React from 'react';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import type { BlockName } from './markdown-enhance';

/** Pecah "Judul | isi | ..." menjadi bagian-bagian terpangkas. */
const cols = (line: string): string[] => line.split('|').map((s) => s.trim());
const nonEmpty = (lines: string[]): string[] => lines.map((l) => l.trim()).filter(Boolean);

const T = id.player.interactive;

function Figure({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <figure aria-label={label} className={cn('my-5 w-full max-w-none rounded-xl border bg-card/60 p-4', className)}>
      {children}
    </figure>
  );
}

/* ---------------------------------------------------------------- flow: Judul | Deskripsi */

function Flow({ lines }: { lines: string[] }) {
  const steps = nonEmpty(lines).map(cols);
  return (
    <Figure label={T.diagram}>
      <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
        {steps.map(([title, desc], i) => (
          <React.Fragment key={i}>
            <li className="flex flex-1 flex-col gap-1 rounded-lg border bg-background p-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground" aria-hidden="true">
                  {i + 1}
                </span>
                {title}
              </span>
              {desc ? <span className="text-sm text-muted-foreground">{desc}</span> : null}
            </li>
            {i < steps.length - 1 ? (
              <span aria-hidden="true" className="flex items-center justify-center text-muted-foreground">
                <ArrowRight className="hidden size-5 md:block" />
                <ArrowDown className="size-5 md:hidden" />
              </span>
            ) : null}
          </React.Fragment>
        ))}
      </ol>
    </Figure>
  );
}

/* ---------------------------------------------------------------- layers: Judul | Deskripsi */

function Layers({ lines }: { lines: string[] }) {
  const rows = nonEmpty(lines).map(cols);
  return (
    <Figure label={T.diagram}>
      <ol className="grid gap-2">
        {rows.map(([title, desc], i) => (
          <li
            key={i}
            className="grid gap-1 rounded-lg border p-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-4"
            style={{ background: `color-mix(in srgb, var(--primary) ${Math.max(6, 20 - i * 3)}%, var(--card))` }}
          >
            <span className="text-sm font-semibold">{title}</span>
            {desc ? <span className="text-sm text-muted-foreground">{desc}</span> : null}
          </li>
        ))}
      </ol>
    </Figure>
  );
}

/* ---------------------------------------------------------------- compare: Judul | butir; butir; butir */

function Compare({ lines }: { lines: string[] }) {
  const cards = nonEmpty(lines).map(cols);
  return (
    <Figure label={T.diagram}>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 14rem), 1fr))` }}
      >
        {cards.map(([title, items], i) => (
          <div key={i} className="rounded-lg border bg-background p-3">
            <p className="mb-2 text-sm font-semibold text-primary">{title}</p>
            <ul className="grid gap-1 text-sm">
              {(items ?? '')
                .split(';')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((it, k) => (
                  <li key={k} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-done-text)]" aria-hidden="true" />
                    <span>{it}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* ---------------------------------------------------------------- timeline: Label | posisi | contoh */

type Pos = 'past' | 'now' | 'future' | 'past-now' | 'now-future' | 'habit' | 'always';
const TRACK: Record<Pos, { kind: 'dot' | 'bar' | 'dots'; from: number; to: number }> = {
  past: { kind: 'dot', from: 18, to: 18 },
  now: { kind: 'dot', from: 50, to: 50 },
  future: { kind: 'dot', from: 82, to: 82 },
  'past-now': { kind: 'bar', from: 14, to: 50 },
  'now-future': { kind: 'bar', from: 50, to: 86 },
  habit: { kind: 'dots', from: 30, to: 70 },
  always: { kind: 'bar', from: 6, to: 94 },
};

function Timeline({ lines }: { lines: string[] }) {
  const rows = nonEmpty(lines).map(cols);
  return (
    <Figure label={T.timeline}>
      <div className="mb-2 grid grid-cols-3 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
        <span className="text-left">← {T.past}</span>
        <span>{T.now}</span>
        <span className="text-right">{T.future} →</span>
      </div>
      <ul className="grid gap-3">
        {rows.map(([label, pos, desc], i) => {
          const t = TRACK[(pos as Pos) in TRACK ? (pos as Pos) : 'now'];
          return (
            <li key={i} className="grid gap-1 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center sm:gap-4">
              <div>
                <p className="text-sm font-semibold">{label}</p>
                {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
              </div>
              <div className="relative h-9 rounded-md bg-muted" role="img" aria-label={`${label}: ${pos}`}>
                <span aria-hidden="true" className="absolute inset-y-0 left-[40%] w-px bg-border" />
                <span aria-hidden="true" className="absolute inset-y-0 left-[60%] w-px bg-border" />
                {t.kind === 'bar' ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-primary"
                    style={{ left: `${t.from}%`, width: `${t.to - t.from}%` }}
                  />
                ) : null}
                {t.kind === 'dot' ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20"
                    style={{ left: `${t.from}%` }}
                  />
                ) : null}
                {t.kind === 'dots'
                  ? [0, 1, 2, 3, 4].map((k) => (
                      <span
                        key={k}
                        aria-hidden="true"
                        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                        style={{ left: `${t.from + ((t.to - t.from) / 4) * k}%` }}
                      />
                    ))
                  : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Figure>
  );
}

/* ---------------------------------------------------------------- flip: Depan | Belakang */

function Flip({ lines }: { lines: string[] }) {
  const cards = nonEmpty(lines).map(cols);
  const [open, setOpen] = React.useState<Set<number>>(new Set());
  return (
    <Figure label={T.flashcards}>
      <p className="mb-3 text-sm text-muted-foreground">{T.flipHint}</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))' }}>
        {cards.map(([front, back], i) => {
          const flipped = open.has(i);
          return (
            <button
              key={i}
              type="button"
              aria-pressed={flipped}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
              className={cn(
                'min-h-24 rounded-lg border p-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                flipped ? 'border-primary bg-primary/10' : 'bg-background hover:bg-accent',
              )}
            >
              <span className="block text-xs font-medium text-muted-foreground">{flipped ? T.back : T.front}</span>
              <span className={cn('mt-1 block', !flipped && 'font-semibold')}>{flipped ? back : front}</span>
            </button>
          );
        })}
      </div>
    </Figure>
  );
}

/* ---------------------------------------------------------------- quiz: Q| o| c| e| */

function Quiz({ lines }: { lines: string[] }) {
  const L = nonEmpty(lines);
  const question = (L.find((l) => /^Q\|/.test(l)) ?? L[0] ?? '').replace(/^Q\|\s*/, '');
  const options = L.filter((l) => /^[oc]\|/.test(l)).map((l) => ({ text: l.replace(/^[oc]\|\s*/, ''), correct: l.startsWith('c|') }));
  const explanation = (L.find((l) => /^e\|/.test(l)) ?? '').replace(/^e\|\s*/, '');
  const [picked, setPicked] = React.useState<number | null>(null);
  const done = picked !== null;
  return (
    <Figure label={T.quiz}>
      <p className="mb-3 flex items-start gap-2 text-sm font-semibold">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        {question}
      </p>
      <div className="grid gap-2" role="group" aria-label={T.options}>
        {options.map((o, i) => {
          const chosen = picked === i;
          return (
            <button
              key={i}
              type="button"
              disabled={done}
              aria-pressed={chosen}
              onClick={() => setPicked(i)}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !done && 'bg-background hover:bg-accent',
                done && o.correct && 'border-[var(--color-done)] bg-[color-mix(in_srgb,var(--color-done)_12%,var(--card))]',
                done && chosen && !o.correct && 'border-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_10%,var(--card))]',
              )}
            >
              <span>{o.text}</span>
              {done && o.correct ? <Check className="size-4 shrink-0 text-[var(--color-done-text)]" aria-label={T.correct} /> : null}
              {done && chosen && !o.correct ? <X className="size-4 shrink-0 text-[var(--color-error)]" aria-label={T.incorrect} /> : null}
            </button>
          );
        })}
      </div>
      {done ? (
        <div role="status" className="mt-3 grid gap-2 text-sm">
          <p className="font-medium">{options[picked!]?.correct ? T.correct : T.incorrect}</p>
          {explanation ? <p className="text-muted-foreground">{explanation}</p> : null}
          <button type="button" onClick={() => setPicked(null)} className="inline-flex w-fit items-center gap-1 text-primary underline underline-offset-2">
            <RotateCcw className="size-4" aria-hidden="true" />
            {T.retry}
          </button>
        </div>
      ) : null}
    </Figure>
  );
}

/* ---------------------------------------------------------------- checklist */

function Checklist({ lines }: { lines: string[] }) {
  const items = nonEmpty(lines);
  const [done, setDone] = React.useState<Set<number>>(new Set());
  return (
    <Figure label={T.checklist}>
      <ul className="grid gap-2">
        {items.map((text, i) => {
          const checked = done.has(i);
          return (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-3 rounded-md p-1 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  checked={checked}
                  onChange={() =>
                    setDone((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
                <span className={cn(checked && 'text-muted-foreground line-through')}>{text}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        {fmt(T.checklistProgress, { done: done.size, total: items.length })}
      </p>
    </Figure>
  );
}

/* ---------------------------------------------------------------- selfcheck: Q| ... lalu A| ... */

function SelfCheck({ lines }: { lines: string[] }) {
  const L = nonEmpty(lines);
  const qs = L.filter((l) => l.startsWith('Q|')).map((l) => l.replace(/^Q\|\s*/, ''));
  const as = L.filter((l) => l.startsWith('A|')).map((l) => l.replace(/^A\|\s*/, ''));
  const [shown, setShown] = React.useState<Set<number>>(new Set());
  const [rated, setRated] = React.useState<Record<number, boolean>>({});
  const right = Object.values(rated).filter(Boolean).length;
  const reset = () => {
    setShown(new Set());
    setRated({});
  };
  return (
    <Figure label={T.selfCheck}>
      <ol className="grid gap-3">
        {qs.map((q, i) => {
          const open = shown.has(i);
          return (
            <li key={i} className="rounded-lg border bg-background p-3">
              <p className="text-sm">
                <span className="mr-2 font-semibold">{i + 1}.</span>
                {q}
              </p>
              {open ? (
                <div className="mt-2 grid gap-2 border-t pt-2 text-sm">
                  <p>
                    <span className="font-semibold text-primary">{T.answer}: </span>
                    {as[i]}
                  </p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={T.rate}>
                    <button
                      type="button"
                      aria-pressed={rated[i] === true}
                      onClick={() => setRated((r) => ({ ...r, [i]: true }))}
                      className={cn(
                        'rounded-md border px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        rated[i] === true ? 'border-[var(--color-done)] bg-[color-mix(in_srgb,var(--color-done)_14%,var(--card))]' : 'hover:bg-accent',
                      )}
                    >
                      {T.iWasRight}
                    </button>
                    <button
                      type="button"
                      aria-pressed={rated[i] === false}
                      onClick={() => setRated((r) => ({ ...r, [i]: false }))}
                      className={cn(
                        'rounded-md border px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        rated[i] === false ? 'border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_14%,var(--card))]' : 'hover:bg-accent',
                      )}
                    >
                      {T.notYet}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShown((s) => new Set(s).add(i))}
                  className="mt-2 rounded-md border px-3 py-1 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {T.showAnswer}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" role="status">
        <span className="font-medium">{fmt(T.selfScore, { right, total: qs.length })}</span>
        <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${qs.length ? (right / qs.length) * 100 : 0}%` }} />
        </div>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
          <RotateCcw className="size-4" aria-hidden="true" />
          {T.reset}
        </button>
      </div>
    </Figure>
  );
}

/* ---------------------------------------------------------------- levels: Band N| teks */

function Levels({ lines }: { lines: string[] }) {
  const items = nonEmpty(lines).map((l) => {
    const i = l.indexOf('|');
    return { label: l.slice(0, i).trim(), text: l.slice(i + 1).trim() };
  });
  const [active, setActive] = React.useState(items.length - 1);
  const cur = items[active];
  return (
    <Figure label={T.levels}>
      <div role="tablist" aria-label={T.levels} className="mb-3 flex flex-wrap gap-2">
        {items.map((it, i) => (
          <button
            key={i}
            id={`lv-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={cn(
              'rounded-full border px-4 py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active === i ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex gap-1" aria-hidden="true">
        {items.map((_, i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= active ? 'bg-primary' : 'bg-muted')} />
        ))}
      </div>
      <blockquote role="tabpanel" aria-labelledby={`lv-tab-${active}`} className="rounded-lg border bg-background p-3 text-[0.95rem] leading-relaxed">
        {cur?.text}
      </blockquote>
    </Figure>
  );
}

/* ---------------------------------------------------------------- pintu masuk */

export function InteractiveBlock({ name, lines }: { name: BlockName; lines: string[] }) {
  switch (name) {
    case 'flow':
      return <Flow lines={lines} />;
    case 'timeline':
      return <Timeline lines={lines} />;
    case 'layers':
      return <Layers lines={lines} />;
    case 'compare':
      return <Compare lines={lines} />;
    case 'flip':
      return <Flip lines={lines} />;
    case 'quiz':
      return <Quiz lines={lines} />;
    case 'checklist':
      return <Checklist lines={lines} />;
    case 'selfcheck':
      return <SelfCheck lines={lines} />;
    case 'levels':
      return <Levels lines={lines} />;
    default:
      return null;
  }
}
