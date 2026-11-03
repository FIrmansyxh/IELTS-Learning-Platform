'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import * as React from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isApiError } from '@/lib/api/client';

function shouldRetry(count: number, error: unknown): boolean {
  // Galat 4xx dari kontrak tidak diulang; jaringan/5xx maksimal 2 kali.
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return count < 2;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

/** Penyedia global: tema (kunci `theme` di localStorage), TanStack Query, Tooltip, Toast. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => makeQueryClient());
  return (
    <ThemeProvider
      attribute={['class', 'data-theme']}
      defaultTheme="system"
      enableSystem
      storageKey="theme"
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
