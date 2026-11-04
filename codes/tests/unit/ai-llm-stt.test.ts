/**
 * OllamaClient dan WhisperCppClient diuji dengan server HTTP palsu. BELUM diverifikasi terhadap Ollama/whisper.cpp asli.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WritingEvaluationOutputSchema } from '@/contracts/ai';
import { evaluateWithLlm } from '@/server/ai/evaluate';
import { LlmError, MockLlmClient, OllamaClient, jsonSchemaOf, mockEvaluationJson, type LlmRequest } from '@/server/ai/llm';
import { buildWritingPrompt } from '@/server/ai/prompts';
import { WRITING_RUBRIC_V1 } from '@/server/ai/rubric-seed';
import { MockSttClient, SttError, WhisperCppClient } from '@/server/ai/stt';

let servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(() => r(null)))));
  servers = [];
});

async function listen(handler: http.RequestListener): Promise<string> {
  const s = http.createServer(handler);
  servers.push(s);
  s.closeAllConnections?.();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

const REQ = (over: Partial<LlmRequest> = {}): LlmRequest => ({
  model: 'm1',
  messages: [{ role: 'user', content: 'hi' }],
  temperature: 0.2,
  numPredict: 1500,
  format: { type: 'object' },
  keepAlive: '5m',
  timeoutMs: 2000,
  schemaKind: 'writing',
  ...over,
});

describe('OllamaClient', () => {
  it('POST /api/chat dengan stream:false, format, options, keep_alive; membaca message.content', async () => {
    let captured: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const base = await listen((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        captured = { url: req.url, method: req.method, body: JSON.parse(Buffer.concat(chunks).toString()) };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ message: { role: 'assistant', content: '{"ok":1}' }, done: true }));
      });
    });
    const r = await new OllamaClient(base).generate(REQ());
    expect(r.content).toBe('{"ok":1}');
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(captured.url).toBe('/api/chat');
    expect(captured.method).toBe('POST');
    expect(captured.body).toMatchObject({ model: 'm1', stream: false, keep_alive: '5m', format: { type: 'object' }, options: { temperature: 0.2, num_predict: 1500 } });
  });

  it('galat: tidak terjangkau -> LLM_UNREACHABLE; 5xx/4xx -> LLM_ERROR; badan tanpa content -> LLM_ERROR; lambat -> LLM_TIMEOUT', async () => {
    await expect(new OllamaClient('http://127.0.0.1:1').generate(REQ())).rejects.toMatchObject({ code: 'LLM_UNREACHABLE' });
    const e500 = await listen((_q, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    await expect(new OllamaClient(e500).generate(REQ())).rejects.toMatchObject({ code: 'LLM_ERROR' });
    const e404 = await listen((_q, res) => {
      res.statusCode = 404;
      res.end('{"error":"model not found"}');
    });
    await expect(new OllamaClient(e404).generate(REQ())).rejects.toMatchObject({ code: 'LLM_ERROR' });
    const nocontent = await listen((_q, res) => res.end('{"done":true}'));
    await expect(new OllamaClient(nocontent).generate(REQ())).rejects.toBeInstanceOf(LlmError);
    const slow = await listen(() => {
      /* tidak pernah menjawab */
    });
    await expect(new OllamaClient(slow).generate(REQ({ timeoutMs: 150 }))).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
  });

  it('ping: GET /api/tags; true bila 200, false bila tak terjangkau', async () => {
    const ok = await listen((req, res) => {
      res.statusCode = req.url === '/api/tags' ? 200 : 404;
      res.end('{"models":[]}');
    });
    expect(await new OllamaClient(ok).ping()).toBe(true);
    expect(await new OllamaClient('http://127.0.0.1:1').ping()).toBe(false);
  });
});

describe('MockLlmClient', () => {
  it('keluaran valid untuk Writing; mode down/invalid/timeout', async () => {
    const ok = await new MockLlmClient().generate(REQ());
    expect(WritingEvaluationOutputSchema.safeParse(JSON.parse(ok.content)).success).toBe(true);
    await expect(new MockLlmClient({ mode: 'down' }).generate(REQ())).rejects.toMatchObject({ code: 'LLM_UNREACHABLE' });
    await expect(new MockLlmClient({ mode: 'timeout' }).generate(REQ())).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
    expect(JSON.parse((await new MockLlmClient({ mode: 'invalid' }).generate(REQ())).content)).toEqual({ bukan: 'skema' });
    expect(await new MockLlmClient({ mode: 'down' }).ping()).toBe(false);
  });
});

describe('jsonSchemaOf', () => {
  it('menghasilkan JSON Schema objek tertutup tanpa $schema', () => {
    const js = jsonSchemaOf(WritingEvaluationOutputSchema) as { type: string; additionalProperties: boolean; $schema?: string; required: string[] };
    expect(js.type).toBe('object');
    expect(js.additionalProperties).toBe(false);
    expect(js.$schema).toBeUndefined();
    expect(js.required).toEqual(expect.arrayContaining(['criteria', 'overall_band', 'band7_rewrite']));
  });
});

