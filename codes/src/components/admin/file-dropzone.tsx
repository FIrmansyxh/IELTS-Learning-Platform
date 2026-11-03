'use client';

import { FileUp, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { id } from '@/i18n/id';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Dropzone file (design-system 5.2/5.20). Seluruh area adalah `<label>` bagi input file,
 * sehingga klik, keyboard (Tab + Enter/Spasi), dan seret-lepas memakai satu kontrol asli.
 */
export function FileDropzone({
  file,
  onFile,
  accept,
  disabled,
  prompt,
  pickLabel,
  replaceLabel,
  hint,
  inputId,
  describedBy,
  invalid,
  large,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  accept: string;
  disabled?: boolean;
  prompt: string;
  pickLabel: string;
  replaceLabel: string;
  hint?: string;
  inputId: string;
  describedBy?: string;
  invalid?: boolean;
  large?: boolean;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function take(files: FileList | null) {
    const f = files && files.length > 0 ? files[0]! : null;
    onFile(f);
  }

  return (
    <div className="grid gap-2">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) take(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors focus-within:ring-2 focus-within:ring-ring',
          large && 'min-h-48 p-10',
          dragging ? 'border-primary bg-accent' : 'border-[var(--color-border-strong,var(--border))] bg-card',
          invalid && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <FileUp className="size-7 text-muted-foreground" aria-hidden="true" />
        <span>{prompt}</span>
        <span className="inline-flex h-9 items-center rounded-md border bg-background px-3 font-medium shadow-xs">
          {file ? replaceLabel : pickLabel}
        </span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          data-testid={`${inputId}-input`}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files);
            // izinkan memilih ulang berkas yang sama setelah galat
            e.target.value = '';
          }}
        />
      </label>
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm" data-testid="dropzone-file">
          <span className="min-w-0 break-all">
            {file.name} <span className="text-muted-foreground">({formatBytes(file.size)})</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`${id.common.close}: ${file.name}`}
            onClick={() => onFile(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
