'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { GripVertical, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import type { RendererProps } from '../answer-utils';

type Pairs = Array<{ item_id: string; choice_id: string }>;

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setNarrow(mq.matches);
    const on = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function currentPairs(value: RendererProps['value']): Pairs {
  return value && 'pairs' in value ? value.pairs : [];
}

function commit(pairs: Pairs, onChange: RendererProps['onChange']) {
  onChange(pairs.length ? { pairs } : null);
}

/** Memasangkan item -> pilihan; pilihan tunggal-pakai dilepas dari butir lain bila `allow_reuse=false`. */
function assign(pairs: Pairs, itemId: string, choiceId: string | null, allowReuse: boolean): Pairs {
  let next = pairs.filter((p) => p.item_id !== itemId);
  if (choiceId) {
    if (!allowReuse) next = next.filter((p) => p.choice_id !== choiceId);
    next = [...next, { item_id: itemId, choice_id: choiceId }];
  }
  return next;
}

function DropdownMode({ question, value, onChange, disabled }: RendererProps) {
  const m = question.matching!;
  const pairs = currentPairs(value);
  return (
    <ul className="grid gap-3">
      {m.left.map((item) => {
        const picked = pairs.find((p) => p.item_id === item.item_id)?.choice_id ?? '';
        const selectId = `match-${question.question_id}-${item.item_id}`;
        const usedElsewhere = new Set(pairs.filter((p) => p.item_id !== item.item_id).map((p) => p.choice_id));
        return (
          <li key={item.item_id} className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_minmax(0,1fr)] sm:items-center">
            <label htmlFor={selectId} lang="en" className="text-base">
              {item.text}
            </label>
            <select
              id={selectId}
              value={picked}
              disabled={disabled}
              onChange={(e) => commit(assign(pairs, item.item_id, e.target.value || null, m.allow_reuse), onChange)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{id.quiz.matching.choose}</option>
              {m.right.map((c) => (
                <option key={c.choice_id} value={c.choice_id} disabled={!m.allow_reuse && usedElsewhere.has(c.choice_id)}>
                  {c.text}
                </option>
              ))}
            </select>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ choiceId, text, disabled }: { choiceId: string; text: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `choice:${choiceId}`, disabled });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={fmt(id.quiz.matching.dragHandle, { item: text })}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      className={cn(
        'inline-flex min-h-11 touch-none items-center gap-1 rounded-full border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging && 'z-10 border-primary shadow-md',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
      <span lang="en">{text}</span>
    </button>
  );
}

function Zone({
  itemId,
  text,
  chosenText,
  disabled,
  onClear,
}: {
  itemId: string;
  text: string;
  chosenText: string | null;
  disabled: boolean;
  onClear: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `item:${itemId}` });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        'grid gap-2 rounded-lg border-2 border-dashed bg-card p-3 transition-colors sm:grid-cols-2 sm:items-center',
        isOver && 'border-primary bg-accent',
      )}
    >
      <span lang="en" className="text-base">
        {text}
      </span>
      <div className="flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 text-sm">
        {chosenText ? (
          <>
            <span lang="en" className="flex-1">
              {chosenText}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={onClear}
              aria-label={fmt(id.quiz.matching.clear, { item: text })}
              className="grid size-9 place-content-center rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">{id.quiz.matching.dropHere}</span>
        )}
      </div>
    </li>
  );
}

function DragMode({ question, value, onChange, disabled }: RendererProps) {
  const m = question.matching!;
  const pairs = currentPairs(value);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const itemText = new Map(m.left.map((l) => [l.item_id, l.text]));
  const choiceText = new Map(m.right.map((c) => [c.choice_id, c.text]));
  const used = new Set(pairs.map((p) => p.choice_id));
  const pool = m.right.filter((c) => m.allow_reuse || !used.has(c.choice_id));

  const label = (raw: string | number) => {
    const s = String(raw);
    if (s.startsWith('choice:')) return choiceText.get(s.slice(7)) ?? '';
    if (s.startsWith('item:')) return itemText.get(s.slice(5)) ?? '';
    return s;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => fmt(id.quiz.matching.pickedUp, { item: label(active.id) }),
    onDragOver: () => '',
    onDragEnd: ({ active, over }) =>
      over ? fmt(id.quiz.matching.droppedOn, { item: label(active.id), target: label(over.id) }) : id.quiz.matching.dragCancelled,
    onDragCancel: () => id.quiz.matching.dragCancelled,
  };

  const onDragEnd = (e: DragEndEvent) => {
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : '';
    if (!a.startsWith('choice:') || !o.startsWith('item:')) return;
    commit(assign(pairs, o.slice(5), a.slice(7), m.allow_reuse), onChange);
  };

  return (
    <DndContext
      id={`match-${question.question_id}`}
      sensors={sensors}
      onDragEnd={onDragEnd}
      accessibility={{ announcements }}
    >
      <div className="grid gap-4">
        <div>
          <p className="mb-2 text-sm font-medium">{id.quiz.matching.choicesTitle}</p>
          <div className="flex min-h-11 flex-wrap gap-2">
            {pool.map((c) => (
              <Chip key={c.choice_id} choiceId={c.choice_id} text={c.text} disabled={disabled} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{id.quiz.matching.itemsTitle}</p>
          <ul className="grid gap-3">
            {m.left.map((item) => {
              const cid = pairs.find((p) => p.item_id === item.item_id)?.choice_id;
              return (
                <Zone
                  key={item.item_id}
                  itemId={item.item_id}
                  text={item.text}
                  chosenText={cid ? (choiceText.get(cid) ?? null) : null}
                  disabled={disabled}
                  onClear={() => commit(assign(pairs, item.item_id, null, m.allow_reuse), onChange)}
                />
              );
            })}
          </ul>
        </div>
      </div>
    </DndContext>
  );
}

/**
 * MATCHING_DROPDOWN / MATCHING_DRAG: dua pola setara. Drag (`@dnd-kit`, ambang 8px, pengumuman aria-live)
 * dan dropdown `<select>`; di bawah 768px default dropdown. Toggle memungkinkan beralih (alternatif keyboard/sentuh).
 */
export function MatchingRenderer(props: RendererProps) {
  const narrow = useIsNarrow();
  const [override, setOverride] = React.useState<'drag' | 'select' | null>(null);
  const natural = props.question.question_type === 'MATCHING_DRAG' && !narrow ? 'drag' : 'select';
  const mode = override ?? natural;
  if (!props.question.matching) return null;
  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOverride(mode === 'drag' ? 'select' : 'drag')}
          disabled={props.disabled}
        >
          {mode === 'drag' ? id.quiz.matching.useSelect : id.quiz.matching.useDrag}
        </Button>
      </div>
      {mode === 'drag' ? <DragMode {...props} /> : <DropdownMode {...props} />}
    </div>
  );
}
