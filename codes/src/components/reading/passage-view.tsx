'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Passage } from '@/lib/reading/parsePassages';
import { id, fmt } from '@/i18n/id';
import {
  type Highlight,
  MAX_HIGHLIGHTS,
  renderHighlightedText,
} from './highlight-utils';
import { ClearAllHighlightsDialog, HighlightToolbar } from './highlight-toolbar';

export interface PassageViewProps {
  passage: Passage;
  highlights: Highlight[];
  onAddHighlight: (highlight: Highlight) => void;
  onRemoveHighlight: (id: string) => void;
  onClearPassageHighlights: (passageNo: number) => void;
}

export function PassageView({
  passage,
  highlights,
  onAddHighlight,
  onRemoveHighlight,
  onClearPassageHighlights,
}: PassageViewProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [toolbarPos, setToolbarPos] = React.useState<{ top: number; left: number } | null>(null);
  const [selectedRange, setSelectedRange] = React.useState<{
    paragraphIndex: number;
    start: number;
    end: number;
  } | null>(null);
  const [activeHighlight, setActiveHighlight] = React.useState<Highlight | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = React.useState(false);
  const warnedCrossParagraph = React.useRef(false);

  // Passage-specific highlights
  const passageHighlights = React.useMemo(
    () => highlights.filter((h) => h.passage_no === passage.passage_no),
    [highlights, passage.passage_no],
  );

  const handleSelection = React.useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      if (!activeHighlight) {
        setToolbarPos(null);
        setSelectedRange(null);
      }
      return;
    }

    const range = sel.getRangeAt(0);
    // Find the enclosing paragraph element
    let node: Node | null = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }

    const pElement = (node as HTMLElement | null)?.closest('[data-paragraph-index]');
    if (!pElement) {
      // Check if selection spans across multiple paragraphs inside container
      if (containerRef.current && containerRef.current.contains(range.commonAncestorContainer)) {
        if (!warnedCrossParagraph.current) {
          toast(id.reading.toastCrossParagraph);
          warnedCrossParagraph.current = true;
        }
      }
      setToolbarPos(null);
      setSelectedRange(null);
      return;
    }

    const pIndexStr = pElement.getAttribute('data-paragraph-index');
    if (pIndexStr === null) return;
    const pIndex = parseInt(pIndexStr, 10);
    const targetParagraph = passage.paragraphs[pIndex];
    if (!targetParagraph) return;

    // Calculate start and end offset relative to the paragraph plain text
    // We create a range from the paragraph's start to the selection start
    const preRange = document.createRange();
    preRange.selectNodeContents(pElement);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const length = range.toString().length;
    const end = Math.min(targetParagraph.text.length, start + length);

    if (start >= end) {
      setToolbarPos(null);
      setSelectedRange(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setToolbarPos({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
    });
    setSelectedRange({ paragraphIndex: pIndex, start, end });
    setActiveHighlight(null);
  }, [passage.paragraphs, activeHighlight]);

  React.useEffect(() => {
    const onMouseUp = () => {
      setTimeout(handleSelection, 20);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key.startsWith('Arrow')) {
        setTimeout(handleSelection, 20);
      }
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [handleSelection]);

  // Keyboard shortcut listener: H = yellow, Shift+H = green, Delete/Backspace on active highlight
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        if (selectedRange) {
          e.preventDefault();
          const color = e.shiftKey ? 'green' : 'yellow';
          applyHighlight(color);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeHighlight) {
          e.preventDefault();
          onRemoveHighlight(activeHighlight.id);
          setActiveHighlight(null);
          setToolbarPos(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const applyHighlight = (color: 'yellow' | 'green') => {
    if (!selectedRange) return;
    if (highlights.length >= MAX_HIGHLIGHTS) {
      toast(id.reading.toastHighlightLimit);
      setToolbarPos(null);
      setSelectedRange(null);
      return;
    }

    const newHl: Highlight = {
      id: crypto.randomUUID(),
      passage_no: passage.passage_no,
      paragraph_index: selectedRange.paragraphIndex,
      start: selectedRange.start,
      end: selectedRange.end,
      color,
    };

    onAddHighlight(newHl);
    setToolbarPos(null);
    setSelectedRange(null);
    window.getSelection()?.removeAllRanges();
  };

  const onHighlightClick = (hl: Highlight) => {
    setActiveHighlight(hl);
    setSelectedRange(null);
    // Find target element to position toolbar
    const el = document.querySelector(`[data-highlight-id="${hl.id}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setToolbarPos({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }
  };

  return (
    <div ref={containerRef} className="relative flex flex-col gap-6 py-2">
      {/* Passage title and clear button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {passage.title}
        </h2>
        {passageHighlights.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setClearDialogOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {id.reading.clearAllHighlights}
          </Button>
        )}
      </div>

      {/* Paragraphs */}
      <div className="flex flex-col gap-5 text-base leading-relaxed text-foreground select-text">
        {passage.paragraphs.map((p) => {
          const pHighlights = passageHighlights.filter((h) => h.paragraph_index === p.index);
          return (
            <div
              key={`p-${p.index}`}
              data-paragraph-index={p.index}
              className="group flex items-start gap-3"
            >
              {/* Margin label (32px width) */}
              <div
                className="w-8 shrink-0 pt-0.5 text-center font-bold text-muted-foreground"
                aria-label={p.label ? fmt(id.reading.passageParagraphAria, { label: p.label }) : undefined}
              >
                {p.label ? `[${p.label}]` : ''}
              </div>

              {/* Paragraph text with highlights */}
              <p className="flex-1 font-normal leading-7">
                {renderHighlightedText(p.text, pHighlights, onHighlightClick)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Floating Toolbar */}
      <HighlightToolbar
        position={toolbarPos}
        hasActiveHighlight={!!activeHighlight}
        onHighlight={applyHighlight}
        onRemove={() => {
          if (activeHighlight) {
            onRemoveHighlight(activeHighlight.id);
            setActiveHighlight(null);
            setToolbarPos(null);
          }
        }}
        onClose={() => {
          setToolbarPos(null);
          setSelectedRange(null);
          setActiveHighlight(null);
          window.getSelection()?.removeAllRanges();
        }}
      />

      {/* Clear Confirmation Dialog */}
      <ClearAllHighlightsDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        onConfirm={() => onClearPassageHighlights(passage.passage_no)}
      />
    </div>
  );
}
