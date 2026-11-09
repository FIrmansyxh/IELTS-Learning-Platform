#!/usr/bin/env node
/**
 * Runner E2E pasca-MVP (Mix Builder, Jalur Belajar, Simulasi).
 *
 *   node tests/e2e/helpers/run-e2e.mjs [argumen playwright, mis. --project=desktop mix-builder]
 *
 * Langkah: buat folder temp -> DB SQLite temp -> db:migrate -> db:seed -> impor konten
 * (gt-listening -> gt-bank -> gt-modules/3.3.3, --publish) -> nyalakan `next dev` pada port bebas
 * -> jalankan Playwright (E2E_SKIP_WEBSERVER=1) -> hentikan server -> hapus folder temp.
 * Tidak menyentuh codes/.env maupun codes/data/ielts.db.
 *
 * VARIAN domain Ujian dan Penilaian (salinan run-e2e.mjs; aslinya tidak diubah). Perbedaan:
 *  1. `next dev` berjalan dari "aplikasi bayangan" codes/.e2e-app-<port> (junction ke src/, public/, content/, dst.; distDir
 *     sendiri `.next-e2e-<port>`), supaya beberapa server dev E2E paralel (port 3051/3052/3053) tidak saling merusak
 *     codes/.next (gejala: "Cannot find module for page", 404/500 sesaat).
 *  2. E2E_AI=mock -> AI_ENABLED=true + LLM_DRIVER=mock (jalur Writing berbasis AI); selain itu AI_ENABLED=false seperti aslinya.
 *  3. Paket konten sintetis tests/fixtures/e2e-content/exams diimpor sebelum server dinyalakan.
 *
 * Env opsional: E2E_HOLD=1 (stack tetap hidup untuk debug), E2E_PORT (bawaan 3045), E2E_CHROME_PATH (Chromium terpasang; tidak ada unduhan browser).
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const codesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const port = process.env.E2E_PORT ?? '3045';
const base = `http://127.0.0.1:${port}`;

// Penjaga: server lama di port yang sama membuat tes menyambung ke DB basi (hasil menyesatkan). Berhenti bila sudah ada yang menjawab.
try {
  const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
  if (r.ok) {
    console.error(`[e2e] port ${port} sudah dipakai server lain (jawab /api/health). Hentikan dulu atau set E2E_PORT.`);
    process.exit(2);
  }
} catch {
  /* tidak ada yang menjawab: aman */
}
const tmp = mkdtempSync(path.join(tmpdir(), 'ielts-e2e-'));
const dbPath = path.join(tmp, 'e2e.db');
const assetsDir = path.join(tmp, 'assets');
mkdirSync(assetsDir, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: 'development',
  LOG_LEVEL: 'warn',
  DATABASE_PATH: dbPath,
  ASSETS_DIR: assetsDir,
  STORAGE_DRIVER: 'fs',
  AUTH_SECRET: 'e2e-auth-secret-e2e-auth-secret-e2e-0123456789',
  IP_HMAC_SECRET: 'e2e-ip-hmac-secret-e2e-ip-hmac-secret-0123456789',
  AUTH_URL: base,
  AUTH_TRUST_HOST: 'false',
  ALLOWED_HOSTS: `127.0.0.1:${port},localhost:${port}`,
  AI_ENABLED: process.env.E2E_AI === 'mock' ? 'true' : 'false',
  ...(process.env.E2E_AI === 'mock' ? { LLM_DRIVER: 'mock', E2E_AI_MOCK: '1' } : {}),
  E2E_DATABASE_PATH: dbPath,
  E2E_BASE_URL: base,
  E2E_SKIP_WEBSERVER: '1',
};
// Pastikan sisa env produksi/lokal tidak ikut terbaca.
delete env.DATABASE_URL;

