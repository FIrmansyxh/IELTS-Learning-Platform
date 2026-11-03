'use client';

import * as React from 'react';
import { AppShell } from './app-shell';
import { AuthGate } from './auth-gate';

/** Dipakai layout rute terproteksi: penjaga sesi + kerangka navigasi. */
export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={null}>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </React.Suspense>
  );
}
