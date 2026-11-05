'use client';

import * as React from 'react';
import { Highlighter, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { id } from '@/i18n/id';

export interface HighlightToolbarProps {
  position: { top: number; left: number } | null;
  onHighlight: (color: 'yellow' | 'green') => void;
  onRemove?: () => void;
  onClose: () => void;
  hasActiveHighlight?: boolean;
}

export function HighlightToolbar({
  position,
  onHighlight,
  onRemove,
  onClose,
  hasActiveHighlight,
}: HighlightToolbarProps) {
  if (!position) return null;

  return (
    <div
      role="toolbar"
      aria-label="Highlighter toolbar"
      className="fixed z-50 flex items-center gap-1 rounded-lg border bg-surface p-1 shadow-lg animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: `${Math.max(10, position.top - 44)}px`,
        left: `${Math.max(10, position.left)}px`,
      }}
    >
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 px-2 text-xs font-medium"
        onClick={() => onHighlight('yellow')}
      >
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 rounded-full border border-amber-600/30"
          style={{ backgroundColor: 'var(--color-highlight-yellow)' }}
        />
        <Highlighter className="h-3.5 w-3.5" />
        {id.reading.highlightYellow}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 px-2 text-xs font-medium"
        onClick={() => onHighlight('green')}
      >
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 rounded-full border border-emerald-600/30"
          style={{ backgroundColor: 'var(--color-highlight-green)' }}
        />
        <Highlighter className="h-3.5 w-3.5" />
        {id.reading.highlightGreen}
      </Button>

      {hasActiveHighlight && onRemove && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 px-2 text-xs font-medium text-destructive hover:bg-destructive/10"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {id.reading.removeHighlight}
        </Button>
      )}

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground"
        aria-label={id.common.close}
        onClick={onClose}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ClearAllHighlightsDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{id.reading.clearAllConfirmTitle}</DialogTitle>
          <DialogDescription>{id.reading.clearAllConfirmBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="outline">{id.common.cancel}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {id.reading.clearAllHighlights}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
