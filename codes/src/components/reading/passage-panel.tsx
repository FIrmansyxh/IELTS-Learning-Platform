'use client';

import { Eraser, Highlighter } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fmt, id } from '@/i18n/id';
import type { Passage, PassageParagraph } from '@/lib/reading/parsePassages';
import type { Highlight, HighlightColor } from '@/lib/reading/storage';
import { cn } from '@/lib/utils';
import { analyzeParagraph, type Line, splitRun } from './paragraph-runs';
import { readSelection } from './selection';
import { type HighlightRange, overlapping } from './use-highlights';

let crossToastShown = false;
/** Hanya untuk uji: toast "Sorot dalam satu paragraf." muncul sekali per sesi peramban. */
export function resetPassageSessionFlags() {
  crossToastShown = false;
}

const HL_BG: Record<HighlightColor, string> = {
  yellow: 'bg-[var(--color-highlight-yellow)]',
  green: 'bg-[var(--color-highlight-green)]',
};

type Pending = HighlightRange & { top: number; left: number };

function Segment({ start, text, style, hl, onRemove }: { start: number; text: string; style: 'plain' | 'b' | 'i'; hl: Highlight | null; onRemove: (id: string) => void }) {
  const cls = cn(style === 'b' && 'font-semibold', style === 'i' && 'italic');
  if (!hl) {
    return (
      <span data-start={start} className={cls || undefined}>
        {text}
      </span>
    );
  }
  const colorName = hl.color === 'yellow' ? id.reading.colorYellow : id.reading.colorGreen;
  return (
    <mark
      data-start={start}
      data-hl-id={hl.id}
      data-color={hl.color}
      tabIndex={0}
      aria-label={fmt(id.reading.highlightLabel, { color: colorName, text })}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onRemove(hl.id);
        }
      }}
      className={cn('rounded-[2px] px-0 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring', HL_BG[hl.color], cls)}
    >
      {text}
    </mark>
  );
}

function LineView({ line, text, highlights, onRemove }: { line: Line; text: string; highlights: Highlight[]; onRemove: (id: string) => void }) {
  return (
    <>
      {line.runs.flatMap((run) =>
        splitRun(run, highlights).map((p) => (
          <Segment key={`${p.start}-${p.end}`} start={p.start} text={text.slice(p.start, p.end)} style={p.style} hl={p.highlight} onRemove={onRemove} />
        )),
      )}
    </>
  );
}

const ParagraphBody = React.memo(function ParagraphBody({ text, highlights, onRemove }: { text: string; highlights: Highlight[]; onRemove: (id: string) => void }) {
  const block = React.useMemo(() => analyzeParagraph(text), [text]);
  if (block.kind === 'plain') {
    return <div className="whitespace-pre-wrap break-words font-mono text-sm">{block.text}</div>;
  }
  if (block.kind === 'list') {
    const ordered = block.lines[0]?.bullet === 'ol';
    const Tag = ordered ? 'ol' : 'ul';
    return (
      <Tag className={cn('grid gap-1 pl-5', ordered ? 'list-decimal' : 'list-disc')}>
        {block.lines.map((l, i) => (
          <li key={i}>
            <LineView line={l} text={text} highlights={highlights} onRemove={onRemove} />
          </li>
        ))}
      </Tag>
    );
  }
  return (
    <div className="grid gap-1">
      {block.lines.map((l, i) => (
        <p key={i} className="m-0 whitespace-pre-wrap break-words">
          <LineView line={l} text={text} highlights={highlights} onRemove={onRemove} />
        </p>
      ))}
    </div>
  );
});

