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
import { buildWritingSystemPrompt, WRITING_USER_HINTS } from '../src/server/ai/writing-prompts.ts';
import { findGenericComments } from '../src/server/ai/comment-quality.ts';
import type { GtCase } from './bench/gt-cases.mts';

const { values } = parseArgs({
  options: {
    models: { type: 'string' },
    out: { type: 'string', default: 'bench-gt-writing.json' },
    port: { type: 'string', default: '8081' },
    reps: { type: 'string', default: '1' }, // ulangi tiap kasus N kali (ukur derau)
    cases: { type: 'string', default: 'default' }, // "default" (gt-cases.mts) atau "heldout" (gt-cases-heldout.mts)
    hint: { type: 'string', default: '' }, // petunjuk prompt tambahan khusus benchmark: "text", "calib" atau "text,calib"
    ctx: { type: 'string', default: '6144' },
    'download-timeout-min': { type: 'string', default: '45' },
  },
});
if (!values.models) {
  console.error('Flag --models wajib: "label=repo:quant,..."');
  process.exit(1);
}
const REPS = Math.max(1, Number(values.reps));
const { CASES } = (await import(values.cases === 'heldout' ? './bench/gt-cases-heldout.mts' : './bench/gt-cases.mts')) as { CASES: GtCase[] };
// Petunjuk eksperimen (hanya benchmark; prompt produksi di writing-prompts.ts tidak diubah).
const HINTS: Record<string, string> = {
  text: '\n\nFORMAT RULE: Every comment_id, strengths_id, improvements_id and reason_id value must be a complete, natural Indonesian sentence of at least 8 words. Never output placeholders or identifiers such as "K1", "komentar1" or "T1-1".',
  calib: '\n\nCALIBRATION: Score like a strict, experienced IELTS examiner. Most candidates score between 5.0 and 7.0. Band 8 or 9 is extremely rare and requires near-flawless, natural, sophisticated writing; never give above 7.5 to a response that contains noticeable errors, a formulaic structure or unnatural phrasing.',
};
// "prod" = petunjuk produksi (WRITING_USER_HINTS, termasuk COMMENT QUALITY), supaya benchmark sama dengan aplikasi.
HINTS.prod = WRITING_USER_HINTS;
const HINT_TEXT = (values.hint ?? '').split(',').map((h) => h.trim()).filter(Boolean).map((h) => HINTS[h] ?? '').join('');
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
      // enable_thinking: Qwen/Gemma; reasoning_effort: gpt-oss (template lain mengabaikan kunci yang tak dikenal).
      chat_template_kwargs: { enable_thinking: false, reasoning_effort: 'low' },
      messages: [
        { role: 'system', content: buildWritingSystemPrompt(c.kind) },
        {
          role: 'user',
          content: `Task Prompt:\n${c.prompt}\n\nStudent Response:\n<student_response id="bench">\n${c.response}\n</student_response>\n\nREMINDER: every comment_id, strengths_id, improvements_id and reason_id value MUST be written in Indonesian (Bahasa Indonesia). Only "original", "improved" and "band7_rewrite" stay in English. All band values must be multiples of 0.5.${HINT_TEXT}`,
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
      // Komentar generik/label/placeholder (comment-quality.ts); pada produksi satu kali ulang dipicu bila > 0.
      genericFields: findGenericComments(out).length,
      metaStart: /^(komentar|keterangan)\b/i.test(out.criteria.task_response.comment_id.trim()),
      sample: out.criteria.task_response.comment_id.slice(0, 160),
    };
  } catch (e) {
    return { id: c.id, valid: false, latencyMs, error: String((e as Error).message).slice(0, 120), raw: content.slice(0, 120) };
  }
}

type CaseResult = Awaited<ReturnType<typeof evaluate>>;
const summary: unknown[] = [];

