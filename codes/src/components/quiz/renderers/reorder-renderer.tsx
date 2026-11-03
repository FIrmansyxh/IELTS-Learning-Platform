'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import type { RendererProps } from '../answer-utils';

function Row({
  segmentId,
  text,
  index,
  total,
  disabled,
  onMove,
}: {
  segmentId: string;
  text: string;
  index: number;
  total: number;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: segmentId,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}
      className={cn(
        'flex min-h-14 items-center gap-2 rounded-lg border bg-card px-2 py-2',
        isDragging && 'z-10 border-primary shadow-md',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={fmt(id.quiz.reorder.handle, { text })}
        className="grid size-11 shrink-0 cursor-grab touch-none place-content-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed"
      >
        <GripVertical className="size-5" aria-hidden="true" />
      </button>
      <span lang="en" className="flex-1 text-base">
        {text}
      </span>
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled || index === 0}
          onClick={() => onMove(index, index - 1)}
          aria-label={fmt(id.quiz.reorder.moveUp, { text })}
          title={id.quiz.reorder.up}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(index, index + 1)}
          aria-label={fmt(id.quiz.reorder.moveDown, { text })}
          title={id.quiz.reorder.down}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

/** SENTENCE_REORDER: daftar dapat diurut dengan gagang seret ATAU tombol Naik/Turun (keyboard). */
export function ReorderRenderer({ question, value, onChange, disabled }: RendererProps) {
  const segments = question.segments ?? [];
  const byId = new Map(segments.map((s) => [s.segment_id, s.text]));
  const order = value && 'segment_ids' in value ? value.segment_ids : segments.map((s) => s.segment_id);
  const [announce, setAnnounce] = React.useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = arrayMove(order, from, to);
    onChange({ segment_ids: next });
    setAnnounce(fmt(id.quiz.reorder.moved, { text: byId.get(order[from]!) ?? '', n: to + 1, total: order.length }));
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.indexOf(String(e.active.id));
    const to = order.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) move(from, to);
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{id.quiz.reorder.help}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} id={`reorder-${question.question_id}`}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol aria-label={id.quiz.reorder.list} className="grid gap-2">
            {order.map((sid, i) => (
              <Row
                key={sid}
                segmentId={sid}
                text={byId.get(sid) ?? ''}
                index={i}
                total={order.length}
                disabled={disabled}
                onMove={move}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
