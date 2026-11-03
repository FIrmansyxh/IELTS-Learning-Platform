import type { Attempt, AttemptResult, QuestionPublic } from '@/contracts/attempts';

/** Fixture uji untuk 12 tipe soal (bentuk DTO publik SPEC-006, tanpa kunci jawaban). */
const base = {
  skill: 'GRAMMAR' as const,
  points: 1,
  target_time_ms: null,
  passage_no: null,
  section_no: null,
  options: null,
  choose_count: null,
  fixed_choices: null,
  max_words: null,
  matching: null,
  segments: null,
  tokens: null,
  ai_task: null,
};

export const Q = {
  mcq: {
    ...base,
    question_id: 'Q-01',
    question_type: 'MCQ_SINGLE',
    prompt: 'Manakah kalimat yang paling tepat?',
    options: [
      { option_id: 'ok7f2q', text: 'The beans are ground in a grinder.' },
      { option_id: 'o3x9aw', text: 'People grind the beans.' },
      { option_id: 'oh2m5d', text: 'Someone has grinded the beans.' },
      { option_id: 'o8c1zp', text: 'The beans is grinded.' },
    ],
  },
  multi: {
    ...base,
    question_id: 'Q-02',
    question_type: 'MCQ_MULTI',
    prompt: 'Pilih bentuk pasif yang benar.',
    choose_count: 2,
    options: [
      { option_id: 'oa1', text: 'is made' },
      { option_id: 'ob2', text: 'make' },
      { option_id: 'oc3', text: 'are sold' },
      { option_id: 'od4', text: 'sell' },
    ],
  },
  tfng: {
    ...base,
    question_id: 'Q-03',
    question_type: 'TFNG',
    prompt: 'The writer supports the plan.',
    fixed_choices: ['True', 'False', 'Not Given'],
  },
  ynng: {
    ...base,
    question_id: 'Q-04',
    question_type: 'YNNG',
    prompt: 'The author agrees with the claim.',
    fixed_choices: ['Yes', 'No', 'Not Given'],
  },
  fill: {
    ...base,
    question_id: 'Q-05',
    question_type: 'FILL_IN_BLANK',
    prompt: "Lengkapi: 'Bottles _______ (sort) by color.'",
    max_words: 2,
  },
  short: {
    ...base,
    question_id: 'Q-06',
    question_type: 'SHORT_ANSWER',
    prompt: 'What is collected first?',
    max_words: 3,
  },
  matchSelect: {
    ...base,
    question_id: 'Q-07',
    question_type: 'MATCHING_DROPDOWN',
    prompt: 'Pasangkan kata dengan artinya.',
    matching: {
      left: [
        { item_id: 'i0', text: 'rapid' },
        { item_id: 'i1', text: 'scarce' },
      ],
      right: [
        { choice_id: 'cA', text: 'langka' },
        { choice_id: 'cB', text: 'cepat' },
        { choice_id: 'cC', text: 'besar' },
      ],
      allow_reuse: false,
    },
  },
  matchDrag: {
    ...base,
    question_id: 'Q-08',
    question_type: 'MATCHING_DRAG',
    prompt: 'Seret pasangan.',
    matching: {
      left: [{ item_id: 'i0', text: 'rapid' }],
      right: [{ choice_id: 'cB', text: 'cepat' }],
      allow_reuse: false,
    },
  },
  reorder: {
    ...base,
    question_id: 'Q-09',
    question_type: 'SENTENCE_REORDER',
    prompt: 'Susun kalimat.',
    segments: [
      { segment_id: 's2', text: 'are sorted' },
      { segment_id: 's1', text: 'The bottles' },
      { segment_id: 's3', text: 'by color.' },
    ],
  },
  error: {
    ...base,
    question_id: 'Q-10',
    question_type: 'ERROR_RECOGNITION',
    prompt: 'Temukan kesalahan.',
    tokens: [
      { index: 0, text: 'He' },
      { index: 1, text: 'go' },
      { index: 2, text: 'to' },
      { index: 3, text: 'school.' },
    ],
  },
  writing: {
    ...base,
    question_id: 'Q-11',
    question_type: 'WRITING_TASK',
    skill: 'WRITING' as const,
    prompt: 'Tulis ringkasan grafik.',
    ai_task: { kind: 'WRITING', task_kind: 'TASK1', min_words: 150 },
  },
  speaking: {
    ...base,
    question_id: 'Q-12',
    question_type: 'SPEAKING_TASK',
    skill: 'SPEAKING' as const,
    prompt: 'Ceritakan rumah Anda.',
    ai_task: { kind: 'SPEAKING', part: 1 },
  },
} satisfies Record<string, QuestionPublic>;

export function makeAttempt(questions: QuestionPublic[], over: Partial<Attempt> = {}): Attempt {
  return {
    id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
    assessment_set_id: 'e5f6a7b8-0001-4000-8000-0000000000d1',
    assessment_type: 'ACTIVE_DRILL',
    mode: 'PRACTICE',
    status: 'IN_PROGRESS',
    title: 'Latihan 2.1.3',
    started_at: new Date().toISOString(),
    server_now: new Date().toISOString(),
    deadline_at: null,
    remaining_seconds: null,
    time_limit_seconds: 300,
    pass_percent: 75,
    question_count: questions.length,
    answered_count: 0,
    current_index: 0,
    passage_markdown: null,
    listening: null,
    questions,
    answers: [],
    resumed: false,
    sections: null,
    ...over,
  };
}

export function makeResult(over: { passed?: boolean; score?: number; next?: string | null } = {}): AttemptResult {
  const passed = over.passed ?? true;
  const score = over.score ?? (passed ? 80 : 60);
  return {
    attempt: {
      id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
      assessment_set_id: 'e5f6a7b8-0001-4000-8000-0000000000d1',
      assessment_type: 'ACTIVE_DRILL',
      mode: 'PRACTICE',
      status: 'GRADED',
      started_at: '2026-11-03T10:30:00.000Z',
      submitted_at: '2026-11-03T10:34:12.000Z',
      raw_score: score / 10,
      max_score: 10,
      score_percent: score,
      pass_percent: 75,
      passed,
      points_awarded: 0,
      band_score: null,
    },
    per_skill: [{ skill: 'GRAMMAR', raw_score: score / 10, max_score: 10, score_percent: score }],
    review: [
      {
        question_id: 'Q-01',
        is_correct: true,
        score: 1,
        max_score: 1,
        response: { option_ids: ['ok7f2q'] },
        correct_answer: { display: ['The beans are ground in a grinder.'] },
        explanation_id: "Bentuk V3 dari 'grind' adalah 'ground'.",
      },
      { question_id: 'Q-05', is_correct: false, score: 0, max_score: 1, correct_answer: { display: ['are sorted'] }, explanation_id: 'Subjek jamak.' },
    ],
    progress: {
      sub_module_id: '7a1b2c3d-0213-4000-8000-000000000213',
      status: passed ? 'COMPLETED' : 'IN_PROGRESS',
      mastery_crown: passed ? 'SILVER' : 'NONE',
      best_score_percent: score,
      next_sub_module_code: over.next === undefined ? '2.1.4' : over.next,
      unlocked: passed ? [{ kind: 'SUB_MODULE', id: '7a1b2c3d-0214-4000-8000-000000000214', label: '2.1.4 Conditional Sentences' }] : [],
    },
    skip: null,
    boss: null,
    placement: null,
    gamification: null,
  };
}
