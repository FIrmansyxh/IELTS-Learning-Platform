/**
 * Logika peluncur `npm run start:local` (SPEC-025 Fase 4, K1-K8). Seluruh efek samping lewat dependensi
 * yang dapat diinjeksi agar bisa diuji tanpa menyalakan server sungguhan.
 * Pintu masuk: scripts/start-local.mjs. Tidak memakai shell untuk anak proses (identik di Windows/Linux/macOS).
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { parseEnv } from 'node:util';

export const DEFAULT_PORT = 3005;
export const MIN_NODE = [22, 20];
export const HEALTH_TIMEOUT_MS = 60_000;
export const SHUTDOWN_GRACE_MS = 10_000;
export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

export const USAGE = `Pemakaian: npm run start:local -- [--port <1024-65535>] [--no-open] [--rebuild]

  --port <n>   port server (bawaan ${DEFAULT_PORT})
  --no-open    jangan buka browser
  --rebuild    paksa build ulang`;

// ---------------------------------------------------------------------------------------------
// Fungsi murni
// ---------------------------------------------------------------------------------------------

/** @returns {{ ok: true, port: number, open: boolean, rebuild: boolean, help: boolean } | { ok: false, message: string }} */
export function parseArgs(argv) {
  const out = { ok: true, port: DEFAULT_PORT, open: true, rebuild: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') out.open = false;
    else if (a === '--rebuild') out.rebuild = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--port' || a.startsWith('--port=')) {
      const raw = a === '--port' ? argv[++i] : a.slice('--port='.length);
      if (raw === undefined || !/^\d+$/.test(raw)) return { ok: false, message: `Argumen tidak valid: --port harus bilangan bulat 1024-65535 (diberi: ${raw ?? 'kosong'})` };
      const n = Number(raw);
      if (n < 1024 || n > 65535) return { ok: false, message: `Argumen tidak valid: --port harus 1024-65535 (diberi: ${n})` };
      out.port = n;
    } else return { ok: false, message: `Argumen tidak valid: ${a}` };
  }
  return out;
}

/** @returns {string | null} pesan galat, atau null bila versi memenuhi syarat. */
export function checkNode(version) {
  const m = /^v?(\d+)\.(\d+)/.exec(version);
  const maj = m ? Number(m[1]) : 0;
  const min = m ? Number(m[2]) : 0;
  const ok = maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
  if (ok) return null;
  const shown = version.startsWith('v') ? version : `v${version}`;
  return `Node.js ${shown} terlalu lama. Aplikasi butuh Node.js ${MIN_NODE.join('.')} atau lebih baru.`;
}

/** @returns {string | null} */
export function checkHostname(value) {
  if (value === undefined || value === '' || LOOPBACK_HOSTS.includes(value)) return null;
  return `HOSTNAME=${value} bukan alamat loopback. Aplikasi tanpa login tidak boleh dibuka ke jaringan. Hapus variabelnya lalu ulangi (PowerShell: Remove-Item Env:HOSTNAME; bash: unset HOSTNAME).`;
}

export function deriveEnv(baseEnv, port) {
  return {
    ...baseEnv,
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    AUTH_URL: `http://127.0.0.1:${port}`,
    ALLOWED_HOSTS: `localhost:${port},127.0.0.1:${port},[::1]:${port}`,
  };
}

export function binPaths(cwd) {
  return {
    tsx: path.join(cwd, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    next: path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'),
  };
}

export function serverArgs(nextBin, port) {
  return [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)];
}

const secretKeys = ['AUTH_SECRET', 'IP_HMAC_SECRET'];

/**
 * Siapkan codes/.env. Tidak pernah menimpa berkas yang ada. Nilai rahasia tidak pernah dicetak.
 * @returns {{ created: boolean }} atau melempar Error berpesan pengguna.
 */
