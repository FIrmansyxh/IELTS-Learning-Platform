'use client';

import { AlertCircle } from 'lucide-react';
/**
 * Ringkasan galat `role="alert"` di atas form (galat tingkat form atau ringkasan jumlah isian bermasalah).
 */
export function FormErrorSummary({ message, id }: { message: string | null; id?: string }) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