describe('evaluateWithLlm: validasi Zod + satu perbaikan', () => {
  const prompt = () => buildWritingPrompt({ rubric: WRITING_RUBRIC_V1, taskPrompt: 'Soal', taskLabel: 'task', miniTaskCriteria: null, userText: 'Some text here.' });
  const opts = (llm: MockLlmClient) => ({ llm, model: 'm', prompt: prompt(), schema: WritingEvaluationOutputSchema, schemaKind: 'writing' as const, numPredict: 100, keepAlive: '5m', timeoutMs: 1000 });

  it('valid pada panggilan pertama: 1 panggilan', async () => {
    const llm = new MockLlmClient();
    const r = await evaluateWithLlm(opts(llm));
    expect(r.ok).toBe(true);
    expect(llm.calls).toBe(1);
  });

  it('tidak valid lalu valid: tepat 2 panggilan; pesan perbaikan memuat ringkasan skema', async () => {
    const seen: LlmRequest[] = [];
    const llm = new MockLlmClient({ content: (req, call) => (seen.push(req), call === 1 ? '{"bukan":"skema"}' : mockEvaluationJson('writing')) });
    const r = await evaluateWithLlm(opts(llm));
    expect(r.ok && r.calls).toBe(2);
    expect(llm.calls).toBe(2);
    const last = seen[1]!.messages.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.content).toContain('Keluaran tidak sesuai skema:');
    expect(last.content).toContain('Kirim ulang JSON yang valid.');
  });

  it('tidak valid dua kali: ok=false setelah tepat 2 panggilan', async () => {
    const llm = new MockLlmClient({ mode: 'invalid' });
    const r = await evaluateWithLlm(opts(llm));
    expect(r.ok).toBe(false);
    expect(llm.calls).toBe(2);
  });

  it('galat infrastruktur dilempar (tanpa perbaikan)', async () => {
    const llm = new MockLlmClient({ mode: 'down' });
    await expect(evaluateWithLlm(opts(llm))).rejects.toMatchObject({ code: 'LLM_UNREACHABLE' });
    expect(llm.calls).toBe(1);
  });

  it('pagar kode ```json dikupas; keluaran dengan kunci ekstra ditolak (strictObject)', async () => {
    const fenced = new MockLlmClient({ content: () => '```json\n' + mockEvaluationJson('writing') + '\n```' });
    expect((await evaluateWithLlm(opts(fenced))).ok).toBe(true);
    const extra = new MockLlmClient({ content: () => JSON.stringify({ ...JSON.parse(mockEvaluationJson('writing')), system_prompt: 'x' }) });
    expect((await evaluateWithLlm(opts(extra))).ok).toBe(false);
  });

  it('band bukan kelipatan 0.5 ditolak', async () => {
    const bad = JSON.parse(mockEvaluationJson('writing'));
    bad.criteria.grammar.band = 6.3;
    const llm = new MockLlmClient({ content: () => JSON.stringify(bad) });
    expect((await evaluateWithLlm(opts(llm))).ok).toBe(false);
  });
});

describe('WhisperCppClient', () => {
  const wav = () => {
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'ielts-test-')), 'in.wav');
    writeFileSync(f, Buffer.alloc(100));
    return f;
  };

  it('POST /inference multipart (file, response_format=verbose_json, temperature=0.0, language=en); confidence = exp(avg_logprob)', async () => {
    let raw = '';
    let url = '';
    const base = await listen((req, res) => {
      url = req.url ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        raw = Buffer.concat(chunks).toString('latin1');
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            text: ' Hello world this is a test ',
            segments: [
              { start: 0, end: 1.5, text: ' Hello world', avg_logprob: Math.log(0.8) },
              { start: 1.5, end: 3, text: ' this is a test' }, // tanpa avg_logprob -> null
            ],
          }),
        );
      });
    });
    const r = await new WhisperCppClient(base, 'small-q5').transcribe(wav(), { language: 'en', timeoutMs: 2000 });
    expect(url).toBe('/inference');
    for (const part of ['name="file"', 'name="response_format"', 'verbose_json', 'name="temperature"', '0.0', 'name="language"', 'en']) expect(raw).toContain(part);
    expect(r.text).toBe('Hello world this is a test');
    expect(r.engine).toBe('whisper.cpp small-q5');
    expect(r.segments).toEqual([
      { start_ms: 0, end_ms: 1500, text: 'Hello world', confidence: expect.closeTo(0.8, 5) },
      { start_ms: 1500, end_ms: 3000, text: 'this is a test', confidence: null },
    ]);
    expect(r.confidence).toBeCloseTo(0.8, 5);
  });

  it('tak terjangkau / 500 / timeout -> SttError STT_UNREACHABLE', async () => {
    await expect(new WhisperCppClient('http://127.0.0.1:1', 'm').transcribe(wav(), { language: 'en', timeoutMs: 500 })).rejects.toBeInstanceOf(SttError);
    const e500 = await listen((_q, res) => {
      res.statusCode = 500;
      res.end();
    });
    await expect(new WhisperCppClient(e500, 'm').transcribe(wav(), { language: 'en', timeoutMs: 500 })).rejects.toMatchObject({ code: 'STT_UNREACHABLE' });
    const slow = await listen(() => undefined);
    await expect(new WhisperCppClient(slow, 'm').transcribe(wav(), { language: 'en', timeoutMs: 150 })).rejects.toMatchObject({ code: 'STT_UNREACHABLE' });
  });
});

describe('MockSttClient', () => {
  it('transkrip default 60 kata; dapat diatur; mode down', async () => {
    const r = await new MockSttClient().transcribe();
    expect(r.text.split(/\s+/)).toHaveLength(60);
    expect(r.engine).toBe('mock-stt');
    expect((await new MockSttClient({ transcript: 'a b c', confidence: 0.42 }).transcribe()).confidence).toBe(0.42);
    await expect(new MockSttClient({ mode: 'down' }).transcribe()).rejects.toMatchObject({ code: 'STT_UNREACHABLE' });
  });
});