export function ensureEnv({ dir, rng = () => randomBytes(32).toString('base64') }) {
  const envFile = path.join(dir, '.env');
  if (!existsSync(envFile)) {
    const example = readFileSync(path.join(dir, '.env.example'), 'utf8');
    let text = example
      .replace(/^AUTH_SECRET=.*/m, () => `AUTH_SECRET=${rng()}`)
      .replace(/^IP_HMAC_SECRET=.*/m, () => `IP_HMAC_SECRET=${rng()}`)
      .replace(/^AUTH_URL=.*/m, `AUTH_URL=http://127.0.0.1:${DEFAULT_PORT}`);
    if (!text.endsWith('\n')) text += '\n';
    writeFileSync(envFile, text, { flag: 'wx', mode: 0o600 });
    return { created: true };
  }
  const parsed = parseEnv(readFileSync(envFile, 'utf8'));
  for (const key of secretKeys) {
    const v = parsed[key];
    if (!v || Buffer.byteLength(v, 'utf8') < 32) {
      throw new Error(`.env tidak valid: ${key} kosong atau kurang dari 32 byte. Isi nilainya atau hapus .env agar dibuat otomatis.`);
    }
  }
  return { created: false };
}

const BUILD_INPUT_FILES = ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs'];

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const t = entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs;
    if (t > newest) newest = t;
  }
  return newest;
}

/** @returns {{ build: boolean, reason: 'rebuild' | 'belum-ada' | 'berubah' | 'terbaru' }} */
export function needsBuild({ cwd, rebuild = false }) {
  if (rebuild) return { build: true, reason: 'rebuild' };
  const marker = path.join(cwd, '.next', 'BUILD_ID');
  if (!existsSync(marker)) return { build: true, reason: 'belum-ada' };
  const built = statSync(marker).mtimeMs;
  let newest = 0;
  const src = path.join(cwd, 'src');
  if (existsSync(src)) newest = newestMtime(src);
  for (const f of BUILD_INPUT_FILES) {
    const p = path.join(cwd, f);
    if (existsSync(p)) newest = Math.max(newest, statSync(p).mtimeMs);
  }
  return newest > built ? { build: true, reason: 'berubah' } : { build: false, reason: 'terbaru' };
}

export function isLoopbackUrlHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
}

/**
 * Rencana `llama-server` dari env gabungan (.env + proses). Murni; probe `/health` dilakukan pemanggil.
 * @returns {{ kind: 'skip' } | { kind: 'warn', reason: string } | { kind: 'start', baseUrl: string, healthUrl: string, bin: string, args: string[] }}
 */
export function planLlama(env) {
  if (env.AI_ENABLED !== 'true' || (env.LLM_DRIVER ?? 'llamacpp') !== 'llamacpp') return { kind: 'skip' };
  let url;
  try {
    url = new URL(env.LLAMACPP_BASE_URL || 'http://127.0.0.1:8080');
  } catch {
    return { kind: 'warn', reason: 'LLAMACPP_BASE_URL tidak valid' };
  }
  if (!isLoopbackUrlHost(url.hostname)) return { kind: 'warn', reason: 'LLAMACPP_BASE_URL bukan loopback' };
  const base = `${url.protocol}//${url.host}`;
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const bin = env.LLAMACPP_BIN || 'llama-server';
  const extra = (env.LLAMACPP_ARGS || '').split(/\s+/).filter(Boolean);
  if (extra.some((a) => /^(--host|--port|-h|--listen[\w-]*)(=|$)/.test(a))) {
    return { kind: 'warn', reason: 'LLAMACPP_ARGS tidak boleh memuat --host/--port (alamat dikunci ke 127.0.0.1 dan port dari LLAMACPP_BASE_URL)' };
  }
  let modelArgs;
  if (env.LLAMACPP_MODEL_PATH) modelArgs = ['-m', env.LLAMACPP_MODEL_PATH];
  else if (env.LLAMACPP_HF_REPO) modelArgs = ['-hf', env.LLAMACPP_HF_REPO];
  return {
    kind: 'start',
    baseUrl: base,
    healthUrl: `${base}/health`,
    bin,
    args: modelArgs ? [...modelArgs, '--host', '127.0.0.1', '--port', port, '-c', '4096', '--parallel', '1', ...extra] : [],
    missingModel: !modelArgs,
  };
}

// ---------------------------------------------------------------------------------------------
// Dependensi nyata
// ---------------------------------------------------------------------------------------------

export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen({ port, host, exclusive: true });
  });
}

/** Aplikasi ini sendiri berjalan di port itu? (GET /api/health = 200 dengan data.status = "ok") */
export async function probeApp(port, fetchImpl) {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (res.status !== 200) return false;
    const body = await res.json();
    return body?.data?.status === 'ok';
  } catch {
    return false;
  }
}