function Toolbar({
  pending,
  canRemove,
  onApply,
  onRemove,
}: {
  pending: Pending;
  canRemove: boolean;
  onApply: (c: HighlightColor) => void;
  onRemove: () => void;
}) {
  // Mencegah tombol mencuri seleksi saat diklik/disentuh.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div
      role="toolbar"
      aria-label={id.reading.highlightToolbar}
      data-testid="highlight-toolbar"
      style={{ top: pending.top, left: pending.left }}
      className="absolute z-20 flex max-w-[calc(100vw-2rem)] flex-wrap gap-1 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <Button size="sm" variant="ghost" onMouseDown={keep} onClick={() => onApply('yellow')}>
        <Highlighter aria-hidden="true" className="text-[var(--color-accent-text)]" />
        {id.reading.highlightYellow}
      </Button>
      <Button size="sm" variant="ghost" onMouseDown={keep} onClick={() => onApply('green')}>
        <Highlighter aria-hidden="true" className="text-[var(--color-done-text)]" />
        {id.reading.highlightGreen}
      </Button>
      <Button size="sm" variant="ghost" onMouseDown={keep} onClick={onRemove} disabled={!canRemove}>
        <Eraser aria-hidden="true" />
        {id.reading.removeHighlight}
      </Button>
    </div>
  );
}

function ParagraphRow({
  passageNo,
  para,
  highlights,
  pending,
  canRemove,
  onApply,
  onRemoveSelection,
  onRemoveId,
}: {
  passageNo: number;
  para: PassageParagraph;
  highlights: Highlight[];
  pending: Pending | null;
  canRemove: boolean;
  onApply: (c: HighlightColor) => void;
  onRemoveSelection: () => void;
  onRemoveId: (id: string) => void;
}) {
  return (
    <div className="relative grid grid-cols-[2rem_1fr] gap-x-2">
      <span
        role="img"
        aria-label={para.label ? fmt(id.reading.paragraph, { label: para.label }) : undefined}
        aria-hidden={para.label ? undefined : true}
        className="pt-0.5 text-sm font-bold text-muted-foreground"
      >
        {para.label}
      </span>
      <div data-para={`${passageNo}:${para.index}`} className="min-w-0 leading-7">
        <ParagraphBody text={para.text} highlights={highlights} onRemove={onRemoveId} />
      </div>
      {pending ? <Toolbar pending={pending} canRemove={canRemove} onApply={onApply} onRemove={onRemoveSelection} /> : null}
    </div>
  );
}

export type PassagePanelProps = {
  passages: Passage[];
  passageNo: number;
  onPassageNo: (n: number) => void;
  highlights: Highlight[];
  onAdd: (range: HighlightRange, color: HighlightColor) => 'ok' | 'limit';
  onRemoveIds: (ids: string[]) => void;
  onClear: () => void;
};

/**
 * Panel teks bacaan dengan penyorot (SPEC-010). Sorotan dirender sebagai `<mark>` (segmen React, tanpa HTML mentah);
 * offset karakter dihitung terhadap teks paragraf mentah dan disimpan oleh pemanggil.
 */
