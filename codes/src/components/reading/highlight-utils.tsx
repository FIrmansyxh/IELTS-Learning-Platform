import * as React from 'react';

export interface Highlight {
  id: string;
  passage_no: number;
  paragraph_index: number;
  start: number;
  end: number;
  color: 'yellow' | 'green';
}

const SPLIT_KEY = 'split:v1';
const HL_PREFIX = 'hl:v1:';
const FLAG_PREFIX = 'flag:v1:';
export const MAX_HIGHLIGHTS = 200;

export function loadSplitRatio(): number {
  if (typeof window === 'undefined') return 50;
  try {
    const raw = localStorage.getItem(SPLIT_KEY);
    if (!raw) return 50;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ratio === 'number' && parsed.ratio >= 35 && parsed.ratio <= 65) {
      return parsed.ratio;
    }
  } catch {
    // Ignore localStorage failures
  }
  return 50;
}

export function saveSplitRatio(ratio: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SPLIT_KEY, JSON.stringify({ ratio }));
  } catch {
    // Ignore localStorage failures
  }
}

export function loadHighlights(attemptId: string): Highlight[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${HL_PREFIX}${attemptId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_HIGHLIGHTS);
    }
  } catch {
    // Ignore localStorage failures
  }
  return [];
}

export function saveHighlights(attemptId: string, highlights: Highlight[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${HL_PREFIX}${attemptId}`, JSON.stringify(highlights.slice(0, MAX_HIGHLIGHTS)));
  } catch {
    // Ignore localStorage failures
  }
}

export function loadFlags(attemptId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${FLAG_PREFIX}${attemptId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Ignore localStorage failures
  }
  return [];
}

export function saveFlags(attemptId: string, flags: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${FLAG_PREFIX}${attemptId}`, JSON.stringify(flags));
  } catch {
    // Ignore localStorage failures
  }
}

interface Segment {
  start: number;
  end: number;
  highlight?: Highlight;
}

/**
 * Renders paragraph text as safe React segments with <mark> tags without innerHTML.
 */
export function renderHighlightedText(
  text: string,
  highlights: Highlight[],
  onHighlightClick?: (highlight: Highlight) => void,
): React.ReactNode {
  if (highlights.length === 0) {
    return text;
  }

  // Filter and sort valid non-overlapping highlights within text length
  const valid = highlights
    .filter((h) => h.start >= 0 && h.end <= text.length && h.start < h.end)
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const hl of valid) {
    if (hl.start > cursor) {
      segments.push({ start: cursor, end: hl.start });
    }
    const segStart = Math.max(cursor, hl.start);
    const segEnd = Math.max(segStart, hl.end);
    if (segEnd > segStart) {
      segments.push({ start: segStart, end: segEnd, highlight: hl });
      cursor = segEnd;
    }
  }

  if (cursor < text.length) {
    segments.push({ start: cursor, end: text.length });
  }

  return segments.map((seg, idx) => {
    const content = text.slice(seg.start, seg.end);
    if (!seg.highlight) {
      return <React.Fragment key={`plain-${seg.start}-${idx}`}>{content}</React.Fragment>;
    }

    const hl = seg.highlight;
    const isYellow = hl.color === 'yellow';

    return (
      <mark
        key={`hl-${hl.id}-${idx}`}
        tabIndex={0}
        data-highlight-id={hl.id}
        data-testid={`highlight-${hl.color}`}
        className="cursor-pointer rounded px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          backgroundColor: isYellow ? 'var(--color-highlight-yellow)' : 'var(--color-highlight-green)',
          color: 'var(--color-text)',
        }}
        onClick={() => onHighlightClick?.(hl)}
      >
        {content}
      </mark>
    );
  });
}
