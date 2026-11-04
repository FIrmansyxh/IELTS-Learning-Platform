/**
 * Global setup Playwright: memastikan server hidup lalu memuat "dunia E2E" (tests/e2e/support/seed-world.ts) bila belum ada.
 * Prasyarat env: `. tests/e2e/e2e.env.sh` (DB ielts_e2e, AI mock). Seed idempoten.
 */
import { spawnSync } from 'node:child_process';

export default async function globalSetup() {
  const res = await fetch('http://127.0.0.1:3000/api/health').catch(() => null);
  if (!res || res.status !== 200) throw new Error('Server E2E tidak sehat di 127.0.0.1:3000 (jalankan npm run dev + worker dengan e2e.env.sh)');
  const r = spawnSync('npx', ['tsx', 'tests/e2e/support/seed-world.ts'], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw new Error('seed-world gagal');
}
