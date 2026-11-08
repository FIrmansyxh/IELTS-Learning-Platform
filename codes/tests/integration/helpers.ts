import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { execute, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import type { RouteHandler } from '@/server/http/withApi';

export interface Res {
  status: number;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Headers;
  cookie: string | null;
}

let ipCounter = 1;
export const freshIp = () => `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;

export async function call(
  handler: RouteHandler,
  method: string,
  url: string,
  opts: { body?: unknown; cookie?: string | null; headers?: Record<string, string>; params?: Record<string, string>; rawBody?: string; ip?: string } = {},
): Promise<Res> {
  const headers: Record<string, string> = {
    origin: 'http://localhost:3000',
    'x-forwarded-for': opts.ip ?? freshIp(),
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined || opts.rawBody !== undefined) headers['content-type'] ??= 'application/json';
  if (opts.cookie) headers.cookie = opts.cookie;
  const req = new Request(`http://localhost:3000${url}`, {
    method,
    headers,
    body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  const setCookie = res.headers.getSetCookie?.().find((c) => c.includes('session-token')) ?? null;
  return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers, cookie: setCookie };
}

/** `name=value` dari header Set-Cookie (untuk dikirim kembali). */
export const cookieOf = (setCookie: string | null) => (setCookie ? setCookie.split(';')[0]! : null);

/** Kompatibilitas tes lama: "email" kini hanya nama profil unik. */
export const uniqueEmail = (p = 'u') => `${p} ${randomUUID().slice(0, 8)}`;
export const STRONG_PASSWORD = 'kopi-tubruk-2026!';

export async function resetState() {
  resetRateLimits();
}

export async function exec(query: ReturnType<typeof sql>) {
  return execute(getDb(), query);
}

// ---- fabrik pengguna/sesi untuk tes lintas spec ----
import { users } from '@/db/schema';
import { POST as selectRoute } from '@/app/api/v1/profiles/[profile_id]/select/route';

export async function makeUser(over: Partial<typeof users.$inferInsert> = {}, password = STRONG_PASSWORD) {
  const [u] = await getDb()
    .insert(users)
    // Nama unik per pemanggilan: indeks nama profil unik (SPEC-025).
    .values({ displayName: `Uji ${randomUUID().slice(0, 8)}`, ...over })
    .returning();
  // `email` = nama profil (pengenal untuk loginAs); tidak ada email/password lagi.
  return { user: u!, email: u!.displayName, password };
}

/** Pilih profil (SPEC-025) berdasarkan nama: menerbitkan cookie sesi tanpa kredensial. */
export async function loginAs(name: string, _password?: string): Promise<{ status: number; cookie: string | null; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  void _password;
  const rows = (await execute(getDb(), sql`SELECT id FROM users WHERE lower(display_name) = lower(${name}) AND deleted_at IS NULL`)).rows as Array<{ id: string }>;
  const id = rows[0]?.id ?? '00000000-0000-4000-8000-000000000000';
  const r = await call(selectRoute, 'POST', `/api/v1/profiles/${id}/select`, { params: { profile_id: id } });
  return { status: r.status, json: r.json, cookie: cookieOf(r.cookie) };
}

export async function learnerSession(over: Partial<typeof users.$inferInsert> = {}) {
  const a = await makeUser(over);
  const s = await loginAs(a.email, a.password);
  return { ...a, cookie: s.cookie! };
}

// ---- multipart (SPEC-018/019) ----
export async function callMultipart(
  handler: RouteHandler,
  url: string,
  opts: { fields?: Array<[string, string]>; files?: Array<{ name?: string; filename: string; data: Buffer | Uint8Array; type?: string }>; cookie?: string | null; ip?: string } = {},
  method = 'POST',
): Promise<Res> {
  const fd = new FormData();
  for (const [k, v] of opts.fields ?? []) fd.append(k, v);
  for (const f of opts.files ?? []) fd.append(f.name ?? 'file', new Blob([f.data as BlobPart], { type: f.type ?? 'application/octet-stream' }), f.filename);
  const headers: Record<string, string> = { origin: 'http://localhost:3000', 'x-forwarded-for': opts.ip ?? freshIp() };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await handler(new Request(`http://localhost:3000${url}`, { method, headers, body: fd }), { params: Promise.resolve({}) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers, cookie: null };
}
