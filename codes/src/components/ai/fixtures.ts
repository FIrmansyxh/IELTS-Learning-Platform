import type { Evaluation, Job, Recording, Submission } from '@/lib/api/ai-contract';

/** Fixture uji (bukan data produksi). Bentuk persis kontrak SPEC-012/013. */
export const SUB_ID = 'd4c3b2a1-1111-4000-8000-0000000000f1';
export const SUBMODULE_ID = '7a1b2c3d-0213-4000-8000-000000000213';
export const NOW = '2026-11-03T10:40:00.000Z';

export const FLAGS: Evaluation['flags'] = {
  injection_suspected: false,
  score_capped: false,
  cap_reason: null,
  high_band_capped: false,
  non_english_suspected: false,
  overall_recomputed: false,
  pronunciation_estimated: false,
  low_audio_quality: false,
};

export const TEXT =
  'First, the limestone is harvested by workers. Subsequently, it is crushed into powder by a crusher. Finally, the powder is heated in a rotating kiln.';

export function makeEvaluation(over: Partial<Evaluation> = {}): Evaluation {
  return {
    id: 'f6e5d4c3-3333-4000-8000-0000000000f3',
    run_number: 1,
    method: 'AI_LOCAL',
    overall_band: 6.0,
    criteria: [
      { key: 'task_response', name: 'Task Response', band: 6.0, comment_id: 'Ketiga tahapan sudah dijelaskan dengan benar.' },
      { key: 'coherence', name: 'Coherence & Cohesion', band: 6.5, comment_id: 'Penghubung First, Subsequently, Finally dipakai tepat.' },
      { key: 'lexical', name: 'Lexical Resource', band: 5.5, comment_id: 'Variasi kosakata masih terbatas.' },
      { key: 'grammar', name: 'Grammatical Range & Accuracy', band: 6.0, comment_id: 'Struktur pasif akurat pada ketiga kalimat.' },
    ],
    strengths_id: ['Struktur pasif Present Simple tepat.'],
    improvements_id: ['Tambahkan keterangan tempat atau alat untuk variasi.'],
    corrections: [
      {
        original: 'it is crushed into powder by a crusher',
        improved: 'it is ground into fine powder in a crusher',
        reason_id: "Kata 'ground' dan 'fine' lebih presisi.",
      },
    ],
    band7_rewrite: 'First, limestone is harvested by workers...',
    task_requirement_met: true,
    flags: { ...FLAGS },
    model_name: 'qwen2.5:3b-instruct',
    disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
    created_at: '2026-11-03T10:40:41.000Z',
    ...over,
  };
}

export function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: 'e5d4c3b2-2222-4000-8000-0000000000f2',
    kind: 'GRADE_WRITING',
    status: 'QUEUED',
    stage: null,
    progress_percent: 0,
    queue_position: 1,
    error_code: null,
    attempt: 0,
    ...over,
  };
}

export function makeRecording(over: Partial<Recording> = {}): Recording {
  return {
    id: 'c3d4e5f6-7777-4000-8000-0000000000c3',
    mime_type: 'audio/webm',
    size_bytes: 1048576,
    duration_ms: 42000,
    transcript: TEXT,
    stt_confidence: 0.9,
    available: true,
    retention_expires_at: '2027-02-01T10:00:00.000Z',
    purged_at: null,
    ...over,
  };
}

export function makeSubmission(over: Partial<Submission> = {}): Submission {
  return {
    id: SUB_ID,
    kind: 'MINI_TASK_WRITING',
    status: 'RECEIVED',
    attempt_id: null,
    sub_module_id: SUBMODULE_ID,
    question_id: null,
    prompt_snapshot: 'Ubah 3 tahapan aktif berikut menjadi 1 paragraf pasif.',
    response_text: TEXT,
    word_count: 24,
    duration_sec: null,
    created_at: NOW,
    updated_at: NOW,
    job: makeJob(),
    evaluation: null,
    recording: null,
    ...over,
  };
}

export const graded = (over: Partial<Submission> = {}) =>
  makeSubmission({
    status: 'GRADED',
    job: makeJob({ status: 'SUCCEEDED', stage: 'SAVING', progress_percent: 100, queue_position: null }),
    evaluation: makeEvaluation(),
    ...over,
  });

export const QUOTA = { limit: 10, used: 1, remaining: 9, resets_at: '2026-11-04T10:40:00.000Z' };

export const AI_STATUS = {
  enabled: true,
  available: true,
  queue: { waiting: 2, estimated_wait_sec: 90 },
  quota: { limit: 10, used: 3, remaining: 7, resets_at: '2026-11-04T08:00:00.000Z' },
  recording_retention_days: 90,
};
