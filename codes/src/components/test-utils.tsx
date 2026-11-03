import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type * as React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Render dengan penyedia minimum (Query + Tooltip). Tidak ada retry agar galat muncul cepat. */
export function renderWithProviders(ui: React.ReactElement): RenderResult & { client: QueryClient } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...result, client };
}

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> };

/** Tiru `fetch` global; kembalikan daftar panggilan. Tidak mengubah kontrak, hanya transport. */
export function mockFetch(handler: Handler) {
  const calls: Array<{ url: URL; init: RequestInit; json: unknown }> = [];
  const fn = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const json = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, json });
    const r = handler(url, init);
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json', ...(r.headers ?? {}) },
    });
  };
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}

export const USER = {
  id: 'b8f2c1a4-5d3e-4a7b-9c21-0e6f7a8b9c10',
  email: 'budi.santoso@example.test',
  display_name: 'Budi Santoso',
  role: 'learner' as const,
  target_band: 6.0,
  must_change_password: false,
  consent_recording_at: null,
  keep_recordings: true,
  placement_completed_at: null,
};

export const errorBody = (code: string, message: string, details?: Array<{ path: string; code: string; message: string }>) => ({
  error: { code, message, request_id: '11111111-1111-4111-8111-111111111111', ...(details ? { details } : {}) },
});
