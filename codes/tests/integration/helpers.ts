import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
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

export const uniqueEmail = (p = 'u') => `${p}.${randomUUID().slice(0, 8)}@example.test`;
export const STRONG_PASSWORD = 'kopi-tubruk-2026!';

export async function resetState() {
  resetRateLimits();
}

export async function exec(query: ReturnType<typeof sql>) {
  return getDb().execute(query);
}

// ---- fabrik pengguna/sesi untuk tes lintas spec ----
import { users } from '@/db/schema';
import { hashPassword } from '@/server/auth/password';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';

export async function makeUser(over: Partial<typeof users.$inferInsert> = {}, password = STRONG_PASSWORD) {
  const email = over.email ?? uniqueEmail();
  const [u] = await getDb()
    .insert(users)
    .values({ email, displayName: 'Uji Coba', passwordHash: await hashPassword(password), ...over })
    .returning();
  return { user: u!, email, password };
}

export async function loginAs(email: string, password: string): Promise<{ status: number; cookie: string | null; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await call(loginRoute, 'POST', '/api/v1/auth/login', { body: { email, password } });
  return { status: r.status, json: r.json, cookie: cookieOf(r.cookie) };
}

/** Buat admin + sesi siap pakai. */
export async function adminSession(over: Partial<typeof users.$inferInsert> = {}) {
  const a = await makeUser({ role: 'admin', ...over });
  const s = await loginAs(a.email, a.password);
  return { ...a, cookie: s.cookie! };
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

/**
 * Membersihkan fixture konten/impor/aset agar berkas itest lain (DB bersama, dijalankan serial) tidak melihat sisa data:
 * batch impor (FK admin_user_id RESTRICT), modul/sub-modul uji `1.99`, aset, set, dan materi. Dipakai di beforeEach dan afterAll.
 */
export async function cleanupContentFixtures() {
  const db = getDb();
  await db.execute(sql`DELETE FROM attempts`);
  await db.execute(sql`DELETE FROM import_batch_items`);
  await db.execute(sql`DELETE FROM async_jobs WHERE import_batch_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM import_batches`);
  await db.execute(sql`DELETE FROM content_revisions`);
  await db.execute(sql`DELETE FROM assessment_sets`);
  await db.execute(sql`DELETE FROM learning_materials`);
  await db.execute(sql`DELETE FROM sub_modules WHERE sub_module_code LIKE '1.99.%'`);
  await db.execute(sql`DELETE FROM modules WHERE module_code = '1.99'`);
  await db.execute(sql`DELETE FROM content_assets`);
  await db.execute(sql`DELETE FROM content_sources WHERE left(code, 2) = 'T_'`);
  await db.execute(sql`UPDATE sub_modules SET status='DRAFT', content_version=1`);
  await db.execute(sql`UPDATE modules SET status='DRAFT' WHERE status <> 'DRAFT'`);
}
