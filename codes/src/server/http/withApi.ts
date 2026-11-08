import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { config } from '../config';
import { logger } from '../logger';
import { safeErr } from '../safe-error';
import { buildClearCookie, hashIp } from '../auth/session';
import { requireUser, type SessionUser } from '../auth/guards';
import { ApiError } from './errors';
import { consume, type BucketName } from './rate-limit';
import { zodDetails } from './zod-errors';

export type AuthLevel = 'public' | 'user' | 'admin';
const MAX_BODY_BYTES = 1_048_576;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface RateLimitRule<C> {
  bucket: BucketName;
  /** 'ip' / 'user' dihitung sebelum body dibaca; fungsi dihitung setelah body divalidasi. */
  key: 'ip' | 'user' | ((ctx: C) => string);
}

export interface ApiContext<B, Q, P> {
  req: Request;
  requestId: string;
  /** null pada endpoint `public`. */
  user: SessionUser | null;
  body: B;
  query: Q;
  params: P;
  ip: string;
  /** HMAC IP (untuk audit_log.ip_hash). */
  ipHash: string;
  /** Tambahkan header Set-Cookie ke respons. */
  setCookie(value: string): void;
  clearCookie(): void;
}

export interface ApiResult {
  status?: number;
  data?: unknown;
  meta?: unknown;
  headers?: Record<string, string>;
}

export interface WithApiOptions<B extends z.ZodType, Q extends z.ZodType, P extends z.ZodType> {
  /** WAJIB eksplisit (tes endpoint-guards memeriksanya). */
  auth: AuthLevel;
  body?: B;
  query?: Q;
  params?: P;
  rateLimit?: Array<RateLimitRule<ApiContext<z.output<B>, z.output<Q>, z.output<P>>>>;
  /** Body tidak dibaca/divalidasi sebagai JSON (mis. multipart); handler membaca `ctx.req` sendiri dengan batas ukuran. */
  raw?: boolean;
}

type RouteCtx = { params?: Promise<Record<string, string | string[]>> };
export type RouteHandler = ((req: Request, ctx?: RouteCtx) => Promise<Response>) & {
  __withApi: { auth: AuthLevel };
};

export function clientIp(req: Request): string {
  if (config.trustHost()) {
    const xff = req.headers.get('x-forwarded-for');
    const first = xff?.split(',')[0]?.trim();
    if (first) return first;
    const real = req.headers.get('x-real-ip');
    if (real) return real.trim();
  }
  return 'direct';
}

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `Host` loopback sah: nama dari daftar, opsional `:port` berupa 1-5 digit. Tanpa regex (hindari backtracking). */
export function isLoopbackHost(raw: string): boolean {
  const h = raw.trim().toLowerCase();
  const name = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : (h.split(':')[0] ?? '');
  if (!LOOPBACK_NAMES.has(name)) return false;
  const rest = h.slice(name.length);
  if (rest === '') return true;
  const port = rest.slice(1);
  return rest.startsWith(':') && port.length >= 1 && port.length <= 5 && [...port].every((c) => c >= '0' && c <= '9');
}

/**
 * SPEC-025 D4: aplikasi hanya melayani loopback. Tolak `Host` selain localhost/127.0.0.1/[::1] agar situs
 * lain tidak dapat mengakses API lewat DNS rebinding. Header `Host` yang tidak ada (mis. pemanggilan
 * internal/tes) diperiksa lewat hostname URL saja.
 */
function checkHost(req: Request): void {
  const host = req.headers.get('host');
  if (host !== null && !isLoopbackHost(host)) throw new ApiError('HOST_NOT_ALLOWED');
  let hostname = '';
  try {
    hostname = new URL(req.url).host;
  } catch {
    throw new ApiError('HOST_NOT_ALLOWED');
  }
  if (!isLoopbackHost(hostname)) throw new ApiError('HOST_NOT_ALLOWED');
}

function checkCsrf(req: Request): void {
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      // Same-origin: Origin sama persis dengan Host permintaan (Host sudah dipastikan loopback oleh checkHost).
      // Port loopback lain TIDAK diterima: SameSite menganggap semua port localhost satu situs.
      const requestHost = req.headers.get('host')?.trim().toLowerCase();
      if (config.allowedHosts().includes(originHost) || (requestHost !== undefined && originHost === requestHost)) return;
    } catch {
      /* Origin tidak valid */
    }
    throw new ApiError('CSRF_ORIGIN_MISMATCH');
  }
  if (req.headers.get('sec-fetch-site') === 'same-origin') return;
  throw new ApiError('CSRF_ORIGIN_MISMATCH');
}

function limit(bucket: BucketName, key: string): void {
  const wait = consume(bucket, key);
  if (wait !== null) {
    throw new ApiError('RATE_LIMITED', { headers: { 'Retry-After': String(wait) } });
  }
}

/** Baca stream sambil menghitung byte; hentikan begitu melewati batas (tahan terhadap chunked tanpa Content-Length). */
async function readBodyLimited(req: Request): Promise<string> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError('PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonBody(req: Request): Promise<unknown> {
  const ct = (req.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (ct !== 'application/json') throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE');
  const text = await readBodyLimited(req);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('VALIDATION_ERROR', {
      details: [{ path: '', code: 'invalid_json', message: 'Body bukan JSON yang valid.' }],
    });
  }
}