const tsx = path.join(codesDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const next = path.join(codesDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const playwright = path.join(codesDir, 'node_modules', '@playwright', 'test', 'cli.js');

function run(label, args) {
  console.log(`[e2e] ${label}`);
  const r = spawnSync(process.execPath, args, { cwd: codesDir, env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${label} gagal (kode ${r.status})`);
}


/** Aplikasi bayangan: junction ke isi codes/ (kecuali artefak build) + next.config.ts dengan distDir terpisah. */
const appDir = path.join(codesDir, `.e2e-app-${port}`);
const SKIP = new Set(['.next', 'node_modules', 'test-results', 'playwright-report', 'data', 'coverage', 'tsconfig.tsbuildinfo', 'next.config.ts', 'tests', 'private']);
function buildShadowApp() {
  rmShadow();
  mkdirSync(appDir, { recursive: true });
  for (const e of readdirSync(codesDir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.e2e-app-') || e.name.startsWith('.next') || e.name.startsWith('.env')) continue;
    const from = path.join(codesDir, e.name);
    const to = path.join(appDir, e.name);
    if (e.name === 'src') cpSync(from, to, { recursive: true }); // Turbopack tidak memindai rute lewat junction
    else if (e.isDirectory()) symlinkSync(from, to, 'junction');
    else copyFileSync(from, to);
  }
  symlinkSync(path.join(codesDir, 'node_modules'), path.join(appDir, 'node_modules'), 'junction');
  mkdirSync(path.join(appDir, 'private'), { recursive: true });
  let cfg = readFileSync(path.join(codesDir, 'next.config.ts'), 'utf8');
  cfg = cfg.replace('const nextConfig: NextConfig = {', `const nextConfig: NextConfig = {\n  distDir: '.next-e2e-${port}',\n  turbopack: { root: ${JSON.stringify(codesDir)} },`);
  writeFileSync(path.join(appDir, 'next.config.ts'), cfg);
}
function rmShadow() {
  if (!existsSync(appDir)) return;
  for (const e of readdirSync(appDir, { withFileTypes: true })) {
    const p = path.join(appDir, e.name);
    try {
      if (e.isSymbolicLink() || (e.isDirectory() && ['public', 'content', 'scripts', 'drizzle', 'node_modules', 'schemas'].includes(e.name))) {
        try { unlinkSync(p); } catch { rmdirSync(p); }
      }
    } catch { /* lanjut */ }
  }
  rmSync(appDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

let server;
let code = 1;
function cleanup() {
  if (server && !server.killed) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill('SIGTERM');
  }
  try {
    rmShadow();
  } catch (e) {
    console.warn('[e2e] gagal menghapus aplikasi bayangan:', appDir, e?.message);
  }
  try {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (e) {
    console.warn('[e2e] gagal menghapus folder temp:', tmp, e?.message);
  }
}
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

try {
  run('db:migrate', [tsx, 'scripts/migrate.ts']);
  run('db:seed', [tsx, 'scripts/seed.ts']);
  for (const dir of ['content/gt-listening', 'content/gt-bank']) {
    run(`content:import ${dir}`, [tsx, 'scripts/content-import.ts', 'import', '--dir', dir, '--publish']);
  }

  // Fixture sintetis: varian materi PRACTICE_FIRST untuk 3.3.3 (konten produksi belum punya varian; SPEC-021 D3).
  const variantDir = path.join(tmp, 'variant-3.3.3');
  mkdirSync(variantDir, { recursive: true });
  const pkg = JSON.parse(readFileSync(path.join(codesDir, 'content', 'gt-modules', '3.3.3', 'content.json'), 'utf8'));
  pkg.sub_modules[0].materials_variants = [
    { style: 'PRACTICE_FIRST', article_markdown: '## Penjelasan setelah latihan (varian uji E2E)\n\nBaca ini setelah mengerjakan soal.' },
  ];
  writeFileSync(path.join(variantDir, 'content.json'), JSON.stringify(pkg));
  // Diimpor MENGGANTIKAN paket 3.3.3 biasa (bukan sesudahnya): impor ulang yang hanya menambah varian dianggap NOOP
  // oleh perencana impor (snapshot tidak memuat materials_variants), jadi varian tak akan masuk ke sub-modul yang sudah ada.
  run('content:import gt-modules/3.3.3 + varian PRACTICE_FIRST (sintetis)', [tsx, 'scripts/content-import.ts', 'import', '--dir', variantDir, '--publish']);

  run('content:import tests/fixtures/e2e-content/exams (sintetis)', [tsx, 'scripts/content-import.ts', 'import', '--dir', 'tests/fixtures/e2e-content/exams', '--publish']);

  buildShadowApp();
  console.log(`[e2e] menyalakan next dev di ${base} (aplikasi bayangan ${path.basename(appDir)})`);
  server = spawn(process.execPath, [next, 'dev', '--turbopack', '-H', '127.0.0.1', '-p', port], {
    cwd: appDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.env.E2E_SERVER_LOG && process.stderr.write(d));
  server.stderr.on('data', (d) => process.env.E2E_SERVER_LOG && process.stderr.write(d));

  const deadline = Date.now() + 120_000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!up) throw new Error('server dev tidak siap dalam 120 detik');

  if (process.env.E2E_HOLD) {
    // Mode debug: biarkan stack hidup (DB temp + server) agar spec bisa dijalankan berulang. Ctrl+C untuk berhenti.
    console.log(`[e2e] HOLD: E2E_DATABASE_PATH=${dbPath} E2E_BASE_URL=${base}`);
    await new Promise(() => undefined);
  }
  const pw = spawnSync(process.execPath, [playwright, 'test', ...process.argv.slice(2)], { cwd: codesDir, env, stdio: 'inherit' });
  code = pw.status ?? 1;
} catch (e) {
  console.error('[e2e]', e instanceof Error ? e.message : e);
} finally {
  cleanup();
}
process.exit(code);
