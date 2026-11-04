import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  CreateSpeakingSubmissionFieldsSchema,
  CreateWritingSubmissionRequestSchema,
  EvaluationDTO,
  ListSubmissionsQuerySchema,
  RecordingPreferencesRequestSchema,
  SelfAssessmentRequestSchema,
  SubmissionDTO,
} from '@/contracts/ai';
import { zodDetails } from '@/server/http/zod-errors';
import { buildSpeakingPrompt, buildWritingPrompt } from '@/server/ai/prompts';
import { SPEAKING_RUBRIC_V1, WRITING_RUBRIC_V1 } from '@/server/ai/rubric-seed';

const codes = (r: { success: boolean; error?: import('zod').ZodError }) => (r.success ? [] : zodDetails(r.error!).map((d) => `${d.path}:${d.code}`));
const attempt = randomUUID();
const sub = randomUUID();
const essay = 'word '.repeat(30).trim();

describe('CreateWritingSubmissionRequestSchema', () => {
  it('Task 1/2 butuh attempt_id + question_id; sub_module_id dilarang', () => {
    expect(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'WRITING_TASK2', attempt_id: attempt, question_id: 'Q-1', response_text: essay }).success).toBe(true);
    expect(codes(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'WRITING_TASK2', response_text: essay }))).toEqual(['attempt_id:attempt_required', 'question_id:question_required']);
    expect(codes(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'WRITING_TASK1', attempt_id: attempt, question_id: 'Q', sub_module_id: sub, response_text: essay }))).toEqual(['sub_module_id:unexpected_field']);
  });

  it('Mini-Task butuh sub_module_id; attempt_id/question_id dilarang', () => {
    expect(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, response_text: 'a b c d e', duration_sec: 210 }).success).toBe(true);
    expect(codes(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', response_text: 'a b c d e' }))).toEqual(['sub_module_id:sub_module_required']);
    expect(codes(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, attempt_id: attempt, question_id: 'Q', response_text: 'x' }))).toEqual(['attempt_id:unexpected_field', 'question_id:unexpected_field']);
  });

  it('response_text: NFC + trim, maks 5000 (too_long), karakter kontrol selain \\n \\t ditolak, kunci tak dikenal', () => {
    const ok = CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, response_text: '  Café\n\tok  ' });
    expect(ok.success && ok.data.response_text).toBe('Café\n\tok');
    const long = CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, response_text: 'a'.repeat(5001) });
    expect(codes(long)).toEqual(['response_text:too_long']);
    expect(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, response_text: 'a'.repeat(5000) }).success).toBe(true);
    expect(codes(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, response_text: 'bad\u0000char' }))).toEqual(['response_text:control_char']);
    expect(codes(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, response_text: 'bad\rchar' }))).toEqual(['response_text:control_char']);
    expect(codes(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, response_text: 'ok text', score: 9 }))).toEqual(['score:unrecognized_key']);
    expect(CreateWritingSubmissionRequestSchema.safeParse({ kind: 'MINI_TASK_WRITING', sub_module_id: sub, response_text: 'ok text', duration_sec: 7201 }).success).toBe(false);
  });
});

describe('CreateSpeakingSubmissionFieldsSchema', () => {
  it('kombinasi per kind dan duration_sec koersif 0-180', () => {
    const ok = CreateSpeakingSubmissionFieldsSchema.safeParse({ kind: 'SPEAKING_PART2', attempt_id: attempt, question_id: 'Q-1', duration_sec: '40' });
    expect(ok.success && ok.data.duration_sec).toBe(40);
    expect(codes(CreateSpeakingSubmissionFieldsSchema.safeParse({ kind: 'MINI_TASK_SPEAKING' }))).toEqual(['sub_module_id:sub_module_required']);
    expect(codes(CreateSpeakingSubmissionFieldsSchema.safeParse({ kind: 'SPEAKING_PART1', sub_module_id: sub }))).toEqual(['attempt_id:attempt_required', 'question_id:question_required', 'sub_module_id:unexpected_field']);
    expect(codes(CreateSpeakingSubmissionFieldsSchema.safeParse({ kind: 'WRITING_TASK1' }))).toEqual(['kind:invalid_kind']);
    expect(CreateSpeakingSubmissionFieldsSchema.safeParse({ kind: 'MINI_TASK_SPEAKING', sub_module_id: sub, duration_sec: '181' }).success).toBe(false);
    expect(codes(CreateSpeakingSubmissionFieldsSchema.safeParse({ kind: 'MINI_TASK_SPEAKING', sub_module_id: sub, extra: '1' }))).toEqual(['extra:unrecognized_key']);
  });
});

