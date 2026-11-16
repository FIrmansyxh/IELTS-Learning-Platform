/**
 * Klien Speech-To-Text (STT) untuk penilaian AI Speaking (whisper.cpp / mock) (SPEC-013).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

export interface SttClient {
  readonly name: string;
  transcribe(wavPath: string, opts?: { language?: string }): Promise<SttResult>;
  ping(): Promise<boolean>;
}

export const MOCK_STT_TRANSCRIPT = [
  'I would like to talk about a memorable journey I took to the mountains last summer.',
  'It was a fantastic experience because the natural landscape was absolutely breathtaking and serene.',
  'We spent three days hiking along scenic trails and enjoying fresh air with close friends.',
  'This trip helped me relax and gain a completely new appreciation for nature.',
].join(' ');

export class MockSttClient implements SttClient {
  readonly name = 'mock-stt';
  private readonly transcript: string;
  private readonly confidence: number | null;
  private readonly delayMs: number;
  private readonly unreachable: boolean;

  constructor(opts?: {
    transcript?: string;
    confidence?: number | null;
    delayMs?: number;
    unreachable?: boolean;
  }) {
    this.transcript = opts?.transcript ?? MOCK_STT_TRANSCRIPT;
    this.confidence = opts?.confidence !== undefined ? opts.confidence : 0.95;
    this.delayMs = opts?.delayMs ?? 10;
    this.unreachable = opts?.unreachable ?? false;
  }

  async ping(): Promise<boolean> {
    return !this.unreachable;
  }

  async transcribe(_wavPath: string, _opts?: { language?: string }): Promise<SttResult> {
    void _wavPath;
    void _opts;
    if (this.unreachable) {
      throw new Error('STT service unreachable (Mock)');
    }
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    return {
      text: this.transcript,
      segments: [
        {
          start_ms: 0,
          end_ms: 30000,
          text: this.transcript,
          confidence: this.confidence,
        },
      ],
      confidence: this.confidence,
      engine: 'mock-stt 1.0',
    };
  }
}

export class WhisperCppClient implements SttClient {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts?: { baseUrl?: string; model?: string }) {
    this.baseUrl = opts?.baseUrl ?? process.env.STT_BASE_URL ?? 'http://127.0.0.1:8080';
    this.model = opts?.model ?? process.env.STT_MODEL ?? 'base.en';
    this.name = `whisper.cpp ${this.model}`;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(new URL('/health', this.baseUrl), {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async transcribe(wavPath: string, opts?: { language?: string }): Promise<SttResult> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const audioBytes = readFileSync(wavPath);
    const form = new FormData();
    form.append('file', new Blob([audioBytes]), path.basename(wavPath));
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0.0');
    form.append('language', opts?.language ?? 'en');

    const res = await fetch(new URL('/inference', this.baseUrl), {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout((Number(process.env.AI_JOB_TIMEOUT_SEC ?? 120)) * 1000),
    });

    if (!res.ok) {
      throw new Error(`Whisper.cpp HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as {
      text?: string;
      segments?: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number }>;
    };

    // whisper-server memecah teks per segmen dengan baris baru; satukan menjadi satu paragraf.
    const text = (data.text ?? '').replace(/\s+/g, ' ').trim();
    const segments: SttSegment[] = (data.segments ?? []).map((s) => {
      const conf = typeof s.avg_logprob === 'number' ? Math.exp(s.avg_logprob) : null;
      return {
        start_ms: Math.round((s.start ?? 0) * 1000),
        end_ms: Math.round((s.end ?? 0) * 1000),
        text: (s.text ?? '').trim(),
        confidence: conf !== null ? Math.min(1, Math.max(0, conf)) : null,
      };
    });

    // Rata-rata confidence
    const confs = segments.map((s) => s.confidence).filter((c): c is number => c !== null);
    const avgConf = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : null;

    return {
      text,
      segments,
      confidence: avgConf,
      engine: this.name,
    };
  }
}

let activeSttClient: SttClient | null = null;

export function getSttClient(): SttClient {
  if (activeSttClient) return activeSttClient;
  const driver = process.env.STT_DRIVER ?? (process.env.NODE_ENV === 'test' ? 'mock' : 'whisper.cpp');
  if (driver === 'mock') {
    activeSttClient = new MockSttClient();
  } else {
    activeSttClient = new WhisperCppClient();
  }
  return activeSttClient;
}

export function setSttClient(client: SttClient | null): void {
  activeSttClient = client;
}