function parseQuery(req: Request): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const sp = new URL(req.url).searchParams;
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] as string);
  }
  return out;
}

function validate<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError('VALIDATION_ERROR', { details: zodDetails(r.error) });
  return r.data;
}

export function withApi<
  B extends z.ZodType = z.ZodUndefined,
  Q extends z.ZodType = z.ZodUndefined,
  P extends z.ZodType = z.ZodUndefined,
>(
  opts: WithApiOptions<B, Q, P>,
  handler: (ctx: ApiContext<z.output<B>, z.output<Q>, z.output<P>>) => Promise<ApiResult | Response | undefined>,
): RouteHandler {
  const fn = async (req: Request, routeCtx?: RouteCtx): Promise<Response> => {
    const requestId = randomUUID();
    const cookies: string[] = [];
    let sawAuth = false;
    try {
      checkHost(req);
      if (!SAFE_METHODS.has(req.method.toUpperCase())) checkCsrf(req);

      const ip = clientIp(req);
      let ipHash = '';
      try {
        ipHash = hashIp(ip);
      } catch {
        ipHash = '';
      }
      const ctx = {
        req,
        requestId,
        user: null as SessionUser | null,
        body: undefined as unknown,
        query: undefined as unknown,
        params: undefined as unknown,
        ip,
        ipHash,
        setCookie: (v: string) => void cookies.push(v),
        clearCookie: () => void cookies.push(buildClearCookie()),
      };

      if (opts.auth === 'public') limit('general_ip', ip);

      const rules = opts.rateLimit ?? [];
      const staticRules = rules.filter((r) => r.key === 'ip' || r.key === 'user');
      const dynamicRules = rules.filter((r) => typeof r.key === 'function');

      if (opts.auth !== 'public') {
        sawAuth = true;
        const auth = await requireUser(req, { requireAdmin: opts.auth === 'admin' });
        ctx.user = auth.user;
        if (auth.refreshedCookie) cookies.push(auth.refreshedCookie);
        limit('general_user', auth.user.id);
      }

      for (const r of staticRules) {
        if (r.key === 'ip') limit(r.bucket, ip);
        else if (ctx.user) limit(r.bucket, ctx.user.id);
      }

      if (opts.params) {
        const raw = routeCtx?.params ? await routeCtx.params : {};
        ctx.params = validate(opts.params, raw);
      }
      if (opts.query) ctx.query = validate(opts.query, parseQuery(req));
      if (opts.body && !opts.raw) ctx.body = validate(opts.body, await readJsonBody(req));

      for (const r of dynamicRules) {
        limit(r.bucket, (r.key as (c: unknown) => string)(ctx));
      }

      const result = await handler(ctx as ApiContext<z.output<B>, z.output<Q>, z.output<P>>);
      // Respons mentah (mis. berkas aset biner): handler bertanggung jawab atas Cache-Control/Content-Type.
      if (result instanceof Response) return passthrough(result, requestId, cookies);
      return respond(requestId, result ?? { status: 204 }, cookies);
    } catch (err) {
      return respondError(err, requestId, cookies, sawAuth, req);
    }
  };
  return Object.assign(fn, { __withApi: { auth: opts.auth } }) as RouteHandler;
}

const BASE_HEADERS = { 'Cache-Control': 'private, no-store' };

function respond(requestId: string, r: ApiResult, cookies: string[]): Response {
  const status = r.status ?? 200;
  const headers = new Headers({ ...BASE_HEADERS, 'X-Request-Id': requestId, ...(r.headers ?? {}) });
  for (const c of cookies) headers.append('Set-Cookie', c);
  if (status === 204) return new Response(null, { status, headers });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  const payload: Record<string, unknown> = { data: r.data };
  if (r.meta !== undefined) payload.meta = r.meta;
  return new Response(JSON.stringify(payload), { status, headers });
}

function passthrough(res: Response, requestId: string, cookies: string[]): Response {
  const headers = new Headers(res.headers);
  headers.set('X-Request-Id', requestId);
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function respondError(err: unknown, requestId: string, cookies: string[], hadAuth: boolean, req: Request): Response {
  let api: ApiError;
  if (err instanceof ApiError) {
    api = err;
  } else {
    logger.error({ requestId, method: req.method, path: new URL(req.url).pathname, err: errInfo(err) }, 'galat tak terduga');
    api = new ApiError('INTERNAL_ERROR');
  }
  const headers = new Headers({
    ...BASE_HEADERS,
    'X-Request-Id': requestId,
    'Content-Type': 'application/json; charset=utf-8',
    ...(api.headers ?? {}),
  });
  const cookieList = [...cookies];
  if (api.code === 'UNAUTHENTICATED' && hadAuth && (req.headers.get('cookie') ?? '').length > 0) {
    cookieList.length = 0;
    cookieList.push(buildClearCookie());
  }
  for (const c of cookieList) headers.append('Set-Cookie', c);
  if (api.status === 503 && !headers.has('Retry-After')) headers.set('Retry-After', '5');
  const body = {
    error: { code: api.code, message: api.message, request_id: requestId, ...(api.details ? { details: api.details } : {}) },
  };
  return new Response(JSON.stringify(body), { status: api.status, headers });
}

/** Hanya ke log server; tidak pernah ke respons dan tanpa nilai input. */
function errInfo(err: unknown) {
  return safeErr(err);
}
