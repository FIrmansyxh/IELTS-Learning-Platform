/** Konversi `Selection` peramban menjadi rentang karakter terhadap teks paragraf (SPEC-010 langkah 4). */
export type SelectionResult =
  | { kind: 'none' }
  | { kind: 'cross' }
  | {
      kind: 'ok';
      passage_no: number;
      paragraph_index: number;
      start: number;
      end: number;
      rect: { top: number; bottom: number; left: number } | null;
      paraEl: HTMLElement;
    };

type Hit = { el: HTMLElement; from: number; to: number };

function collect(range: Range): Hit[] {
  const ancestor = range.commonAncestorContainer;
  const nodes: Text[] = [];
  if (ancestor.nodeType === Node.TEXT_NODE) nodes.push(ancestor as Text);
  else {
    const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (range.intersectsNode(n)) nodes.push(n as Text);
    }
  }
  const hits: Hit[] = [];
  for (const node of nodes) {
    const el = node.parentElement?.closest<HTMLElement>('[data-start]');
    if (!el) continue;
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.length;
    if (from < to) hits.push({ el, from, to });
  }
  return hits;
}

export function readSelection(root: HTMLElement, textOf: (passageNo: number, paragraphIndex: number) => string | undefined): SelectionResult {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return { kind: 'none' };
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return { kind: 'none' };
  const hits = collect(range);
  if (hits.length === 0) return { kind: 'none' };
  const paraEl = hits[0]!.el.closest<HTMLElement>('[data-para]');
  if (!paraEl) return { kind: 'none' };
  if (hits.some((h) => h.el.closest('[data-para]') !== paraEl)) return { kind: 'cross' };
  const [pn, pi] = (paraEl.dataset.para ?? '').split(':').map(Number);
  if (!pn || pi === undefined || Number.isNaN(pi)) return { kind: 'none' };
  const text = textOf(pn, pi);
  if (text === undefined) return { kind: 'none' };
  const first = hits[0]!;
  const last = hits[hits.length - 1]!;
  let start = Number(first.el.dataset.start) + first.from;
  let end = Number(last.el.dataset.start) + last.to;
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  if (start >= end || end > text.length) return { kind: 'none' };
  const r = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
  return { kind: 'ok', passage_no: pn, paragraph_index: pi, start, end, rect: r ? { top: r.top, bottom: r.bottom, left: r.left } : null, paraEl };
}
