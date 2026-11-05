'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { id, fmt } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface WritingEditorProps {
  prompt?: string;
  kind?: 'WRITING_TASK1' | 'WRITING_TASK2' | 'MINI_TASK_WRITING';
  minWords?: number;
  targetWords?: number;
  storageKey?: string;
  initialValue?: string;
  onSubmit: (text: string) => Promise<void> | void;
  isSubmitting?: boolean;
  readOnly?: boolean;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function WritingEditor({
  prompt,
  kind = 'MINI_TASK_WRITING',
  minWords = kind === 'MINI_TASK_WRITING' ? 5 : 20,
  targetWords,
  storageKey,
  initialValue = '',
  onSubmit,
  isSubmitting = false,
  readOnly = false,
}: WritingEditorProps) {
  const [text, setText] = useState<string>(() => {
    if (initialValue) return initialValue;
    if (typeof window !== 'undefined' && storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) return saved;
      } catch {
        // ignore storage error
      }
    }
    return '';
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const textareaId = useId();
  const textRef = useRef(text);
  textRef.current = text;

  // 10s auto-save to localStorage
  useEffect(() => {
    if (!storageKey || readOnly) return;

    const interval = setInterval(() => {
      try {
        if (textRef.current) {
          localStorage.setItem(storageKey, textRef.current);
          setSavedStatus(id.writing.draftSaved);
        }
      } catch {
        // ignore storage fail
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [storageKey, readOnly]);

  const wordCount = countWords(text);
  const isValidLength = wordCount >= minWords;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isValidLength && !isSubmitting && !readOnly) {
        setConfirmOpen(true);
      }
    }
  };

  const handleConfirmSubmit = async () => {
    setConfirmOpen(false);
    await onSubmit(text);
    if (storageKey && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {prompt && (
        <div className="rounded-lg border border-border/80 bg-muted/40 p-4">
          <h4 className="text-sm font-semibold text-foreground mb-1">{id.writing.promptLabel}</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{prompt}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <label htmlFor={textareaId} className="font-medium text-foreground">
            {id.writing.title}
          </label>
          {savedStatus && <span className="text-xs text-muted-foreground/80">{savedStatus}</span>}
        </div>

        <textarea
          id={textareaId}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSavedStatus(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={readOnly || isSubmitting}
          placeholder={id.writing.placeholder}
          rows={10}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-sans leading-relaxed resize-y min-h-[200px]"
          aria-label={id.writing.placeholder}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-3">
            <span
              data-testid="word-counter"
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                isValidLength
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {targetWords
                ? fmt(id.writing.wordCountTarget, { n: wordCount, target: targetWords })
                : fmt(id.writing.wordCount, { n: wordCount })}
            </span>
            {!isValidLength && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {fmt(id.writing.minWordsNotice, { min: minWords })}
              </span>
            )}
            <span className="hidden sm:inline-block text-xs text-muted-foreground">
              {id.writing.shortcutHint}
            </span>
          </div>

          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!isValidLength || isSubmitting || readOnly}
            className="w-full sm:w-auto font-medium"
          >
            {isSubmitting ? 'Mengirim...' : id.writing.submitBtn}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.writing.submitConfirmTitle}</DialogTitle>
            <DialogDescription>{id.writing.submitConfirmBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isSubmitting}
            >
              {id.writing.cancelAction}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={isSubmitting}
            >
              {id.writing.confirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
