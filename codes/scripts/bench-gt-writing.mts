/**
 * Benchmark penilai Writing General Training untuk llama.cpp (ADR-004).
 * Untuk tiap model: jalankan `llama-server`, nilai 7 kasus (surat + esai) dengan prompt/skema produksi,
 * lalu ukur validitas JSON, akurasi band terhadap rentang manusia, urutan kualitas, mutu bahasa Indonesia, latensi.
 *
 * Pemakaian: npx tsx scripts/bench-gt-writing.mts --out G:/llm-models/bench.json \
 *   --models "qwen25-7b=bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M,llama31-8b=bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M"
 * Env: LLAMA_CACHE (lokasi GGUF), LLAMA_SERVER (nama biner, default llama-server).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { WritingEvaluationOutputSchema, type WritingEvaluationOutput } from '../src/contracts/ai.ts';
import { buildWritingOutputJsonSchema, snapBandsToHalf } from '../src/server/ai/pipeline.ts';
import { buildWritingSystemPrompt } from '../src/server/ai/writing-prompts.ts';
import { CASES, type GtCase } from './bench/gt-cases.mts';

const { values } = parseArgs({
  options: {
    models: { type: 'string' },
    out: { type: 'string', default: 'bench-gt-writing.json' },
    port: { type: 'string', default: '8081' },
    ctx: { type: 'string', default: '6144' },
    'download-timeout-min': { type: 'string', default: '45' },
  },
});
if (!values.models) {
  console.error('Flag --models wajib: "label=repo:quant,..."');
  process.exit(1);
}
const PORT = Number(values.port);
const BASE = `http://127.0.0.1:${PORT}`;
const SCHEMA = buildWritingOutputJsonSchema();
const ID_WORDS = ['yang', 'dan', 'dengan', 'tidak', 'untuk', 'dalam', 'adalah', 'dapat', 'pada', 'ini'];

const mean4 = (o: WritingEvaluationOutput) => {
  const c = o.criteria;
  const m = (c.task_response.band + c.coherence.band + c.lexical.band + c.grammar.band) / 4;
  return Math.round(m * 2) / 2;
};
const proseStrings = (o: WritingEvaluationOutput): string[] => [
  ...Object.values(o.criteria).map((c) => c.comment_id),
  ...o.strengths_id,
  ...o.improvements_id,
  ...o.corrections.map((c) => c.reason_id),
];
const isGoodIndonesian = (s: string) => {
  if (/_/.test(s) && !/\s/.test(s)) return false;
  if ((s.match(/_/g) ?? []).length >= 2) return false;
  const lower = s.toLowerCase();
  const words = new Set(lower.split(/[^a-z]+/));
  return s.trim().split(/\s+/).length >= 3 && ID_WORDS.some((w) => words.has(w));
};

function killTree(p: ChildProcess | undefined) {
  if (p?.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
}

async function waitHealthy(p: ChildProcess, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  let exited = false;
  p.once('exit', () => (exited = true));
  p.once('error', () => (exited = true));
  while (Date.now() - t0 < timeoutMs) {
    if (exited) throw new Error('llama-server berhenti sebelum siap (lihat log)');
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('timeout menunggu llama-server (unduhan/muat model)');
}

async function evaluate(c: GtCase) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      temperature: 0.2,
      max_tokens: 1500,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: buildWritingSystemPrompt(c.kind) },
        {
          role: 'user',
          content: `Task Prompt:\n${c.prompt}\n\nStudent Response:\n<student_response id="bench">\n${c.response}\n</student_response>\n\nREMINDER: every comment_id, strengths_id, improvements_id and reason_id value MUST be written in Indonesian (Bahasa Indonesia). Only "original", "improved" and "band7_rewrite" stay in English. All band values must be multiples of 0.5.`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'evaluation', strict: true, schema: SCHEMA } },
    }),
  });
  const latencyMs = Date.now() - t0;
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; timings?: { predicted_per_second?: number } };
  const content = body.choices?.[0]?.message?.content ?? '';
  try {
    const out = WritingEvaluationOutputSchema.parse(snapBandsToHalf(JSON.parse(content)));
    const strings = proseStrings(out);
    const good = strings.filter(isGoodIndonesian).length;
    const band = mean4(out);
    return {
      id: c.id, valid: true, latencyMs, tokPerSec: body.timings?.predicted_per_second ?? null,
      band, modelOverall: out.overall_band, range: c.range,
      inRange: band >= c.range[0] && band <= c.range[1],
      requirementMet: out.task_requirement_met,
      requirementOk: c.requirementMet === undefined ? null : out.task_requirement_met === c.requirementMet,
      proseGood: good, proseTotal: strings.length,
      sample: out.criteria.task_response.comment_id.slice(0, 160),
    };
  } catch (e) {
    return { id: c.id, valid: false, latencyMs, error: String((e as Error).message).slice(0, 120), raw: content.slice(0, 120) };
  }
}

type CaseResult = Awaited<ReturnType<typeof evaluate>>;
const summary: unknown[] = [];

for (const spec of values.models.split(',')) {
  const [label, hf] = spec.split('=');
  if (!label || !hf) continue;
  console.log(`\n##### ${label}  (${hf})`);
  const log = createWriteStream(`${values.out}.${label}.server.log`);
  const proc = spawn(process.env.LLAMA_SERVER ?? 'llama-server', ['-hf', hf, '--device', 'Vulkan0', '-c', values.ctx!, '--parallel', '1', '--host', '127.0.0.1', '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  proc.stdout?.pipe(log);
  proc.stderr?.pipe(log);
  try {
    const tLoad = Date.now();
    await waitHealthy(proc, Number(values['download-timeout-min']) * 60_000);
    console.log(`siap dalam ${Math.round((Date.now() - tLoad) / 1000)} dtk`);
    const results: CaseResult[] = [];
    for (const c of CASES) {
      const r = await evaluate(c);
      results.push(r);
      console.log(r.valid ? `${c.id.padEnd(18)} band=${r.band} (ok ${c.range.join('-')}) ${r.inRange ? 'OK ' : 'XX '} bahasa=${r.proseGood}/${r.proseTotal} ${r.latencyMs}ms` : `${c.id.padEnd(18)} INVALID ${r.error}`);
    }
    const valid = results.filter((r) => r.valid);
    const byId = Object.fromEntries(valid.map((r) => [r.id, r.band as number]));
    const inRange = valid.filter((r) => r.inRange).length;
    const mae = valid.reduce((s, r) => s + Math.abs((r.band as number) - (r.range![0] + r.range![1]) / 2), 0) / Math.max(1, valid.length);
    const prose = valid.reduce((s, r) => s + (r.proseGood ?? 0), 0) / Math.max(1, valid.reduce((s, r) => s + (r.proseTotal ?? 0), 0));
    const reqChecks = valid.filter((r) => r.requirementOk !== null);
    const orderLetters = byId['L1-weak-slang']! < byId['L2-mid-errors']! && byId['L2-mid-errors']! <= byId['L3-good']!;
    const orderEssays = byId['T2-band5']! < byId['T2-band6']! && byId['T2-band6']! <= byId['T2-band7']!;
    const lat = valid.map((r) => r.latencyMs).sort((a, b) => a - b);
    const s = {
      model: label, repo: hf, valid: `${valid.length}/${results.length}`, inRange: `${inRange}/${results.length}`,
      maeBand: Number(mae.toFixed(2)), orderLetters, orderEssays,
      requirementOk: `${reqChecks.filter((r) => r.requirementOk).length}/${reqChecks.length}`,
      indonesianProse: `${Math.round(prose * 100)}%`, p50Ms: lat[Math.floor(lat.length / 2)] ?? null,
      tokPerSec: valid.map((r) => r.tokPerSec).find((v) => v) ?? null, results,
    };
    summary.push(s);
    console.log(`RINGKAS ${label}: valid ${s.valid}, dalam rentang ${s.inRange}, MAE ${s.maeBand}, urut surat ${orderLetters}, urut esai ${orderEssays}, req ${s.requirementOk}, bahasa ID ${s.indonesianProse}, p50 ${s.p50Ms}ms`);
  } catch (e) {
    console.log(`GAGAL ${label}: ${(e as Error).message}`);
    summary.push({ model: label, repo: hf, error: (e as Error).message });
  } finally {
    killTree(proc);
    log.end();
    await new Promise((r) => setTimeout(r, 4000));
  }
  writeFileSync(values.out!, JSON.stringify(summary, null, 2));
}
console.log('\nSELESAI. Hasil:', values.out);
