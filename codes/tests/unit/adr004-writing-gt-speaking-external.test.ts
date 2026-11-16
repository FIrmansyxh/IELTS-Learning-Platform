import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWritingSystemPrompt, WRITING_USER_HINTS } from '@/server/ai/writing-prompts';
import { snapBandsToHalf } from '@/server/ai/pipeline';
import { buildSpeakingExternalPrompt } from '@/lib/speaking-external-prompt';
import { LlamaCppClient, getLlmClient, setLlmClient } from '@/server/ai/llm';
import { config } from '@/server/config';

describe('ADR-004: prompt Writing General Training', () => {
  it('Task 1 = surat (cek poin, register), bukan grafik', () => {
    const p = buildWritingSystemPrompt('WRITING_TASK1');
    expect(p).toContain('LETTER');
    expect(p).toContain('bullet point');
    expect(p).toContain('Yours faithfully');
    expect(p).not.toMatch(/Academic/i);
    expect(p).toContain('You only EVALUATE');
  });
  it('Task 2 = esai 250 kata; mini-task tidak dihukum karena pendek', () => {
    expect(buildWritingSystemPrompt('WRITING_TASK2')).toContain('250 words');
    expect(buildWritingSystemPrompt('MINI_TASK_WRITING')).toContain('do not penalise');
  });
});

describe('ADR-004: petunjuk pengguna Writing', () => {
  it('memuat aturan format komentar dan kalibrasi band', () => {
    expect(WRITING_USER_HINTS).toContain('complete, natural Indonesian sentence');
    expect(WRITING_USER_HINTS).toContain('"K1"');
    expect(WRITING_USER_HINTS).toContain('Band 8 or 9 is extremely rare');
    expect(WRITING_USER_HINTS).toContain('never begin a comment with the word "Komentar"');
  });
});

describe('snapBandsToHalf', () => {
  it('membulatkan ke 0.5 terdekat dan membatasi 0..9', () => {
    const out = snapBandsToHalf({
      overall_band: 6.8,
      criteria: { task_response: { band: 7.2 }, coherence: { band: 11 }, lexical: { band: -1 }, grammar: { band: 6.25 } },
    }) as { overall_band: number; criteria: Record<string, { band: number }> };
    expect(out.overall_band).toBe(7);
    expect(out.criteria.task_response!.band).toBe(7);
    expect(out.criteria.coherence!.band).toBe(9);
    expect(out.criteria.lexical!.band).toBe(0);
    expect(out.criteria.grammar!.band).toBe(6.5);
  });
  it('aman untuk masukan non-objek', () => {
    expect(snapBandsToHalf(null)).toBeNull();
    expect(snapBandsToHalf('x')).toBe('x');
  });
});

describe('ADR-004: prompt Speaking untuk AI eksternal', () => {
  it('Part 2 memuat cue card, jeda persiapan, dan aturan evaluasi', () => {
    const p = buildSpeakingExternalPrompt({
      part: 2,
      prompt: 'Describe a place you visited on holiday.',
      cuePoints: ['where it was', 'who you went with'],
      prepSeconds: 60,
      recordSeconds: 120,
    });
    expect(p).toContain('General Training');
    expect(p).toContain('Describe a place you visited on holiday.');
    expect(p).toContain('- where it was');
    expect(p).toContain('60 seconds');
    expect(p).toContain('Fluency and Coherence');
    expect(p).toContain('Indonesian');
    expect(p).toContain('not an official IELTS score');
  });
  it('Part 1 dan 3 punya alur berbeda', () => {
    const p1 = buildSpeakingExternalPrompt({ part: 1, prompt: 'Do you work or study?' });
    const p3 = buildSpeakingExternalPrompt({ part: 3, prompt: 'How has travel changed?' });
    expect(p1).toContain('Part 1');
    expect(p3).toContain('Part 3');
    expect(p3).not.toContain('topic card');
  });
});

describe('ADR-004: driver llama.cpp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    setLlmClient(undefined);
  });

  it('memanggil /v1/chat/completions dengan json_schema dan membaca choices', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const c = new LlamaCppClient({ baseUrl: 'http://127.0.0.1:8080', model: 'm' });
    const r = await c.generate({ systemPrompt: 's', userPrompt: 'u', schema: { type: 'object' } });
    expect(r.content).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:8080/v1/chat/completions');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[0].role).toBe('system');
    // Konfigurasi yang divalidasi di benchmark (gpt-oss butuh reasoning_effort, Qwen/Gemma enable_thinking).
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false, reasoning_effort: 'low' });
  });

  it('label model default adalah gpt-oss-20b (ADR-004 addendum 2026-11-11)', () => {
    vi.stubEnv('LLAMACPP_MODEL_WRITING', '');
    delete process.env.LLAMACPP_MODEL_WRITING;
    expect(new LlamaCppClient().name).toBe('gpt-oss-20b-mxfp4');
  });

  it('driver default (di luar test) adalah llamacpp; "ollama" tetap bisa dipilih', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LLM_DRIVER', '');
    delete process.env.LLM_DRIVER;
    expect(getLlmClient().constructor.name).toBe('LlamaCppClient');
    vi.stubEnv('LLM_DRIVER', 'ollama');
    expect(getLlmClient().constructor.name).toBe('OllamaClient');
  });

  it('flag SPEAKING_AI_ENABLED: aktif secara default, mati bila "false"', () => {
    delete process.env.SPEAKING_AI_ENABLED;
    expect(config.speakingAiEnabled()).toBe(true);
    vi.stubEnv('SPEAKING_AI_ENABLED', 'false');
    expect(config.speakingAiEnabled()).toBe(false);
  });
});
