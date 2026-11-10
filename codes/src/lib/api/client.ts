import type { z } from 'zod';
import { ErrorBodySchema } from '@/contracts/common';
import { changesLearnerState, emitLearnerStateChanged } from '@/lib/learner-state';

export type ApiErrorDetail = { path: string; code: string; message: string };

/** Galat dari API (envelope `error`) atau galat jaringan/kontrak di sisi klien. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: ApiErrorDetail[];
  readonly retryAfterSec: number | null;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    details?: ApiErrorDetail[];
    retryAfterSec?: number | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.details = init.details ?? [];
    this.retryAfterSec = init.retryAfterSec ?? null;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export type QueryValue = string | number | boolean | null | undefined;

export type ApiRequest<S extends z.ZodType | undefined> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Body JSON; tidak pernah berisi role/status/skor dari klien kecuali endpoint admin yang mengizinkan. */
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Skema respons (envelope penuh). Tanpa skema = respons tanpa body (204). */
  schema?: S;
  signal?: AbortSignal;
  /** Untuk pengiriman saat pagehide (posisi belajar, bukti belajar). */
  keepalive?: boolean;
};

const API_BASE = '/api/v1';

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get('Retry-After');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : null;
}

/**
 * Pemanggil API tunggal. Semua modul `src/lib/api/*` memakainya sehingga uji cukup
 * meniru `fetch` global tanpa mengubah kontrak.
 */
export async function apiFetch<S extends z.ZodType | undefined = undefined>(
  path: string,
  req: ApiRequest<S> = {},
): Promise<S extends z.ZodType ? z.infer<S> : void> {
  const method = req.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;
  if (req.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(req.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, req.query), {
      method,
      headers,
      body,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: req.signal,
      keepalive: req.keepalive,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' });
  }

  if (!res.ok) {
    const retryAfterSec = parseRetryAfter(res);
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* tubuh bukan JSON */
    }
    const parsed = ErrorBodySchema.safeParse(json);
    if (parsed.success) {
      const { code, message, request_id, details } = parsed.data.error;
      throw new ApiError({ status: res.status, code, message, requestId: request_id, details, retryAfterSec });
    }
    throw new ApiError({
      status: res.status,
      code: res.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN',
      message: `HTTP ${res.status}`,
      requestId: res.headers.get('X-Request-Id'),
      retryAfterSec,
    });
  }

  // Poin, streak, radar, riwayat, dan peta diturunkan dari hasil ini: beri tahu penyedia query agar tidak basi.
  if (changesLearnerState(method, path)) emitLearnerStateChanged();

  if (!req.schema) {
    return undefined as S extends z.ZodType ? z.infer<S> : void;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError({ status: res.status, code: 'RESPONSE_INVALID', message: 'Respons bukan JSON' });
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) {
    // Drift kontrak: jangan ditambal diam-diam di klien.
    throw new ApiError({
      status: res.status,
      code: 'RESPONSE_INVALID',
      message: `Respons ${method} ${path} tidak sesuai kontrak`,
      requestId: res.headers.get('X-Request-Id'),
    });
  }
  return parsed.data as S extends z.ZodType ? z.infer<S> : void;
}