async function probeOk(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(2000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Buka browser. Mengembalikan true bila perintah buka berhasil dijalankan.
 * Windows: cmd /c start "" <url>; macOS: open; lainnya: xdg-open.
 */
export function openBrowser(url, { platform, spawn, waitMs = 50 }) {
  const [cmd, args] =
    platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { shell: false, stdio: 'ignore', detached: true, windowsHide: true, ...(platform === 'win32' ? { windowsVerbatimArguments: true } : {}) });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => resolve(true), waitMs);
    child.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once('spawn', () => {
      clearTimeout(timer);
      resolve(true);
    });
    if (typeof child.unref === 'function') child.unref();
  });
}

function realCountPublished(env, cwd) {
  const file = env.DATABASE_PATH ? path.resolve(cwd, env.DATABASE_PATH) : path.join(cwd, 'data', 'ielts.db');
  return import('node:sqlite').then(({ DatabaseSync }) => {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      return Number(db.prepare("SELECT count(*) AS n FROM sub_modules WHERE status = 'PUBLISHED'").get().n);
    } finally {
      db.close();
    }
  });
}

export function defaultDeps() {
  return {
    spawn: nodeSpawn,
    fetch: (...a) => fetch(...a),
    isPortFree,
    existsSync,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    platform: process.platform,
    countPublished: realCountPublished,
    listContentDirs: (cwd) => {
      const root = path.join(cwd, 'content', 'gt-modules');
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(root, e.name))
        .sort();
    },
    openLog: (file) => {
      mkdirSync(path.dirname(file), { recursive: true });
      return openSync(file, 'a');
    },
    closeLog: (fd) => {
      try {
        closeSync(fd);
      } catch {
        /* abaikan */
      }
    },
    onSignal: (handler) => {
      const sigs = process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGBREAK'] : ['SIGINT', 'SIGTERM'];
      for (const s of sigs) process.on(s, handler);
      return () => {
        for (const s of sigs) process.off(s, handler);
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Orkestrasi
// ---------------------------------------------------------------------------------------------

function graceSleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === 'function') t.unref();
  });
}

/** Tunggu sampai anak proses berhenti; selesai dengan [code, signal]. */
function exited(child) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    child.once('exit', (code, signal) => fin([code, signal]));
    child.once('error', () => fin([1, null]));
  });
}

/**
 * Jalankan seluruh alur start:local. Mengembalikan kode keluar (K7); tidak memanggil process.exit.
 * @param {string[]} argv argumen setelah nama skrip
 * @param {{ cwd: string, env: Record<string,string|undefined>, nodeVersion: string, execPath: string,
 *           out: (s:string)=>void, err: (s:string)=>void, deps?: object, rng?: () => string }} ctx
 */
