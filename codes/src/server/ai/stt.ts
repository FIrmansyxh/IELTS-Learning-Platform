/**
 * SttClient (SPEC-013): satu-satunya jalur ke pengenal suara. Hanya whisper.cpp LOKAL dan driver mock; tidak ada layanan
 * pihak ketiga dan tidak ada STT di peramban. WhisperCppClient diuji dengan server HTTP palsu; BELUM diverifikasi terhadap
 * whisper.cpp sungguhan.
 */
import { readFile } from 'node:fs/promises';

export interface SttSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
}
export interface SttResult {
  text: string;
  segments: SttSegment[];
  confidence: number | null;
  engine: string;
}

export class SttError extends Error {
  constructor(readonly code: 'STT_UNREACHABLE') {
    super(code);
    this.name = 'SttError';
  }
}

export interface SttClient {
  transcribe(wavPath: string, opts: { language: string; timeoutMs: number }): Promise<SttResult>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class WhisperCppClient implements SttClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async transcribe(wavPath: string, opts: { language: string; timeoutMs: number }): Promise<SttResult> {
    const data = await readFile(wavPath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type: 'audio/wav' }), 'in.wav');
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0.0');
    form.append('language', opts.language);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(opts.timeoutMs) });
    } catch {
      throw new SttError('STT_UNREACHABLE');
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new SttError('STT_UNREACHABLE');
    }
    let body: { text?: unknown; segments?: unknown };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new SttError('STT_UNREACHABLE');
    }
    const rawSegs = Array.isArray(body.segments) ? (body.segments as Array<Record<string, unknown>>) : [];
    const segments: SttSegment[] = rawSegs.map((s) => {
      const logprob = num(s.avg_logprob);
      return {
        start_ms: Math.round((num(s.start) ?? 0) * 1000),
        end_ms: Math.round((num(s.end) ?? 0) * 1000),
        text: typeof s.text === 'string' ? s.text.trim() : '',
        confidence: logprob === null ? null : Math.min(1, Math.max(0, Math.exp(logprob))),
      };
    });
    const text = typeof body.text === 'string' ? body.text.trim() : segments.map((s) => s.text).join(' ').trim();
    const confs = segments.map((s) => s.confidence).filter((c): c is number => c !== null);
    return {
      text,
      segments,
      confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null,
      engine: `whisper.cpp ${this.model}`,
    };
  }
}

/** Transkrip mock tetap: tepat 60 kata (SPEC-013). */
export const DEFAULT_MOCK_TRANSCRIPT =
  'I would like to talk about a place that I really enjoy visiting, which is the old town in my city. ' +
  'It is a quiet area with narrow streets and many small cafes where people can relax after work. ' +
  'I usually go there on weekends with my best friends because the atmosphere is calm and the food is truly delicious.';

export type MockSttMode = 'ok' | 'down';
export interface MockSttOptions {
  mode?: MockSttMode;
  transcript?: string;
  confidence?: number | null;
}

/** Driver mock: transkrip tetap dari `MOCK_STT_TRANSCRIPT` (default 60 kata), keyakinan `MOCK_STT_CONFIDENCE` (default 0.9). */
export class MockSttClient implements SttClient {
  calls = 0;
  constructor(private readonly opts: MockSttOptions = {}) {}

  async transcribe(): Promise<SttResult> {
    this.calls++;
    const mode = this.opts.mode ?? (process.env.MOCK_STT_MODE === 'down' ? 'down' : 'ok');
    if (mode === 'down') throw new SttError('STT_UNREACHABLE');
    const text = (this.opts.transcript ?? process.env.MOCK_STT_TRANSCRIPT ?? DEFAULT_MOCK_TRANSCRIPT).trim();
    const envConf = process.env.MOCK_STT_CONFIDENCE;
    const confidence = this.opts.confidence !== undefined ? this.opts.confidence : envConf !== undefined && envConf !== '' ? Number(envConf) : 0.9;
    const words = text.split(/\s+/).filter(Boolean);
    const segments: SttSegment[] = [];
    for (let i = 0; i < words.length; i += 12) {
      segments.push({ start_ms: i * 400, end_ms: Math.min(words.length, i + 12) * 400, text: words.slice(i, i + 12).join(' '), confidence });
    }
    return { text, segments, confidence, engine: 'mock-stt' };
  }
}

let override: SttClient | null = null;
/** Hanya untuk pengujian. */
export function setSttClientForTest(c: SttClient | null): void {
  override = c;
}

export function getSttClient(): SttClient {
  if (override) return override;
  if ((process.env.STT_DRIVER ?? 'whisper') === 'mock') return new MockSttClient();
  const url = process.env.STT_BASE_URL;
  if (!url) throw new SttError('STT_UNREACHABLE');
  return new WhisperCppClient(url, process.env.STT_MODEL ?? 'unknown');
}
