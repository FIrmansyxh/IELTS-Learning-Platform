/**
 * Klien LLM untuk penilaian AI lokal (llama.cpp / Ollama / Mock) (SPEC-012, ADR-004).
 */

export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  schema?: Record<string, unknown>;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}

export interface LlmResponse {
  content: string;
  latencyMs: number;
}

export interface LlmClient {
  readonly name: string;
  generate(req: LlmRequest): Promise<LlmResponse>;
  ping(): Promise<boolean>;
}

export class OllamaClient implements LlmClient {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts?: { baseUrl?: string; model?: string }) {
    this.baseUrl = opts?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    this.model = opts?.model ?? process.env.OLLAMA_MODEL_WRITING ?? 'qwen2.5:3b-instruct';
    this.name = this.model;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(new URL('/api/tags', this.baseUrl), {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
    const timeout = req.timeoutMs ?? (Number(process.env.AI_JOB_TIMEOUT_SEC ?? 120)) * 1000;

    const payload: Record<string, unknown> = {
      model: this.model,
      stream: false,
      options: {
        temperature: req.temperature ?? 0.2,
        num_predict: req.numPredict ?? 1500,
      },
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
    };

    if (req.schema) {
      payload.format = req.schema;
    }

    const res = await fetch(new URL('/api/chat', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { message?: { content?: string } };
    return {
      content: body?.message?.content ?? '',
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Klien llama.cpp `llama-server` (ADR-004): API OpenAI-compatible di loopback.
 * Keluaran terstruktur dipaksa lewat `response_format.json_schema` (grammar bawaan llama.cpp).
 */
export class LlamaCppClient implements LlmClient {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts?: { baseUrl?: string; model?: string }) {
    this.baseUrl = opts?.baseUrl ?? process.env.LLAMACPP_BASE_URL ?? 'http://127.0.0.1:8080';
    // llama-server melayani satu model; nama hanya label di log/audit.
    this.model = opts?.model ?? process.env.LLAMACPP_MODEL_WRITING ?? 'qwen2.5-7b-instruct-q4_k_m';
    this.name = this.model;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(new URL('/health', this.baseUrl), { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
    const timeout = req.timeoutMs ?? Number(process.env.AI_JOB_TIMEOUT_SEC ?? 120) * 1000;

    const payload: Record<string, unknown> = {
      model: this.model,
      stream: false,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.numPredict ?? 1500,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
    };

    if (req.schema) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: { name: 'evaluation', strict: true, schema: req.schema },
      };
    }

    const res = await fetch(new URL('/v1/chat/completions', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      throw new Error(`llama.cpp API error: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return {
      content: body?.choices?.[0]?.message?.content ?? '',
      latencyMs: Date.now() - started,
    };
  }
}

export class MockLlmClient implements LlmClient {
  readonly name = 'mock-llm-model';

  constructor(
    private readonly opts?: {
      validOutput?: boolean;
      delayMs?: number;
      failOnFirst?: boolean;
      unreachable?: boolean;
    },
  ) {}

  async ping(): Promise<boolean> {
    return !this.opts?.unreachable;
  }

  async generate(_req: LlmRequest): Promise<LlmResponse> {
    void _req;
    if (this.opts?.unreachable) {
      throw new Error('Ollama tidak terjangkau (Mock)');
    }

    if (this.opts?.delayMs) {
      await new Promise((r) => setTimeout(r, this.opts!.delayMs));
    }

    if (this.opts?.validOutput === false) {
      return {
        content: '{"invalid_json": true}',
        latencyMs: 10,
      };
    }

    const sampleOutput = {
      criteria: {
        task_response: { band: 6.0, comment_id: 'Menjawab sebagian besar tugas dengan argumen pendukung.' },
        coherence: { band: 6.5, comment_id: 'Penggunaan penghubung kalimat sudah cukup kohesif.' },
        lexical: { band: 5.5, comment_id: 'Kosakata memadai namun variasi kata akademik masih perlu diperkaya.' },
        grammar: { band: 6.0, comment_id: 'Kalimat kompleks digunakan meski masih ada beberapa kesalahan tata bahasa.' },
      },
      overall_band: 6.0,
      task_requirement_met: true,
      strengths_id: [
        'Struktur esai jelas dengan pendahuluan, isi, dan kesimpulan.',
        'Ide pokok pada tiap paragraf dapat dipahami dengan baik.',
      ],
      improvements_id: [
        'Tingkatkan variasi kosakata akademik dan kolokasi.',
        'Perhatikan ketepatan penggunaan tenses pada kalimat kompleks.',
      ],
      corrections: [
        {
          original: 'Some people is thinking',
          improved: 'Some people think',
          reason_id: 'Gunakan simple present tense untuk pernyataan umum.',
        },
      ],
      band7_rewrite: 'It is widely believed that modern technology significantly enhances learning efficiency...',
    };

    return {
      content: JSON.stringify(sampleOutput),
      latencyMs: 15,
    };
  }
}

let activeLlmClient: LlmClient | undefined;

export function getLlmClient(): LlmClient {
  if (activeLlmClient) return activeLlmClient;
  const driver = process.env.LLM_DRIVER ?? (process.env.NODE_ENV === 'test' ? 'mock' : 'llamacpp');
  if (driver === 'mock') {
    return new MockLlmClient();
  }
  if (driver === 'ollama') {
    return new OllamaClient();
  }
  return new LlamaCppClient();
}

export function setLlmClient(client: LlmClient | undefined): void {
  activeLlmClient = client;
}
