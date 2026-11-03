'use client';

import * as React from 'react';
import { AuthGate } from '@/components/shell/auth-gate';

/** Rute Mode Ujian: hanya penjaga sesi, tanpa navigasi global (design-system 5.19). */
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </React.Suspense>
  );
}
