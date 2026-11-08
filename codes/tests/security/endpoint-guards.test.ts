import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const API_ROOT = path.join(process.cwd(), 'src', 'app', 'api');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

// Pengecualian terdokumentasi: GET /api/health (SPEC-000) bukan endpoint aplikasi v1.
const EXEMPT = new Set([path.join(API_ROOT, 'health', 'route.ts')]);

describe('endpoint guards (SPEC-001): semua route.ts dibungkus withApi dengan auth eksplisit', () => {
  const files = routeFiles(API_ROOT).filter((f) => !EXEMPT.has(f));

  it('menemukan route handler', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = path.relative(API_ROOT, file).replaceAll('\\', '/');
    it(`${rel}: setiap handler memakai withApi({ auth: ... })`, async () => {
      const src = readFileSync(file, 'utf8');
      const exported = METHODS.filter((m) => new RegExp(`export\\s+(const|async function|function)\\s+${m}\\b`).test(src));
      expect(exported.length, 'route tanpa handler').toBeGreaterThan(0);
      for (const m of exported) {
        expect(src, `${m} harus berupa withApi`).toMatch(new RegExp(`export\\s+const\\s+${m}\\s*=\\s*withApi\\(`));
      }
      expect((src.match(/withApi\(/g) ?? []).length).toBe(exported.length);
      expect((src.match(/auth:\s*'(public|user|admin)'/g) ?? []).length).toBeGreaterThanOrEqual(exported.length);
      // Modul benar-benar mengekspor fungsi bertanda __withApi (hasil runtime).
      const mod = (await import(/* @vite-ignore */ file.replaceAll('\\', '/'))) as Record<string, { __withApi?: { auth: string } }>;
      for (const m of exported) expect(['public', 'user', 'admin']).toContain(mod[m]?.__withApi?.auth);
    });
  }

  it('endpoint admin memakai auth admin; endpoint /auth selain publik memakai auth user', () => {
    for (const f of files) {
      const rel = path.relative(API_ROOT, f).replaceAll('\\', '/');
      const src = readFileSync(f, 'utf8');
      if (rel.startsWith('v1/admin/')) expect(src, rel).not.toMatch(/auth:\s*'(public|user)'/);
      if (rel.startsWith('v1/auth/')) expect(src, rel).toMatch(/auth:\s*'user'/);
    }
  });

  it('SPEC-025: satu-satunya endpoint tanpa sesi adalah profil lokal', () => {
    const publicRoutes = files
      .filter((f) => /auth:\s*'public'/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(API_ROOT, f).replaceAll('\\', '/'))
      .sort();
    expect(publicRoutes).toEqual([
      'v1/profiles/[profile_id]/route.ts',
      'v1/profiles/[profile_id]/select/route.ts',
      'v1/profiles/leave/route.ts',
      'v1/profiles/route.ts',
    ]);
  });

  it('tidak ada sql.raw di src/server', () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = path.join(d, n);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
      });
    for (const f of walk(path.join(process.cwd(), 'src', 'server'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/sql\.raw\(/);
    }
  });
});
