/**
 * Inti panggilan LLM + validasi keluaran (tanpa DB): panggilan pertama, SATU perbaikan bila skema gagal (SPEC-012 butir 6).
 * Kebocoran prompt (penanda rahasia / kalimat pembuka prompt sistem pada keluaran) diperlakukan sebagai keluaran tidak valid.
 */
import type { z } from 'zod';
import { jsonSchemaOf, type LlmClient } from './llm';
import { repairMessages, summarizeZodIssues, type BuiltPrompt } from './prompts';

export interface EvaluateOptions<T extends z.ZodType> {
  llm: LlmClient;
  model: string;
  prompt: BuiltPrompt;
  schema: T;
  schemaKind: 'writing' | 'speaking';
  numPredict: number;
  keepAlive: string;
  timeoutMs: number;
}

export type EvaluateResult<T> =
  | { ok: true; data: T; raw: string; latencyMs: number; calls: number }
  | { ok: false; raw: string; latencyMs: number; calls: number };

function stripFences(s: string): string {
  const t = s.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1]! : t;
}

export function leaksPrompt(output: string, prompt: Pick<BuiltPrompt, 'canary' | 'systemPrompt'>): boolean {
  if (output.includes(prompt.canary)) return true;
  const opener = prompt.systemPrompt.slice(0, 60);
  return output.includes(opener);
}

/** Parse + validasi; mengembalikan data atau ringkasan galat (tanpa nilai masukan). */
export function parseOutput<T extends z.ZodType>(raw: string, schema: T, prompt: Pick<BuiltPrompt, 'canary' | 'systemPrompt'>): { ok: true; data: z.output<T> } | { ok: false; summary: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, summary: '(root): invalid_json' };
  }
  const r = schema.safeParse(json);
  if (!r.success) return { ok: false, summary: summarizeZodIssues(r.error) };
  if (leaksPrompt(raw, prompt)) return { ok: false, summary: '(root): prompt_leak' };
  return { ok: true, data: r.data };
}

export async function evaluateWithLlm<T extends z.ZodType>(o: EvaluateOptions<T>): Promise<EvaluateResult<z.output<T>>> {
  const format = jsonSchemaOf(o.schema);
  const call = async (messages: BuiltPrompt['messages']) =>
    o.llm.generate({
      model: o.model,
      messages,
      temperature: 0.2,
      numPredict: o.numPredict,
      format,
      keepAlive: o.keepAlive,
      timeoutMs: o.timeoutMs,
      schemaKind: o.schemaKind,
    });

  const first = await call(o.prompt.messages);
  const p1 = parseOutput(first.content, o.schema, o.prompt);
  if (p1.ok) return { ok: true, data: p1.data, raw: first.content, latencyMs: first.latencyMs, calls: 1 };

  const second = await call(repairMessages(o.prompt.messages, first.content, p1.summary));
  const latencyMs = first.latencyMs + second.latencyMs;
  const p2 = parseOutput(second.content, o.schema, o.prompt);
  if (p2.ok) return { ok: true, data: p2.data, raw: second.content, latencyMs, calls: 2 };
  return { ok: false, raw: second.content, latencyMs, calls: 2 };
}