export async function runStartLocal(argv, ctx) {
  const deps = { ...defaultDeps(), ...(ctx.deps ?? {}) };
  const { cwd, out, err } = ctx;
  const log = (m) => out(`[start-local] ${m}`);
  const warn = (m) => err(`[start-local] PERINGATAN: ${m}`);
  const fail = (m, code = 1) => {
    err(`[start-local] ${m}`);
    return code;
  };

  // 1-3. argumen, Node, HOSTNAME
  const args = parseArgs(argv);
  if (!args.ok) return fail(`${args.message}\n${USAGE}`, 2);
  if (args.help) {
    out(USAGE);
    return 0;
  }
  const nodeErr = checkNode(ctx.nodeVersion);
  if (nodeErr) return fail(nodeErr);
  const hostErr = checkHostname(ctx.env.HOSTNAME);
  if (hostErr) return fail(hostErr);

  const { port } = args;
  const url = `http://127.0.0.1:${port}`;

  // 4. port
  if (!(await deps.isPortFree(port))) {
    if (await probeApp(port, deps.fetch)) {
      out(`Aplikasi sudah berjalan: ${url}`);
      if (args.open && !(await openBrowser(url, { platform: deps.platform, spawn: deps.spawn }))) {
        warn(`Gagal membuka browser, buka manual: ${url}`);
      }
      return 0;
    }
    return fail(`Port ${port} sudah dipakai program lain. Coba: npm run start:local -- --port ${port + 1 > 65535 ? 3006 : port + 1}`);
  }

  const bins = binPaths(cwd);
  if (!deps.existsSync(bins.tsx) || !deps.existsSync(bins.next)) {
    return fail('Dependensi belum terpasang. Jalankan: npm ci');
  }

  // 5. .env
  let envInfo;
  try {
    envInfo = ensureEnv({ dir: cwd, rng: ctx.rng });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  if (envInfo.created) log('.env dibuat dengan rahasia acak baru (jangan dibagikan atau di-commit).');

  // Env gabungan: nilai di proses menang atas .env (perilaku Next/loadEnvFile).
  let fileEnv = {};
  try {
    fileEnv = parseEnv(deps.readEnvFile ? deps.readEnvFile(path.join(cwd, '.env')) : readFileSync(path.join(cwd, '.env'), 'utf8'));
  } catch {
    /* sudah divalidasi ensureEnv */
  }
  const merged = { ...fileEnv, ...ctx.env };
  const childEnv = deriveEnv(ctx.env, port);

  const children = new Set();
  let stopping = false;
  let activeStep;
  const runNode = (label, nodeArgs, env = childEnv) =>
    new Promise((resolve) => {
      let child;
      try {
        child = deps.spawn(ctx.execPath, nodeArgs, { cwd, env, stdio: 'inherit', shell: false, windowsHide: true });
      } catch (e) {
        err(`[start-local] ${label}: ${e instanceof Error ? e.message : e}`);
        resolve(1);
        return;
      }
      activeStep = child;
      children.add(child);
      exited(child).then(([code]) => {
        children.delete(child);
        if (activeStep === child) activeStep = undefined;
        resolve(code ?? 1);
      });
    });

  let llamaChild;
  let llamaLogFd;
  const killChild = (child, signal) => {
    try {
      child.kill(signal);
    } catch {
      /* sudah berhenti */
    }
  };
  const shutdownAll = async () => {
    const all = [...children];
    for (const c of all) killChild(c, 'SIGTERM');
    if (all.length === 0) return;
    const timer = (deps.graceSleep ?? graceSleep)(SHUTDOWN_GRACE_MS).then(() => 'timeout');
    const winner = await Promise.race([Promise.all(all.map(exited)).then(() => 'done'), timer]);
    if (winner === 'timeout') for (const c of all) killChild(c, 'SIGKILL');
    if (llamaLogFd !== undefined) deps.closeLog(llamaLogFd);
  };

  const offSignal = deps.onSignal(() => {
    if (stopping) return;
    stopping = true;
    for (const c of children) killChild(c, 'SIGTERM');
  });
  const finish = async (code) => {
    offSignal();
    await shutdownAll();
    return code;
  };

  try {
    // 6. cadangan harian (non-kritis)
    const dbFile = merged.DATABASE_PATH ? path.resolve(cwd, merged.DATABASE_PATH) : path.join(cwd, 'data', 'ielts.db');
    if (deps.existsSync(dbFile)) {
      const code = await runNode('cadangan', [bins.tsx, 'scripts/cli.ts', 'db', 'backup']);
      if (code !== 0) warn('Cadangan gagal, aplikasi tetap dijalankan. Periksa hak tulis folder data/backups.');
    }
    if (stopping) return await finish(0);

    // 7. migrasi + seed (kritis)
    for (const [label, script] of [
      ['db:migrate', 'scripts/migrate.ts'],
      ['db:seed', 'scripts/seed.ts'],
    ]) {
      const code = await runNode(label, [bins.tsx, script]);
      if (stopping) return await finish(0);
      if (code !== 0) return await finish(fail(`Langkah ${label} gagal (kode ${code}). Server tidak dinyalakan.`));
    }

    // 8. konten bawaan (non-kritis)
    let published = 0;
    try {
      published = await deps.countPublished({ ...merged, ...childEnv }, cwd);
    } catch (e) {
      warn(`Tidak bisa memeriksa konten terbit (${e instanceof Error ? e.message : e}).`);
      published = -1;
    }
    if (published > 0) log('Konten sudah ada, impor dilewati.');
    else if (published === 0) {
      for (const dir of deps.listContentDirs(cwd)) {
        const code = await runNode('content:import', [bins.tsx, 'scripts/content-import.ts', 'import', '--dir', dir, '--publish']);
        if (stopping) return await finish(0);
        if (code !== 0) warn(`Impor konten bawaan gagal (kode ${code}): ${path.basename(dir)}. Lanjut tanpa konten tersebut.`);
      }
    }

    // 9. build
    const nb = needsBuild({ cwd, rebuild: args.rebuild });
    if (nb.build) {
      log(nb.reason === 'berubah' ? 'Sumber berubah, build ulang...' : 'Build aplikasi (pertama kali bisa beberapa menit)...');
      const code = await runNode('build', [bins.next, 'build']);
      if (stopping) return await finish(0);
      if (code !== 0) {
        return await finish(fail(`Build gagal (kode ${code}). Catatan: build pertama butuh internet untuk mengunduh font. Periksa koneksi lalu ulangi.`));
      }
    } else {
      log('Build terbaru, dilewati.');
    }

    // 10. llama-server opsional (tidak menunggu model siap)
    const plan = planLlama(merged);
    if (plan.kind === 'warn') warn(`Penilai Writing tidak dinyalakan: ${plan.reason}`);
    else if (plan.kind === 'start') {
      if (await probeOk(plan.healthUrl, deps.fetch)) {
        log('llama-server sudah berjalan, dipakai ulang.');
      } else if (plan.missingModel) {
        warn('Penilai Writing tidak dinyalakan: LLAMACPP_MODEL_PATH/LLAMACPP_HF_REPO belum diisi');
      } else {
        const logFile = path.join(cwd, 'data', 'logs', 'llama-server.log');
        try {
          llamaLogFd = deps.openLog(logFile);
        } catch {
          llamaLogFd = undefined;
        }
        const stdio = llamaLogFd === undefined ? 'ignore' : ['ignore', llamaLogFd, llamaLogFd];
        let child;
        let spawnError;
        try {
          child = deps.spawn(plan.bin, plan.args, { cwd, env: childEnv, stdio, shell: false, windowsHide: true });
        } catch (e) {
          spawnError = e;
        }
        if (child) {
          const spawned = await new Promise((resolve) => {
            const t = setTimeout(() => resolve({ ok: true }), deps.spawnWaitMs ?? 300);
            child.once('error', (e) => {
              clearTimeout(t);
              resolve({ ok: false, error: e });
            });
            child.once('spawn', () => {
              clearTimeout(t);
              resolve({ ok: true });
            });
          });
          if (spawned.ok) {
            llamaChild = child;
            children.add(child);
            log(`llama-server dijalankan (log: data/logs/llama-server.log); model dimuat di latar belakang.`);
            exited(child).then(([code]) => {
              children.delete(child);
              if (!stopping) warn(`llama-server berhenti (kode ${code}). Penilai Writing tidak tersedia.`);
            });
          } else spawnError = spawned.error;
        }
        if (spawnError) {
          const enoent = spawnError && spawnError.code === 'ENOENT';
          warn(`Penilai Writing tidak dinyalakan: ${enoent ? 'biner tidak ditemukan' : spawnError.message || 'gagal dijalankan'}`);
          if (llamaLogFd !== undefined) deps.closeLog(llamaLogFd);
          llamaLogFd = undefined;
        }
      }
    }
    if (stopping) return await finish(0);

    // 11. server
    const server = deps.spawn(ctx.execPath, serverArgs(bins.next, port), { cwd, env: childEnv, stdio: 'inherit', shell: false, windowsHide: true });
    children.add(server);
    const serverExit = exited(server);
    let serverDone = false;
    serverExit.then(() => {
      serverDone = true;
      children.delete(server);
    });

    const deadline = deps.now() + HEALTH_TIMEOUT_MS;
    let ready = false;
    while (deps.now() < deadline && !serverDone && !stopping) {
      if (await probeApp(port, deps.fetch)) {
        ready = true;
        break;
      }
      await deps.sleep(500);
    }
    if (stopping) return await finish(0);
    if (serverDone) {
      const [code] = await serverExit;
      return await finish(fail(`Server berhenti sebelum siap (kode ${code ?? 1}).`, code || 1));
    }
    if (!ready) return await finish(fail('Server tidak siap dalam 60 detik. Periksa pesan di atas atau jalankan: npm run doctor'));

    out(`Aplikasi siap: ${url}`);
    if (args.open && !(await openBrowser(`${url}`, { platform: deps.platform, spawn: deps.spawn }))) {
      warn(`Gagal membuka browser, buka manual: ${url}`);
    }

    // 12. tunggu sampai berhenti
    const [code] = await serverExit;
    if (stopping) return await finish(0);
    if (llamaChild) killChild(llamaChild, 'SIGTERM');
    return await finish(code ?? 1);
  } catch (e) {
    return await finish(fail(`Galat tak terduga: ${e instanceof Error ? e.message : String(e)}`));
  }
}
