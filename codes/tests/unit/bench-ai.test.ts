import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error modul .mjs tanpa tipe
import { startMockOllama } from '../fixtures/mock-ollama.mjs';

function run(args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['scripts/bench-ai.mjs', ...args], { cwd: process.cwd() });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

describe('bench:ai', () => {
  it('exit 1 dan pesan jelas bila Ollama tidak terjangkau', async () => {
    const r = await run(['--models', 'fake', '--ollama-url', 'http://127.0.0.1:9']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Ollama tidak terjangkau di http://127.0.0.1:9');
  });

  it('exit 0, menulis hasil, dan baris terakhir RECOMMENDED_MODEL bila 21/21 valid', async () => {
    const mock = await startMockOllama({ delayMs: 5, valid: true });
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'bench-'));
    try {
      const r = await run(['--models', 'tiny-model', '--runs', '7', '--ollama-url', mock.url, '--out', outDir]);
      expect(r.code).toBe(0);
      const lines = r.out.trim().split('\n');
      expect(lines[lines.length - 1]).toBe('RECOMMENDED_MODEL=tiny-model');
      const files = readdirSync(outDir);
      expect(files).toHaveLength(1);
      const report = JSON.parse(readFileSync(path.join(outDir, files[0]!), 'utf8'));
      expect(report.models[0].runs).toBe(21);
      expect(report.models[0].json_valid_rate).toBe(1);
      expect(report.models[0].passes).toBe(true);
      expect(report.recommended_model).toBe('tiny-model');
    } finally {
      await mock.close();
    }
  }, 60_000);

  it('exit 2 dan NONE bila keluaran tidak lolos skema', async () => {
    const mock = await startMockOllama({ valid: false });
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'bench-'));
    try {
      const r = await run(['--models', 'bad', '--runs', '1', '--ollama-url', mock.url, '--out', outDir]);
      expect(r.code).toBe(2);
      expect(r.out.trim().split('\n').pop()).toBe('RECOMMENDED_MODEL=NONE');
    } finally {
      await mock.close();
    }
  }, 60_000);
});