for (const spec of values.models.split(',')) {
  // Format: label=repo:quant[|flag llama-server tambahan], mis. "x=org/repo:Q4_K_M|--cpu-moe -ngl 99" (tanpa koma).
  const [head, extra = ''] = spec.split('|');
  const [label, hf] = head!.split('=');
  if (!label || !hf) continue;
  const extraArgs = extra.trim() ? extra.trim().split(/\s+/) : [];
  console.log(`\n##### ${label}  (${hf}) ${extraArgs.join(' ')}`);
  const log = createWriteStream(`${values.out}.${label}.server.log`);
  const proc = spawn(process.env.LLAMA_SERVER ?? 'llama-server', ['-hf', hf, '--device', 'Vulkan0', '-c', values.ctx!, '--parallel', '1', '--host', '127.0.0.1', '--port', String(PORT), ...extraArgs], {
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
    for (const c of Array.from({ length: REPS }, () => CASES).flat()) {
      const r = await evaluate(c);
      results.push(r);
      console.log(r.valid ? `${c.id.padEnd(18)} band=${r.band} (ok ${c.range.join('-')}) ${r.inRange ? 'OK ' : 'XX '} bahasa=${r.proseGood}/${r.proseTotal} ${r.latencyMs}ms` : `${c.id.padEnd(18)} INVALID ${r.error}`);
    }
    const valid = results.filter((r) => r.valid);
    // Dengan REPS > 1, urutan kualitas dinilai dari rata-rata band per kasus.
    const byId = Object.fromEntries(
      CASES.map((c) => {
        const bs = valid.filter((r) => r.id === c.id).map((r) => r.band as number);
        return [c.id, bs.length ? bs.reduce((a, b) => a + b, 0) / bs.length : NaN];
      }),
    );
    const inRange = valid.filter((r) => r.inRange).length;
    const mae = valid.reduce((s, r) => s + Math.abs((r.band as number) - (r.range![0] + r.range![1]) / 2), 0) / Math.max(1, valid.length);
    const prose = valid.reduce((s, r) => s + (r.proseGood ?? 0), 0) / Math.max(1, valid.reduce((s, r) => s + (r.proseTotal ?? 0), 0));
    const reqChecks = valid.filter((r) => r.requirementOk !== null);
    const held = values.cases === 'heldout';
    const [l1, l2, l3] = held ? ['H2-formal-weak', 'H3-semiformal-mid', 'H1-informal-good'] : ['L1-weak-slang', 'L2-mid-errors', 'L3-good'];
    const [e1, e2, e3] = held ? ['H5-essay-band5', 'H6-essay-band6', 'H7-essay-band7'] : ['T2-band5', 'T2-band6', 'T2-band7'];
    const orderLetters = byId[l1!]! < byId[l2!]! && byId[l2!]! <= byId[l3!]!;
    const orderEssays = byId[e1!]! < byId[e2!]! && byId[e2!]! <= byId[e3!]!;
    const lat = valid.map((r) => r.latencyMs).sort((a, b) => a - b);
    const s = {
      model: label, repo: hf, valid: `${valid.length}/${results.length}`, inRange: `${inRange}/${results.length}`,
      maeBand: Number(mae.toFixed(2)), orderLetters, orderEssays,
      // Selisih band tertinggi-terendah antar ulangan, rata-rata per kasus (derau; 0 bila REPS=1).
      meanSpread: Number(
        (
          CASES.reduce((sum, c) => {
            const bs = valid.filter((r) => r.id === c.id).map((r) => r.band as number);
            return sum + (bs.length ? Math.max(...bs) - Math.min(...bs) : 0);
          }, 0) / CASES.length
        ).toFixed(2),
      ),
      requirementOk: `${reqChecks.filter((r) => r.requirementOk).length}/${reqChecks.length}`,
      indonesianProse: `${Math.round(prose * 100)}%`,
      outputsWithGeneric: `${valid.filter((r) => (r.genericFields ?? 0) > 0).length}/${valid.length}`,
      outputsMetaStart: `${valid.filter((r) => r.metaStart).length}/${valid.length}`,
      p50Ms: lat[Math.floor(lat.length / 2)] ?? null,
      tokPerSec: valid.map((r) => r.tokPerSec).find((v) => v) ?? null, results,
    };
    summary.push(s);
    console.log(`RINGKAS ${label}: valid ${s.valid}, dalam rentang ${s.inRange}, MAE ${s.maeBand}, urut surat ${orderLetters}, urut esai ${orderEssays}, req ${s.requirementOk}, bahasa ID ${s.indonesianProse}, generik ${s.outputsWithGeneric}, awalan "Komentar" ${s.outputsMetaStart}, p50 ${s.p50Ms}ms`);
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
