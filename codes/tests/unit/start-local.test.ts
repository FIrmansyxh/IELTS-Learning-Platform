/**
 * Peluncur `npm run start:local` (SPEC-025 Fase 4): P4-01..09, 11, 14..19, 22, 23, 25..29, 36 (sisi peluncur).
 * Anak proses, fetch, port, dan jam dipalsukan; .env dan .next memakai folder sementara sungguhan.
 */
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error modul .mjs tanpa tipe
import * as lib from '../../scripts/lib/start-local.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const { runStartLocal, parseArgs, checkNode, checkHostname, needsBuild, planLlama, openBrowser, deriveEnv, ensureEnv, isPortFree } = lib as any;

const GOOD_SECRET = 'A'.repeat(44);

class FakeChild extends EventEmitter {
  killed: string[] = [];
  exited = false;
  kill(sig = 'SIGTERM') {
    this.killed.push(sig);
    this.finish(null, sig);
    return true;
  }
  finish(code: number | null, sig: string | null = null) {
    if (this.exited) return;
    this.exited = true;
    queueMicrotask(() => this.emit('exit', code, sig));
  }
  unref() {}
}

type Behavior = 'hang' | number | 'enoent' | 'error';
interface Call {
  cmd: string;
  args: string[];
  opts: any;
  child: FakeChild;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'start-local-'));
  copyFileSync(path.resolve('.env.example'), path.join(dir, '.env.example'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const EXEC = '/node';
const nextBin = path.join('node_modules', 'next', 'dist', 'bin', 'next');
const isStep = (c: Call, script: string) => c.cmd === EXEC && c.args.some((a) => a.endsWith(script));
const isServer = (c: Call) => c.cmd === EXEC && c.args.includes('start') && c.args.some((a) => a.endsWith(nextBin));
const isBuild = (c: Call) => c.cmd === EXEC && c.args.includes('build');

interface Opts {
  argv?: string[];
  env?: Record<string, string | undefined>;
  nodeVersion?: string;
  platform?: string;
  published?: number;
  portFree?: boolean;
  appHealthy?: boolean;
  llamaHealthy?: boolean;
  behave?: (cmd: string, args: string[]) => Behavior | undefined;
  realPort?: boolean;
  dbExists?: boolean;
  realCount?: boolean;
}

function harness(o: Opts = {}) {
  const calls: Call[] = [];
  const out: string[] = [];
  const err: string[] = [];
  let signal: (() => void) | undefined;
  let t = 0;
  let healthy = o.appHealthy ?? true;
  const deps: Record<string, unknown> = {
    spawn: (cmd: string, args: string[], opts: any) => {
      const child = new FakeChild();
      calls.push({ cmd, args, opts, child });
      const b = o.behave?.(cmd, args) ?? (cmd === EXEC && args.some((a) => a.endsWith(nextBin)) && args.includes('start') ? 'hang' : cmd === 'llama-server' ? 'hang' : 0);
      setImmediate(() => {
        if (b === 'enoent') child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
        else if (b === 'error') child.emit('error', new Error('gagal'));
        else {
          child.emit('spawn');
          if (typeof b === 'number') child.finish(b);
        }
      });
      return child;
    },
    fetch: async (url: string) => {
      if (url.endsWith('/api/health')) {
        if (!healthy) throw new Error('ECONNREFUSED');
        return { status: 200, json: async () => ({ data: { status: 'ok' } }) };
      }
      if (url.endsWith('/health')) {
        if (!(o.llamaHealthy ?? false)) throw new Error('ECONNREFUSED');
        return { status: 200, json: async () => ({}) };
      }
      throw new Error('tak terduga');
    },
    existsSync: (p: string) => (p.endsWith('ielts.db') ? (o.dbExists ?? false) : true),
    sleep: async (ms: number) => {
      t += ms;
    },
    graceSleep: () => new Promise(() => undefined),
    now: () => t,
    platform: o.platform ?? 'linux',
    listContentDirs: () => ['/c/3.3.3', '/c/3.3.4'],
    openLog: () => 99,
    closeLog: () => undefined,
    spawnWaitMs: 5,
    onSignal: (h: () => void) => {
      signal = h;
      return () => undefined;
    },
  };
  if (!o.realCount) deps.countPublished = async () => o.published ?? 1;
  if (!o.realPort) deps.isPortFree = async () => o.portFree ?? true;
  const run = () =>
    runStartLocal(o.argv ?? ['--no-open'], {
      cwd: dir,
      env: { PATH: 'x', ...(o.env ?? {}) },
      nodeVersion: o.nodeVersion ?? 'v22.20.0',
      execPath: EXEC,
      out: (s: string) => out.push(s),
      err: (s: string) => err.push(s),
      deps,
    }) as Promise<number>;
  return {
    calls,
    out,
    err,
    run,
    fireSignal: () => signal?.(),
    setHealthy: (v: boolean) => (healthy = v),
    outText: () => out.join('\n'),
    errText: () => err.join('\n'),
    steps: (script: string) => calls.filter((c) => isStep(c, script)),
    server: () => calls.find(isServer),
    /** Matikan server palsu supaya run() selesai. */
    stopServer: (code = 0) => calls.find(isServer)?.child.finish(code),
  };
}

/** Jalankan sampai server menyala lalu hentikan dengan kode tertentu. */
async function runUntilServerExit(h: ReturnType<typeof harness>, code = 0) {
  const p = h.run();
  for (let i = 0; i < 200 && !h.out.some((l) => l.startsWith('Aplikasi siap')); i++) await new Promise((r) => setImmediate(r));
  h.stopServer(code);
  return p;
}

describe('parseArgs (P4-01, P4-02)', () => {
  it('bawaan: port 3005, buka browser', () => {
    expect(parseArgs([])).toMatchObject({ ok: true, port: 3005, open: true, rebuild: false });
  });
  it('--port 3010, --port=3011, --no-open, --rebuild', () => {
    expect(parseArgs(['--port', '3010'])).toMatchObject({ ok: true, port: 3010 });
    expect(parseArgs(['--port=3011', '--no-open', '--rebuild'])).toMatchObject({ ok: true, port: 3011, open: false, rebuild: true });
  });
  it.each([['--port', 'abc'], ['--port', '80'], ['--port', '70000'], ['--port'], ['--foo']])('menolak %j', (...a) => {
    const r = parseArgs(a);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Argumen tidak valid');
  });
});

describe('pemeriksaan murni', () => {
  it('checkNode (P4-03)', () => {
    expect(checkNode('v20.11.0')).toContain('Node.js v20.11.0 terlalu lama. Aplikasi butuh Node.js 22.20 atau lebih baru.');
    expect(checkNode('v22.19.9')).not.toBeNull();
    expect(checkNode('v22.20.0')).toBeNull();
    expect(checkNode('v24.21.0')).toBeNull();
  });
  it('checkHostname (P4-04)', () => {
    expect(checkHostname(undefined)).toBeNull();
    expect(checkHostname('127.0.0.1')).toBeNull();
    expect(checkHostname('localhost')).toBeNull();
    expect(checkHostname('::1')).toBeNull();
    expect(checkHostname('0.0.0.0')).toContain('HOSTNAME=0.0.0.0 bukan alamat loopback');
    expect(checkHostname('LAPTOP-ABC')).toContain('bukan alamat loopback');
  });
  it('deriveEnv (K3): produksi, loopback, host diizinkan sesuai port', () => {
    const e = deriveEnv({ NODE_ENV: 'development', HOSTNAME: '0.0.0.0', X: '1' }, 3010);
    expect(e).toMatchObject({ NODE_ENV: 'production', HOSTNAME: '127.0.0.1', AUTH_URL: 'http://127.0.0.1:3010', X: '1' });
    expect(e.ALLOWED_HOSTS).toBe('localhost:3010,127.0.0.1:3010,[::1]:3010');
  });
  it('isPortFree memakai net.Server nyata', async () => {
    const srv = net.createServer();
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as net.AddressInfo).port;
    expect(await isPortFree(port)).toBe(false);
    await new Promise((r) => srv.close(r));
    expect(await isPortFree(port)).toBe(true);
  });
});

describe('ensureEnv (P4-07..09)', () => {
  it('P4-07: membuat .env dengan dua rahasia acak berbeda dan AUTH_URL 3005', () => {
    expect(ensureEnv({ dir })).toEqual({ created: true });
    const text = readFileSync(path.join(dir, '.env'), 'utf8');
    const a = /^AUTH_SECRET=(.+)$/m.exec(text)![1]!;
    const b = /^IP_HMAC_SECRET=(.+)$/m.exec(text)![1]!;
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64').length).toBeGreaterThanOrEqual(32);
    expect(Buffer.from(b, 'base64').length).toBeGreaterThanOrEqual(32);
    expect(text).toContain('AUTH_URL=http://127.0.0.1:3005');
  });
  it('P4-08: .env valid tidak diubah', () => {
    writeFileSync(path.join(dir, '.env'), `AUTH_SECRET=${GOOD_SECRET}\nIP_HMAC_SECRET=${GOOD_SECRET}\nFOO=bar\n`);
    const hash = () => createHash('sha256').update(readFileSync(path.join(dir, '.env'))).digest('hex');
    const before = hash();
    expect(ensureEnv({ dir })).toEqual({ created: false });
    expect(hash()).toBe(before);
  });
  it.each([
    ['AUTH_SECRET', `AUTH_SECRET=\nIP_HMAC_SECRET=${GOOD_SECRET}\n`],
    ['IP_HMAC_SECRET', `AUTH_SECRET=${GOOD_SECRET}\nIP_HMAC_SECRET=pendek\n`],
  ])('P4-09: %s salah -> galat bernama kunci, .env tidak diubah', (key, content) => {
    writeFileSync(path.join(dir, '.env'), content);
    expect(() => ensureEnv({ dir })).toThrow(new RegExp(`${key}.*atau hapus \\.env agar dibuat otomatis`));
    expect(readFileSync(path.join(dir, '.env'), 'utf8')).toBe(content);
  });
});

describe('runStartLocal: prasyarat', () => {
  it('P4-02: argumen salah -> kode 2, tanpa berkas dibuat', async () => {
    for (const argv of [['--port', 'abc'], ['--port', '80'], ['--port', '70000'], ['--foo']]) {
      const h = harness({ argv });
      expect(await h.run()).toBe(2);
      expect(h.errText()).toContain('Argumen tidak valid');
      expect(h.errText()).toContain('Pemakaian');
      expect(h.calls).toHaveLength(0);
    }
    expect(existsSync(path.join(dir, '.env'))).toBe(false);
  });

  it('P4-03: Node lama -> kode 1, tanpa .env dan data', async () => {
    const h = harness({ nodeVersion: 'v20.11.0' });
    expect(await h.run()).toBe(1);
    expect(h.errText()).toContain('Node.js v20.11.0 terlalu lama. Aplikasi butuh Node.js 22.20 atau lebih baru.');
    expect(existsSync(path.join(dir, '.env'))).toBe(false);
    expect(existsSync(path.join(dir, 'data'))).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('P4-04: HOSTNAME=0.0.0.0 -> kode 1 dan petunjuk', async () => {
    const h = harness({ env: { HOSTNAME: '0.0.0.0' } });
    expect(await h.run()).toBe(1);
    expect(h.errText()).toContain('HOSTNAME=0.0.0.0 bukan alamat loopback');
    expect(h.errText()).toMatch(/unset HOSTNAME|Remove-Item/);
    expect(existsSync(path.join(dir, '.env'))).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('P4-05: port diduduki program lain (net.Server nyata) -> kode 1, tanpa efek samping', async () => {
    const srv = net.createServer();
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as net.AddressInfo).port;
    try {
      const h = harness({ argv: ['--port', String(port), '--no-open'], realPort: true, appHealthy: false });
      expect(await h.run()).toBe(1);
      expect(h.errText()).toContain(`Port ${port} sudah dipakai program lain. Coba: npm run start:local -- --port ${port + 1}`);
      expect(existsSync(path.join(dir, '.env'))).toBe(false);
      expect(existsSync(path.join(dir, '.next'))).toBe(false);
      expect(h.calls).toHaveLength(0);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });

  it('P4-06: port diduduki aplikasi ini -> pesan, browser dibuka, kode 0, tanpa migrasi', async () => {
    const h = harness({ argv: [], portFree: false, appHealthy: true });
    expect(await h.run()).toBe(0);
    expect(h.outText()).toContain('Aplikasi sudah berjalan: http://127.0.0.1:3005');
    const browser = h.calls.filter((c) => c.cmd === 'xdg-open');
    expect(browser).toHaveLength(1);
    expect(browser[0]!.args).toEqual(['http://127.0.0.1:3005']);
    expect(h.calls.filter((c) => c.cmd === EXEC)).toHaveLength(0);
  });

  it('P4-06 dengan --no-open: browser tidak dibuka', async () => {
    const h = harness({ portFree: false });
    expect(await h.run()).toBe(0);
    expect(h.calls).toHaveLength(0);
  });
});

describe('runStartLocal: rahasia tidak dicetak (P4-07)', () => {
  it('.env baru dibuat dan nilai rahasia tidak muncul di stdout/stderr', async () => {
    const h = harness();
    await runUntilServerExit(h);
    const text = readFileSync(path.join(dir, '.env'), 'utf8');
    const secrets = [/^AUTH_SECRET=(.+)$/m, /^IP_HMAC_SECRET=(.+)$/m].map((r) => r.exec(text)![1]!.trim());
    const printed = [...h.out, ...h.err].join('\n');
    expect(printed).toContain('.env dibuat');
    for (const sec of secrets) expect(printed).not.toContain(sec);
  });
});

describe('runStartLocal: migrasi, seed, konten (P4-11, P4-13..15)', () => {
  it.each([
    ['db:migrate', 'migrate.ts'],
    ['db:seed', 'seed.ts'],
  ])('P4-11: %s gagal -> kode 1 dan server tidak dinyalakan', async (label, script) => {
    const h = harness({ behave: (cmd, args) => (cmd === EXEC && args.some((a) => a.endsWith(script)) ? 3 : undefined) });
    expect(await h.run()).toBe(1);
    expect(h.errText()).toContain(label);
    expect(h.server()).toBeUndefined();
  });

  it('urutan: migrate sebelum seed sebelum build/server', async () => {
    const h = harness();
    await runUntilServerExit(h);
    const idx = (s: string) => h.calls.findIndex((c) => isStep(c, s));
    expect(idx('migrate.ts')).toBeGreaterThanOrEqual(0);
    expect(idx('migrate.ts')).toBeLessThan(idx('seed.ts'));
    expect(idx('seed.ts')).toBeLessThan(h.calls.findIndex(isServer));
  });

  it('P4-13: belum ada konten terbit -> tiap subfolder diimpor dengan --publish', async () => {
    const h = harness({ published: 0 });
    await runUntilServerExit(h);
    const imports = h.steps('content-import.ts');
    expect(imports.map((c) => c.args.slice(-3))).toEqual([
      ['--dir', '/c/3.3.3', '--publish'],
      ['--dir', '/c/3.3.4', '--publish'],
    ]);
  });

  it('P4-14: sudah ada konten terbit -> impor dilewati', async () => {
    const h = harness({ published: 2 });
    await runUntilServerExit(h);
    expect(h.steps('content-import.ts')).toHaveLength(0);
    expect(h.outText()).toContain('Konten sudah ada, impor dilewati');
  });

  it('P4-15: impor gagal (kode 2) -> peringatan, langkah berikut tetap jalan, kode keluar tak terpengaruh', async () => {
    const h = harness({ published: 0, behave: (cmd, args) => (cmd === EXEC && args.some((a) => a.endsWith('content-import.ts')) ? 2 : undefined) });
    const code = await runUntilServerExit(h, 0);
    expect(h.errText()).toContain('Impor konten bawaan gagal (kode 2)');
    expect(h.server()).toBeDefined();
    expect(code).toBe(0);
  });
});

describe('needsBuild dan langkah build (P4-16..19)', () => {
  const touch = (rel: string, whenMs: number) => {
    const p = path.join(dir, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    if (!existsSync(p)) writeFileSync(p, 'x');
    utimesSync(p, whenMs / 1000, whenMs / 1000);
  };
  const T0 = Date.now() - 100_000;

  it('P4-16: tanpa BUILD_ID -> build', () => {
    expect(needsBuild({ cwd: dir })).toEqual({ build: true, reason: 'belum-ada' });
  });
  it('P4-17: BUILD_ID lebih baru dari semua masukan -> lewati', () => {
    touch('src/app/page.tsx', T0);
    touch('package.json', T0);
    touch('.next/BUILD_ID', T0 + 50_000);
    expect(needsBuild({ cwd: dir })).toEqual({ build: false, reason: 'terbaru' });
  });
  it.each(['src/server/x.ts', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs'])('P4-18: %s lebih baru -> build ulang', (rel) => {
    touch('src/app/page.tsx', T0);
    touch('.next/BUILD_ID', T0 + 50_000);
    touch(rel, T0 + 80_000);
    expect(needsBuild({ cwd: dir })).toEqual({ build: true, reason: 'berubah' });
  });
  it('P4-18: --rebuild memaksa build', () => {
    touch('.next/BUILD_ID', T0 + 50_000);
    expect(needsBuild({ cwd: dir, rebuild: true }).build).toBe(true);
  });

  it('P4-16: next build dijalankan sekali dengan NODE_ENV=production', async () => {
    const h = harness();
    await runUntilServerExit(h);
    const builds = h.calls.filter(isBuild);
    expect(builds).toHaveLength(1);
    expect(builds[0]!.opts.env.NODE_ENV).toBe('production');
  });
  it('P4-17: build dilewati dengan pesan "Build terbaru"', async () => {
    touch('src/a.ts', T0);
    touch('.next/BUILD_ID', T0 + 50_000);
    const h = harness();
    await runUntilServerExit(h);
    expect(h.calls.filter(isBuild)).toHaveLength(0);
    expect(h.outText()).toContain('Build terbaru');
  });
  it('P4-18: --rebuild menjalankan build walau BUILD_ID terbaru', async () => {
    touch('src/a.ts', T0);
    touch('.next/BUILD_ID', T0 + 50_000);
    const h = harness({ argv: ['--no-open', '--rebuild'] });
    await runUntilServerExit(h);
    expect(h.calls.filter(isBuild)).toHaveLength(1);
  });
  it('P4-19: build gagal -> kode 1, petunjuk internet, server tidak dinyalakan', async () => {
    const h = harness({ behave: (cmd, args) => (cmd === EXEC && args.includes('build') ? 1 : undefined) });
    expect(await h.run()).toBe(1);
    expect(h.errText()).toContain('Build gagal');
    expect(h.errText()).toContain('build pertama butuh internet untuk mengunduh font');
    expect(h.server()).toBeUndefined();
  });
});

describe('server, kesiapan, browser, berhenti (P4-01, P4-20..25)', () => {
  it('P4-01/P4-20: argumen server -H 127.0.0.1 -p <port>; env turunan sesuai port; URL tercetak', async () => {
    const h = harness({ argv: ['--port', '3010', '--no-open'], env: { HOSTNAME: '127.0.0.1', AUTH_URL: 'http://x:1' } });
    await runUntilServerExit(h);
    const s = h.server()!;
    expect(s.args.slice(-5)).toEqual(['start', '-H', '127.0.0.1', '-p', '3010']);
    expect(s.opts.shell).toBe(false);
    expect(s.opts.env).toMatchObject({ NODE_ENV: 'production', HOSTNAME: '127.0.0.1', AUTH_URL: 'http://127.0.0.1:3010' });
    expect(s.opts.env.ALLOWED_HOSTS).toContain('127.0.0.1:3010');
    expect(h.outText()).toContain('http://127.0.0.1:3010');
  });

  it('P4-21: cetak baris persis "Aplikasi siap: http://127.0.0.1:3005"', async () => {
    const h = harness();
    await runUntilServerExit(h);
    expect(h.out).toContain('Aplikasi siap: http://127.0.0.1:3005');
  });

  it('P4-22: health tidak 200 selama 60 dtk -> server dimatikan, kode 1', async () => {
    const h = harness({ appHealthy: false });
    expect(await h.run()).toBe(1);
    expect(h.errText()).toContain('Server tidak siap dalam 60 detik');
    expect(h.server()!.child.killed.length).toBeGreaterThan(0);
  });

  it('P4-23: browser dibuka tepat sekali tanpa --no-open (linux/mac/windows)', async () => {
    for (const [platform, cmd, args] of [
      ['linux', 'xdg-open', ['http://127.0.0.1:3005']],
      ['darwin', 'open', ['http://127.0.0.1:3005']],
      ['win32', 'cmd', ['/c', 'start', '""', 'http://127.0.0.1:3005']],
    ] as const) {
      const h = harness({ argv: [], platform });
      await runUntilServerExit(h);
      const opens = h.calls.filter((c) => c.cmd === cmd);
      expect(opens, platform).toHaveLength(1);
      expect(opens[0]!.args).toEqual(args);
    }
  });

  it('P4-23: --no-open tidak membuka browser', async () => {
    const h = harness();
    await runUntilServerExit(h);
    expect(h.calls.filter((c) => c.cmd !== EXEC)).toHaveLength(0);
  });

  it('P4-23: pembukaan browser gagal -> peringatan, kode keluar tidak berubah', async () => {
    const h = harness({ argv: [], behave: (cmd) => (cmd === 'xdg-open' ? 'enoent' : undefined) });
    const code = await runUntilServerExit(h, 0);
    expect(h.errText()).toContain('Gagal membuka browser, buka manual: http://127.0.0.1:3005');
    expect(code).toBe(0);
  });

  it('openBrowser mengembalikan false bila spawn melempar', async () => {
    const ok = await openBrowser('http://x', {
      platform: 'linux',
      spawn: () => {
        throw new Error('x');
      },
    });
    expect(ok).toBe(false);
  });

  it('P4-24: SIGINT -> anak proses dihentikan, kode keluar 0', async () => {
    const h = harness();
    const p = h.run();
    for (let i = 0; i < 200 && !h.out.some((l) => l.startsWith('Aplikasi siap')); i++) await new Promise((r) => setImmediate(r));
    h.fireSignal();
    expect(await p).toBe(0);
    expect(h.server()!.child.killed).toEqual(['SIGTERM']);
    expect(h.calls.filter((c) => c.cmd === EXEC).every((c) => c.child.exited)).toBe(true);
  });

  it('P4-25: server berhenti sendiri kode 7 -> llama-server ikut dimatikan, kode 7', async () => {
    const h = harness({
      env: { AI_ENABLED: 'true', LLM_DRIVER: 'llamacpp', LLAMACPP_MODEL_PATH: '/m/model.gguf' },
    });
    const code = await runUntilServerExit(h, 7);
    expect(code).toBe(7);
    const llama = h.calls.find((c) => c.cmd === 'llama-server')!;
    expect(llama).toBeDefined();
    expect(llama.child.killed.length).toBeGreaterThan(0);
  });
});

describe('llama-server opsional (P4-26..29)', () => {
  const hasLlamaLog = (h: ReturnType<typeof harness>) => [...h.out, ...h.err].some((l) => l.includes('[llama]'));

  it('P4-26: AI_ENABLED bukan true, atau driver bukan llamacpp -> tidak ada proses llama', async () => {
    for (const env of [{}, { AI_ENABLED: 'false' }, { AI_ENABLED: 'true', LLM_DRIVER: 'mock' }, { AI_ENABLED: 'true', LLM_DRIVER: 'ollama' }]) {
      const h = harness({ env });
      await runUntilServerExit(h);
      expect(h.calls.filter((c) => c.cmd === 'llama-server' || c.cmd.includes('llama'))).toHaveLength(0);
      expect(hasLlamaLog(h)).toBe(false);
      expect(planLlama({ ...env })).toEqual({ kind: 'skip' });
    }
  });

  it('P4-27: /health sudah 200 -> tidak ada proses baru, pesan dipakai ulang', async () => {
    const h = harness({ env: { AI_ENABLED: 'true', LLAMACPP_MODEL_PATH: '/m.gguf' }, llamaHealthy: true });
    await runUntilServerExit(h);
    expect(h.calls.filter((c) => c.cmd === 'llama-server')).toHaveLength(0);
    expect(h.outText()).toContain('llama-server sudah berjalan, dipakai ulang');
  });

  it('P4-28: spawn tepat sekali dengan argumen dan shell:false; log ke data/logs', async () => {
    const h = harness({
      env: {
        AI_ENABLED: 'true',
        LLM_DRIVER: 'llamacpp',
        LLAMACPP_BASE_URL: 'http://127.0.0.1:8090',
        LLAMACPP_MODEL_PATH: 'G:\\m\\model.gguf',
        LLAMACPP_ARGS: '--device  Vulkan0 -ngl 99',
        LLAMACPP_BIN: 'llama-server',
      },
    });
    await runUntilServerExit(h);
    const llama = h.calls.filter((c) => c.cmd === 'llama-server');
    expect(llama).toHaveLength(1);
    expect(llama[0]!.args).toEqual(['-m', 'G:\\m\\model.gguf', '--host', '127.0.0.1', '--port', '8090', '-c', '4096', '--parallel', '1', '--device', 'Vulkan0', '-ngl', '99']);
    expect(llama[0]!.opts.shell).toBe(false);
    expect(llama[0]!.opts.stdio).toEqual(['ignore', 99, 99]);
    // proses ini dimatikan saat skrip berhenti
    expect(llama[0]!.child.killed.length).toBeGreaterThan(0);
  });

  it('P4-28: LLAMACPP_HF_REPO dipakai bila tidak ada model path', () => {
    const plan = planLlama({ AI_ENABLED: 'true', LLAMACPP_HF_REPO: 'org/repo:Q4_K_M' });
    expect(plan.kind).toBe('start');
    expect(plan.args.slice(0, 2)).toEqual(['-hf', 'org/repo:Q4_K_M']);
  });

  it.each([
    ['biner tidak ditemukan', { LLAMACPP_MODEL_PATH: '/m.gguf' }, 'enoent'],
    ['LLAMACPP_MODEL_PATH/LLAMACPP_HF_REPO belum diisi', {}, undefined],
    ['LLAMACPP_BASE_URL bukan loopback', { LLAMACPP_BASE_URL: 'http://192.168.1.5:8080', LLAMACPP_MODEL_PATH: '/m.gguf' }, undefined],
  ])('P4-29: %s -> satu peringatan, aplikasi tetap naik', async (reason, extra, behavior) => {
    const h = harness({
      env: { AI_ENABLED: 'true', LLM_DRIVER: 'llamacpp', ...extra },
      behave: (cmd) => (cmd === 'llama-server' ? (behavior as 'enoent' | undefined) : undefined),
    });
    const code = await runUntilServerExit(h, 0);
    const warns = h.err.filter((l) => l.includes('Penilai Writing tidak dinyalakan:'));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain(reason);
    expect(h.server()).toBeDefined();
    expect(code).toBe(0);
  });
});

describe('cadangan dari peluncur (P4-36, sisi peluncur)', () => {
  it('cadangan gagal -> peringatan "Cadangan gagal", peluncuran tetap lanjut', async () => {
    const h = harness({
      dbExists: true,
      behave: (cmd, args) => (cmd === EXEC && args.includes('backup') ? 1 : undefined),
    });
    const code = await runUntilServerExit(h, 0);
    expect(h.errText()).toContain('Cadangan gagal');
    expect(h.server()).toBeDefined();
    expect(code).toBe(0);
  });

  it('DB belum ada (peluncuran pertama) -> langkah cadangan dilewati', async () => {
    const h = harness({ dbExists: false });
    await runUntilServerExit(h);
    expect(h.calls.some((c) => c.args.includes('backup'))).toBe(false);
  });

  it('DB ada -> cadangan dijalankan sebelum migrasi', async () => {
    const h = harness({ dbExists: true });
    await runUntilServerExit(h);
    const iBackup = h.calls.findIndex((c) => c.args.includes('backup'));
    const iMigrate = h.calls.findIndex((c) => isStep(c, 'migrate.ts'));
    expect(iBackup).toBeGreaterThanOrEqual(0);
    expect(iBackup).toBeLessThan(iMigrate);
  });
});

describe('countPublished memakai DATABASE_PATH efektif dari .env (M-1)', () => {
  function makeDb(file: string, published: number) {
    mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE sub_modules (id INTEGER PRIMARY KEY, status TEXT)');
    for (let i = 0; i < published; i++) db.exec("INSERT INTO sub_modules (status) VALUES ('PUBLISHED')");
    db.exec("INSERT INTO sub_modules (status) VALUES ('DRAFT')");
    db.close();
  }
  const writeEnv = (extra: string) => writeFileSync(path.join(dir, '.env'), `AUTH_SECRET=${GOOD_SECRET}\nIP_HMAC_SECRET=${GOOD_SECRET}\n${extra}\n`);

  it('DATABASE_PATH hanya di .env dengan konten terbit -> impor dilewati', async () => {
    writeEnv('DATABASE_PATH=./kustom/db/app.db');
    makeDb(path.join(dir, 'kustom', 'db', 'app.db'), 2);
    const h = harness({ realCount: true });
    await runUntilServerExit(h);
    expect(h.outText()).toContain('Konten sudah ada, impor dilewati');
    expect(h.steps('content-import.ts')).toHaveLength(0);
  });

  it('DATABASE_PATH hanya di .env tanpa konten terbit -> impor dijalankan walau DB bawaan punya konten', async () => {
    writeEnv('DATABASE_PATH=./kustom/db/app.db');
    makeDb(path.join(dir, 'kustom', 'db', 'app.db'), 0);
    makeDb(path.join(dir, 'data', 'ielts.db'), 3);
    const h = harness({ realCount: true });
    await runUntilServerExit(h);
    expect(h.steps('content-import.ts').length).toBeGreaterThan(0);
  });

  it('variabel proses menang atas .env', async () => {
    writeEnv('DATABASE_PATH=./kustom/db/app.db');
    makeDb(path.join(dir, 'kustom', 'db', 'app.db'), 0);
    makeDb(path.join(dir, 'lain.db'), 1);
    const h = harness({ realCount: true, env: { DATABASE_PATH: path.join(dir, 'lain.db') } });
    await runUntilServerExit(h);
    expect(h.outText()).toContain('Konten sudah ada, impor dilewati');
  });
});

describe('LLAMACPP_ARGS tidak boleh menimpa bind loopback (M-5)', () => {
  it.each(['--host 0.0.0.0', '--host=0.0.0.0', '--port 9999', '--port=9999', '-h', '-ngl 99 --host 0.0.0.0', '--listen-x 1'])('menolak %j', (extra) => {
    const plan = planLlama({ AI_ENABLED: 'true', LLAMACPP_MODEL_PATH: '/m.gguf', LLAMACPP_ARGS: extra });
    expect(plan.kind).toBe('warn');
    expect(plan.reason).toContain('LLAMACPP_ARGS');
  });
  it('argumen sah tetap diteruskan', () => {
    const plan = planLlama({ AI_ENABLED: 'true', LLAMACPP_MODEL_PATH: '/m.gguf', LLAMACPP_ARGS: '--device Vulkan0 -ngl 99' });
    expect(plan.kind).toBe('start');
  });
  it('-c/--ctx-size di LLAMACPP_ARGS menggantikan konteks default 4096 (tanpa flag ganda)', () => {
    for (const extra of ['--n-cpu-moe 20 -c 6144', '--ctx-size 6144', '--ctx-size=6144']) {
      const plan = planLlama({ AI_ENABLED: 'true', LLAMACPP_MODEL_PATH: '/m.gguf', LLAMACPP_ARGS: extra });
      expect(plan.kind).toBe('start');
      expect(plan.args).not.toContain('4096');
      expect(plan.args.filter((a: string) => a === '-c' || a.startsWith('--ctx-size'))).toHaveLength(1);
    }
  });
  it('peluncur: tidak ada proses llama, satu peringatan, aplikasi tetap naik', async () => {
    const h = harness({ env: { AI_ENABLED: 'true', LLAMACPP_MODEL_PATH: '/m.gguf', LLAMACPP_ARGS: '--host 0.0.0.0' } });
    const code = await runUntilServerExit(h, 0);
    expect(h.calls.filter((c) => c.cmd === 'llama-server')).toHaveLength(0);
    expect(h.err.filter((l) => l.includes('Penilai Writing tidak dinyalakan:'))).toHaveLength(1);
    expect(code).toBe(0);
  });
});

describe('openBrowser Windows (L-2)', () => {
  it('memakai windowsVerbatimArguments agar judul kosong tidak dikutip ulang', async () => {
    const seen: any[] = [];
    const spawn = (cmd: string, args: string[], opts: any) => {
      seen.push({ cmd, args, opts });
      const c = new EventEmitter() as any;
      c.unref = () => undefined;
      setImmediate(() => c.emit('spawn'));
      return c;
    };
    expect(await openBrowser('http://127.0.0.1:3005', { platform: 'win32', spawn })).toBe(true);
    expect(seen[0].opts.windowsVerbatimArguments).toBe(true);
    expect(seen[0].args).toEqual(['/c', 'start', '""', 'http://127.0.0.1:3005']);
    await openBrowser('http://x', { platform: 'linux', spawn });
    expect(seen[1].opts.windowsVerbatimArguments).toBeUndefined();
  });
});

describe('whisper-server opsional (ADR-004 Addendum 3, SPEC-013 addendum 2026-11-11)', () => {
  const on = { AI_ENABLED: 'true', SPEAKING_AI_ENABLED: 'true', STT_DRIVER: 'whisper' };

  it('skip bila AI, Speaking, atau driver STT tidak aktif', () => {
    for (const env of [{}, { ...on, AI_ENABLED: 'false' }, { ...on, SPEAKING_AI_ENABLED: 'false' }, { ...on, STT_DRIVER: 'mock' }]) {
      expect(lib.planWhisper(env).kind).toBe('skip');
    }
  });

  it('warn bila STT_BASE_URL bukan loopback atau WHISPER_ARGS memuat --host/--port', () => {
    expect(lib.planWhisper({ ...on, STT_BASE_URL: 'http://10.0.0.2:8081', WHISPER_MODEL_PATH: '/m.bin' })).toMatchObject({ kind: 'warn', reason: expect.stringContaining('loopback') });
    expect(lib.planWhisper({ ...on, WHISPER_MODEL_PATH: '/m.bin', WHISPER_ARGS: '--port 9000' }).kind).toBe('warn');
    expect(lib.planWhisper({ ...on, WHISPER_MODEL_PATH: '/m.bin', WHISPER_ARGS: '--host=0.0.0.0' }).kind).toBe('warn');
  });

  it('start: argumen dikunci ke 127.0.0.1, port dari STT_BASE_URL, bahasa en, lalu WHISPER_ARGS', () => {
    const plan = lib.planWhisper({ ...on, STT_BASE_URL: 'http://127.0.0.1:8081', WHISPER_BIN: 'C:\w\whisper-server.exe', WHISPER_MODEL_PATH: 'C:\w\ggml-small.en.bin', WHISPER_ARGS: '-t  8' });
    expect(plan).toMatchObject({ kind: 'start', bin: 'C:\w\whisper-server.exe', healthUrl: 'http://127.0.0.1:8081/health', missingModel: false });
    expect(plan.args).toEqual(['-m', 'C:\w\ggml-small.en.bin', '--host', '127.0.0.1', '--port', '8081', '-l', 'en', '-t', '8']);
    expect(lib.planWhisper(on)).toMatchObject({ kind: 'start', missingModel: true, args: [] });
  });

  it('peluncur: whisper-server dijalankan sekali dengan shell:false dan dimatikan saat berhenti', async () => {
    const h = harness({
      env: { ...on, WHISPER_BIN: 'whisper-server', WHISPER_MODEL_PATH: '/m/ggml-small.en.bin' },
      behave: (cmd) => (cmd === 'whisper-server' ? 'hang' : undefined),
    });
    await runUntilServerExit(h);
    const w = h.calls.filter((c) => c.cmd === 'whisper-server');
    expect(w).toHaveLength(1);
    expect(w[0]!.opts.shell).toBe(false);
    expect(h.outText()).toContain('whisper-server dijalankan');
    expect(w[0]!.child.killed.length).toBeGreaterThan(0);
  });

  it('peluncur: model belum diisi -> satu peringatan Penilai Speaking, aplikasi tetap naik', async () => {
    const h = harness({ env: on });
    const code = await runUntilServerExit(h, 0);
    expect(h.calls.filter((c) => c.cmd === 'whisper-server')).toHaveLength(0);
    const warns = h.err.filter((l) => l.includes('Penilai Speaking tidak dinyalakan:'));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('WHISPER_MODEL_PATH');
    expect(code).toBe(0);
  });
});
