import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createUser, type TestUser } from './db';

export const ORIGIN = 'http://127.0.0.1:3000';

let ipSeq = 1;
/** IP unik per permintaan agar rate limit (per-IP) tidak menular antar tes. */
export const freshIp = () => `10.20.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

export async function apiLogin(request: APIRequestContext, u: Pick<TestUser, 'email' | 'password'>) {
  const res = await request.post('/api/v1/auth/login', {
    headers: { origin: ORIGIN, 'x-forwarded-for': freshIp() },
    data: { email: u.email, password: u.password },
  });
  expect(res.status(), await res.text()).toBe(200);
  return res;
}

/** Masuk lewat API pada konteks browser (cookie tersimpan di konteks), lalu kembalikan pengguna. */
export async function loginContext(context: BrowserContext, u: Pick<TestUser, 'email' | 'password'>) {
  await apiLogin(context.request, u);
}

export async function newLearner(context: BrowserContext, opts: Parameters<typeof createUser>[0] = {}) {
  const u = await createUser(opts);
  await loginContext(context, u);
  return u;
}

export async function newAdmin(context: BrowserContext) {
  const u = await createUser({ role: 'admin', prefix: 'adm' });
  await loginContext(context, u);
  return u;
}

/** Permintaan API terautentikasi (mengikuti cookie konteks). */
export async function api(context: BrowserContext, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, data?: unknown) {
  const res = await context.request.fetch(url, { method, headers: { origin: ORIGIN, 'x-forwarded-for': freshIp() }, data: data as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const text = await res.text();
  let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* bukan JSON */
  }
  return { status: res.status(), json, text };
}

/** Tidak ada scroll horizontal pada halaman (lebar dokumen <= lebar viewport). */
export async function expectNoHorizontalScroll(page: Page, opts: { force?: boolean } = {}) {
  // Pada >= 1024px (sidebar) lihat defek D-001 (tes khusus di spec000-layout); guard umum hanya untuk viewport sempit.
  if (!opts.force && (page.viewportSize()?.width ?? 0) >= 1024) return;
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(r.sw, `scrollWidth ${r.sw} > clientWidth ${r.cw}`).toBeLessThanOrEqual(r.cw + 1);
}

/** axe-core (transitif di node_modules, tanpa @axe-core/playwright). Mengembalikan pelanggaran serius/kritis. */
export async function axeViolations(page: Page, impacts: string[] = ['serious', 'critical']) {
  const req = createRequire(import.meta.url);
  const src = readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
  await page.evaluate(src);
  const res = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations); // eslint-disable-line @typescript-eslint/no-explicit-any
  return (res as any[]).filter((v) => impacts.includes(v.impact)).map((v) => `${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes[0]?.target?.join(' ')}`); // eslint-disable-line @typescript-eslint/no-explicit-any
}
