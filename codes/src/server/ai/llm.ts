/**
 * LlmClient (SPEC-012): satu-satunya jalur ke model bahasa. Hanya Ollama LOKAL (tanpa API berbayar, ADR-002) dan driver mock.
 * Catatan: OllamaClient diuji dengan server HTTP palsu; BELUM diverifikasi terhadap model Ollama sungguhan.
 */
import { z } from 'zod';
import type { LlmMessage } from './prompts';

export type LlmErrorCode = 'LLM_UNREACHABLE' | 'LLM_TIMEOUT' | 'LLM_ERROR';

export class LlmError extends Error {
  constructor(readonly code: LlmErrorCode) {
    super(code);
    this.name = 'LlmError';
  }
}

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  temperature: number;
  numPredict: number;
  /** JSON Schema keluaran (diteruskan ke Ollama `format`). */
  format: Record<string, unknown>;
  keepAlive: string;
  timeoutMs: number;
  /** Petunjuk untuk driver mock: bentuk keluaran yang dibuat. */
  schemaKind: 'writing' | 'speaking';
}

export interface LlmResult {
  content: string;
  latencyMs: number;
}

export interface LlmClient {
  generate(req: LlmRequest): Promise<LlmResult>;
  ping(): Promise<boolean>;
}

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  // Zod 4 membangkitkan JSON Schema; `$schema` dibuang karena Ollama hanya memerlukan badan skema.
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;
  return rest;
}

// ------------------------------------------------------------------ Ollama
export class OllamaClient implements LlmClient {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async generate(req: LlmRequest): Promise<LlmResult> {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(this.url('/api/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: false,
          format: req.format,
          keep_alive: req.keepAlive,
          options: { temperature: req.temperature, num_predict: req.numPredict },
        }),
        signal: AbortSignal.timeout(req.timeoutMs),
      });
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new LlmError('LLM_TIMEOUT');
      throw new LlmError('LLM_UNREACHABLE');
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new LlmError('LLM_ERROR');
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      throw new LlmError(name === 'TimeoutError' || name === 'AbortError' ? 'LLM_TIMEOUT' : 'LLM_ERROR');
    }
    const content = (body as { message?: { content?: unknown } } | null)?.message?.content;
    if (typeof content !== 'string') throw new LlmError('LLM_ERROR');
    return { content, latencyMs: Date.now() - started };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(this.url('/api/tags'), { signal: AbortSignal.timeout(2000) });
      await res.body?.cancel().catch(() => undefined);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ------------------------------------------------------------------ Mock
export type MockLlmMode = 'ok' | 'down' | 'invalid' | 'timeout';

export interface MockLlmOptions {
  mode?: MockLlmMode;
  latencyMs?: number;
  band?: number;
  /** Menimpa isi keluaran (string mentah) untuk uji adversarial. */
  content?: (req: LlmRequest, call: number) => string;
}

const WRITING_KEYS = ['task_response', 'coherence', 'lexical', 'grammar'] as const;
const SPEAKING_KEYS = ['fluency', 'lexical', 'grammar', 'pronunciation'] as const;

export function mockEvaluationJson(kind: 'writing' | 'speaking', band = 6): string {
  const keys = kind === 'writing' ? WRITING_KEYS : SPEAKING_KEYS;
  const criteria = Object.fromEntries(keys.map((k) => [k, { band, comment_id: `Komentar ${k}: sudah cukup baik, tingkatkan variasi.` }]));
  return JSON.stringify({
    criteria,
    overall_band: band,
    task_requirement_met: true,
    strengths_id: ['Ide utama jelas dan relevan.'],
    improvements_id: ['Tambahkan contoh yang lebih spesifik.'],
    corrections: [{ original: 'the powder', improved: 'the fine powder', reason_id: 'Tambahkan kata sifat agar lebih presisi.' }],
    band7_rewrite: 'An improved version of the response at about Band 7 level.',
  });
}

/** Driver mock deterministik. Mode/latensi dapat diatur lewat opsi atau env `MOCK_LLM_MODE`, `MOCK_LLM_LATENCY_MS`, `MOCK_LLM_BAND`. */
export class MockLlmClient implements LlmClient {
  calls = 0;
  constructor(private readonly opts: MockLlmOptions = {}) {}

  private mode(): MockLlmMode {
    const m = this.opts.mode ?? process.env.MOCK_LLM_MODE;
    return m === 'down' || m === 'invalid' || m === 'timeout' ? m : 'ok';
  }

  async generate(req: LlmRequest): Promise<LlmResult> {
    this.calls++;
    const mode = this.mode();
    if (mode === 'down') throw new LlmError('LLM_UNREACHABLE');
    if (mode === 'timeout') throw new LlmError('LLM_TIMEOUT');
    const latency = this.opts.latencyMs ?? Number(process.env.MOCK_LLM_LATENCY_MS ?? '0');
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    const band = this.opts.band ?? Number(process.env.MOCK_LLM_BAND ?? '6');
    let content: string;
    if (this.opts.content) content = this.opts.content(req, this.calls);
    else if (mode === 'invalid') content = '{"bukan":"skema"}';
    else content = mockEvaluationJson(req.schemaKind, band);
    return { content, latencyMs: Math.max(1, latency) };
  }

  async ping(): Promise<boolean> {
    return this.mode() !== 'down';
  }
}

// ------------------------------------------------------------------ pemilihan driver
let override: LlmClient | null = null;
let ollama: { url: string; client: OllamaClient } | null = null;

/** Hanya untuk pengujian. */
export function setLlmClientForTest(c: LlmClient | null): void {
  override = c;
}

export function getLlmClient(): LlmClient {
  if (override) return override;
  if ((process.env.LLM_DRIVER ?? 'ollama') === 'mock') return new MockLlmClient();
  const url = process.env.OLLAMA_BASE_URL;
  if (!url) throw new LlmError('LLM_ERROR');
  if (!ollama || ollama.url !== url) ollama = { url, client: new OllamaClient(url) };
  return ollama.client;
}

export function llmModelName(kind: 'writing' | 'speaking'): string {
  if ((process.env.LLM_DRIVER ?? 'ollama') === 'mock' || override) return process.env.OLLAMA_MODEL_WRITING || 'mock-llm';
  const m = kind === 'speaking' ? process.env.OLLAMA_MODEL_SPEAKING || process.env.OLLAMA_MODEL_WRITING : process.env.OLLAMA_MODEL_WRITING;
  if (!m) throw new LlmError('LLM_ERROR');
  return m;
}
