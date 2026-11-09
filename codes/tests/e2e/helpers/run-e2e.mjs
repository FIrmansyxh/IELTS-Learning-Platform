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
 * Env opsional: E2E_HOLD=1 (stack tetap hidup untuk debug), E2E_PORT (bawaan 3045), E2E_CHROME_PATH (Chromium terpasang; tidak ada unduhan browser).
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  AI_ENABLED: 'false',
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

let server;
let code = 1;
function cleanup() {
  if (server && !server.killed) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill('SIGTERM');
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

  console.log(`[e2e] menyalakan next dev di ${base}`);
  server = spawn(process.execPath, [next, 'dev', '--turbopack', '-H', '127.0.0.1', '-p', port], {
    cwd: codesDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => undefined);
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
