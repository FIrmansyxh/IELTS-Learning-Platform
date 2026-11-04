'use client';

import * as React from 'react';
import type { Passage } from '@/lib/reading/parsePassages';
import { type Highlight, type HighlightColor, loadHighlights, MAX_HIGHLIGHTS, saveHighlights } from '@/lib/reading/storage';

export type HighlightRange = { passage_no: number; paragraph_index: number; start: number; end: number };

let counter = 0;
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    counter += 1;
    return `hl-${Date.now()}-${counter}`;
  }
}

/** Sorotan per attempt: state di memori + `localStorage` (`hl:v1:{attempt_id}`, maks 200). */
export function useHighlights(attemptId: string, passages: Passage[] | null) {
  const [list, setList] = React.useState<Highlight[]>(() => (passages ? loadHighlights(attemptId, passages) : []));
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saveHighlights(attemptId, list);
  }, [attemptId, list]);

  const add = React.useCallback(
    (range: HighlightRange, color: HighlightColor): 'ok' | 'limit' => {
      if (list.length >= MAX_HIGHLIGHTS) return 'limit';
      setList((l) => (l.length >= MAX_HIGHLIGHTS ? l : [...l, { id: newId(), color, ...range }]));
      return 'ok';
    },
    [list.length],
  );
  const removeIds = React.useCallback((ids: string[]) => setList((l) => l.filter((h) => !ids.includes(h.id))), []);
  const clear = React.useCallback(() => setList([]), []);
  return { highlights: list, add, removeIds, clear };
}

export function overlapping(list: Highlight[], r: HighlightRange): Highlight[] {
  return list.filter(
    (h) => h.passage_no === r.passage_no && h.paragraph_index === r.paragraph_index && h.start < r.end && h.end > r.start,
  );
}