describe('skema kecil', () => {
  it('SelfAssessment: nilai kelipatan 0.5 dalam 0-9', () => {
    expect(SelfAssessmentRequestSchema.safeParse({ criteria_scores: { a: 0, b: 4.5, c: 9, d: 6 } }).success).toBe(true);
    expect(SelfAssessmentRequestSchema.safeParse({ criteria_scores: { a: 6.3 } }).success).toBe(false);
    expect(SelfAssessmentRequestSchema.safeParse({ criteria_scores: { a: 9.5 } }).success).toBe(false);
    expect(SelfAssessmentRequestSchema.safeParse({ criteria_scores: { a: -0.5 } }).success).toBe(false);
    expect(SelfAssessmentRequestSchema.safeParse({}).success).toBe(false);
  });

  it('RecordingPreferences dan ListSubmissions', () => {
    expect(RecordingPreferencesRequestSchema.safeParse({ keep_recordings: false }).success).toBe(true);
    expect(RecordingPreferencesRequestSchema.safeParse({ keep_recordings: 'no' }).success).toBe(false);
    expect(ListSubmissionsQuerySchema.parse({})).toEqual({ page: 1, page_size: 20 });
    expect(ListSubmissionsQuerySchema.safeParse({ page_size: '51' }).success).toBe(false);
    expect(ListSubmissionsQuerySchema.safeParse({ kind: 'BOGUS' }).success).toBe(false);
  });

  it('DTO tidak menerima bidang rahasia (strictObject): raw_output / prompt_version / error_code ditolak', () => {
    const ev = {
      id: randomUUID(), run_number: 1, method: 'AI_LOCAL', overall_band: 6, criteria: [], strengths_id: [], improvements_id: [], corrections: [], band7_rewrite: null, task_requirement_met: true,
      flags: { injection_suspected: false, score_capped: false, cap_reason: null, high_band_capped: false, non_english_suspected: false, overall_recomputed: false, pronunciation_estimated: false, low_audio_quality: false },
      model_name: 'm', disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.', created_at: new Date().toISOString(),
    };
    expect(EvaluationDTO.safeParse(ev).success).toBe(true);
    expect(EvaluationDTO.safeParse({ ...ev, raw_output: 'x' }).success).toBe(false);
    expect(EvaluationDTO.safeParse({ ...ev, prompt_version: 'writing.v1' }).success).toBe(false);
    expect(EvaluationDTO.safeParse({ ...ev, disclaimer: 'lain' }).success).toBe(false);
    expect(SubmissionDTO.shape.recording).toBeDefined();
  });
});

describe('prompts', () => {
  it('Writing: prompt sistem memuat rubrik dan aturan; pesan pengguna memuat tepat satu pasang pembatas bernonce', () => {
    const p = buildWritingPrompt({ rubric: WRITING_RUBRIC_V1, taskPrompt: 'Soal', taskLabel: 'essay', miniTaskCriteria: 'Gunakan kalimat pasif', userText: 'Isi tulisan', nonce: 'cafe1234' });
    const [sys, user] = p.messages;
    expect(sys!.role).toBe('system');
    expect(sys!.content).toContain('task_response');
    expect(sys!.content).toContain('Gunakan kalimat pasif');
    expect(sys!.content).toContain('Indonesian');
    expect(sys!.content).not.toContain('student_response'); // pembatas tidak disebut literal di prompt sistem
    expect(user!.content).toContain('<student_response id="cafe1234">\nIsi tulisan\n</student_response>');
    expect(p.systemPrompt).toContain(p.canary);
  });

  it('Speaking: memuat kriteria Speaking, keyakinan STT, dan durasi', () => {
    const p = buildSpeakingPrompt({ rubric: SPEAKING_RUBRIC_V1, taskPrompt: 'Describe', taskLabel: 'part 2', miniTaskCriteria: null, transcript: 'hello there', sttConfidence: 0.42, durationSec: 33 });
    expect(p.messages[0]!.content).toContain('pronunciation');
    expect(p.messages[1]!.content).toContain('Recognizer confidence: 0.42');
    expect(p.messages[1]!.content).toContain('33 seconds');
  });
});