export function PassagePanel({ passages, passageNo, onPassageNo, highlights, onAdd, onRemoveIds, onClear }: PassagePanelProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pointerDown = React.useRef(false);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const passage = passages.find((p) => p.passage_no === passageNo) ?? passages[0]!;

  const textOf = React.useCallback(
    (pn: number, pi: number) => passages[pn - 1]?.paragraphs[pi]?.text,
    [passages],
  );

  const evaluate = React.useCallback(
    (final: boolean) => {
      const root = rootRef.current;
      if (!root) return;
      const r = readSelection(root, textOf);
      if (r.kind === 'ok') {
        const rowRect = r.paraEl.parentElement?.getBoundingClientRect();
        let top = 0;
        let left = 0;
        if (r.rect && rowRect) {
          top = r.rect.top - rowRect.top - 44;
          if (top < 0) top = r.rect.bottom - rowRect.top + 4;
          left = Math.max(0, r.rect.left - rowRect.left);
        }
        setPending({ passage_no: r.passage_no, paragraph_index: r.paragraph_index, start: r.start, end: r.end, top, left });
        return;
      }
      if (r.kind === 'cross' && final && !crossToastShown) {
        crossToastShown = true;
        toast.info(id.reading.singleParagraph);
      }
      // Fokus di toolbar menjaga rentang tertunda walau seleksi peramban mengempis.
      if (root.contains(document.activeElement) && (document.activeElement as HTMLElement | null)?.closest('[role="toolbar"]')) return;
      setPending(null);
    },
    [textOf],
  );

  React.useEffect(() => {
    const onSel = () => {
      if (!pointerDown.current) evaluate(false);
    };
    const onUp = () => {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      evaluate(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow') || e.key === 'Shift') evaluate(true);
    };
    document.addEventListener('selectionchange', onSel);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [evaluate]);

  const apply = React.useCallback(
    (color: HighlightColor) => {
      if (!pending) return;
      const { passage_no, paragraph_index, start, end } = pending;
      const res = onAdd({ passage_no, paragraph_index, start, end }, color);
      if (res === 'limit') toast.error(id.reading.limitReached);
      window.getSelection()?.removeAllRanges();
      setPending(null);
    },
    [pending, onAdd],
  );

  const removeSelection = React.useCallback(() => {
    if (!pending) return;
    onRemoveIds(overlapping(highlights, pending).map((h) => h.id));
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }, [pending, highlights, onRemoveIds]);

  // Pintasan: H = kuning, Shift+H = hijau, Escape = tutup toolbar (hanya saat ada seleksi tertunda).
  React.useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        apply(e.shiftKey ? 'green' : 'yellow');
      } else if (e.key === 'Escape') {
        setPending(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, apply]);

  const byPara = React.useMemo(() => {
    const m = new Map<string, Highlight[]>();
    for (const h of highlights) {
      if (h.passage_no !== passage.passage_no) continue;
      const k = String(h.paragraph_index);
      m.set(k, [...(m.get(k) ?? []), h]);
    }
    return m;
  }, [highlights, passage.passage_no]);

  return (
    <div className="grid gap-4" data-testid="passage-panel">
      <div className="sticky top-0 z-10 -mx-4 grid gap-2 border-b bg-background px-4 py-2 sm:-mx-6 sm:px-6">
        {passages.length > 1 ? (
          <div role="group" aria-label={id.reading.passageSwitcher} className="flex flex-wrap gap-1">
            {passages.map((p) => (
              <Button
                key={p.passage_no}
                size="sm"
                variant={p.passage_no === passage.passage_no ? 'default' : 'outline'}
                aria-pressed={p.passage_no === passage.passage_no}
                onClick={() => onPassageNo(p.passage_no)}
              >
                {fmt(id.reading.passageN, { n: p.passage_no })}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold leading-snug">{passage.title}</h2>
          <Button variant="ghost" size="sm" disabled={highlights.length === 0} onClick={() => setConfirmClear(true)}>
            {id.reading.clearAll}
          </Button>
        </div>
      </div>

      <div
        ref={rootRef}
        className="grid gap-4 text-base"
        onMouseDown={() => {
          pointerDown.current = true;
        }}
        onTouchStart={() => {
          pointerDown.current = true;
        }}
      >
        {passage.paragraphs.map((para) => {
          const here = pending && pending.passage_no === passage.passage_no && pending.paragraph_index === para.index ? pending : null;
          const phl = byPara.get(String(para.index)) ?? EMPTY;
          return (
            <ParagraphRow
              key={para.index}
              passageNo={passage.passage_no}
              para={para}
              highlights={phl}
              pending={here}
              canRemove={here ? overlapping(highlights, here).length > 0 : false}
              onApply={apply}
              onRemoveSelection={removeSelection}
              onRemoveId={(hid) => onRemoveIds([hid])}
            />
          );
        })}
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.reading.clearAllTitle}</DialogTitle>
            <DialogDescription>{id.reading.clearAllBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              {id.common.cancel}
            </Button>
            <Button
              onClick={() => {
                onClear();
                setConfirmClear(false);
              }}
            >
              {id.reading.clearAllConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const EMPTY: Highlight[] = [];
