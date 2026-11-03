/** Pembangun konten sintetis untuk tes (BUKAN Golden Sample; tidak pernah dimuat ke DB produksi). */
import type { ContentPackage } from '@/contracts/content';

type AnyQ = Record<string, unknown>;

let seq = 0;
export const qid = () => `Q-T${++seq}`;

const base = (type: string, extra: AnyQ = {}): AnyQ => ({
  question_id: qid(),
  question_type: type,
  skill: 'GRAMMAR',
  prompt: 'Pilih jawaban yang benar.',
  explanation_id: 'Pembahasan singkat.',
  ...extra,
});

export const Q = {
  mcq: (extra: AnyQ = {}) => base('MCQ_SINGLE', { options: ['is', 'are', 'am'], correct_answers: ['is'], ...extra }),
  multi: (extra: AnyQ = {}) => base('MCQ_MULTI', { options: ['a', 'b', 'c', 'd'], correct_answers: ['a', 'b'], ...extra }),
  tfng: (extra: AnyQ = {}) => base('TFNG', { correct_answers: ['True'], ...extra }),
  ynng: (extra: AnyQ = {}) => base('YNNG', { correct_answers: ['Yes'], ...extra }),
  fill: (extra: AnyQ = {}) => base('FILL_IN_BLANK', { correct_answers: ['was built'], max_words: 2, ...extra }),
  short: (extra: AnyQ = {}) => base('SHORT_ANSWER', { correct_answers: ['rainfall'], max_words: 3, ...extra }),
  drop: (extra: AnyQ = {}) =>
    base('MATCHING_DROPDOWN', { matching: { left: ['1', '2'], right: ['x', 'y', 'z'] }, correct_answers: [0, 2], points: 2, ...extra }),
  drag: (extra: AnyQ = {}) =>
    base('MATCHING_DRAG', { matching: { left: ['1', '2'], right: ['x', 'y', 'z'] }, correct_answers: [1, 0], points: 2, ...extra }),
  reorder: (extra: AnyQ = {}) => base('SENTENCE_REORDER', { segments: ['The book', 'was written', 'by her'], ...extra }),
  error: (extra: AnyQ = {}) => base('ERROR_RECOGNITION', { tokens: ['She', 'go', 'to', 'school'], correct_answers: [1], ...extra }),
  writing: (extra: AnyQ = {}) => base('WRITING_TASK', { skill: 'WRITING', task_kind: 'TASK2', explanation_id: undefined, ...extra }),
  speaking: (extra: AnyQ = {}) => base('SPEAKING_TASK', { skill: 'SPEAKING', part: 2, cue_points: ['who', 'when', 'why'], explanation_id: undefined, ...extra }),
};

export const subItem = (extra: AnyQ = {}): AnyQ => ({
  tier_number: 2,
  module_code: '2.1',
  sub_module_code: '2.1.3',
  sub_module_title: 'Passive Voice',
  origin: 'ORIGINAL_AUTHORED',
  materials: { article_markdown: '# Passive\n\nThe report **was written**.' },
  active_drill: { time_limit_seconds: 300, questions: [Q.mcq(), Q.fill()] },
  ...extra,
});

export const pkg = (extra: AnyQ = {}): ContentPackage =>
  ({ contract_version: '1.1', sub_modules: [subItem()], ...extra }) as unknown as ContentPackage;

/** Set Placement berisi n soal dengan difficulty merata 1-5. */
export const placementQuestions = (n: number, perLevel?: number[]) => {
  const out: AnyQ[] = [];
  for (let i = 0; i < n; i++) {
    const level = perLevel ? perLevel.findIndex((_, idx) => out.filter((q) => q.difficulty === idx + 1).length < perLevel[idx]!) + 1 : (i % 5) + 1;
    out.push(Q.mcq({ difficulty: level || 1 }));
  }
  return out;
};

export const bossPackage = (tier = 1): AnyQ => ({
  contract_version: '1.1',
  assessment_sets: [
    { set_type: 'TIER_BOSS_EXAM', title: `Boss Tier ${tier}`, tier_number: tier, origin: 'ORIGINAL_AUTHORED', questions: [] },
    {
      set_type: 'BOSS_SECTION', title: 'Listening', tier_number: tier, skill_category: 'LISTENING', time_limit_seconds: 600,
      listening_asset_code: 'own/listening-1', origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq({ skill: 'LISTENING', section_no: 1 })],
    },
    {
      set_type: 'BOSS_SECTION', title: 'Reading', tier_number: tier, skill_category: 'READING', time_limit_seconds: 900,
      reading_passage_markdown: 'A short passage.', origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq({ skill: 'READING', passage_no: 1 })],
    },
  ],
});
