import { makeAttempt, Q } from '@/components/quiz/fixtures';
import type { Attempt, QuestionPublic } from '@/contracts/attempts';
import type { BossIntro, BossResult, BossResultSection, Section, StartSectionData } from '@/lib/api/boss-contract';

/** Fixture uji Boss Stage (bukan data produksi). Bentuk persis kontrak SPEC-014. */
export const ATTEMPT_ID = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
export const PARENT_SET = 'b0551000-0000-4000-8000-000000000000';
export const SEC_ID = {
  LISTENING: 'b0551001-0001-4000-8000-000000000001',
  READING: 'b0551001-0002-4000-8000-000000000002',
  WRITING: 'b0551001-0003-4000-8000-000000000003',
  SPEAKING: 'b0551001-0004-4000-8000-000000000004',
} as const;
export const SUB_ID = 'd4c3b2a1-1111-4000-8000-0000000000f1';
export const TABLE_L = 'aa11bb22-0001-4000-8000-000000000001';
export const TABLE_R = 'aa11bb22-0002-4000-8000-000000000002';

const ORDER = { LISTENING: 1, READING: 2, WRITING: 3, SPEAKING: 4 } as const;
const TITLE = { LISTENING: 'Listening Tier 1', READING: 'Reading Tier 1', WRITING: 'Writing Tier 1', SPEAKING: 'Speaking Tier 1' } as const;

export function makeSection(skill: Section['skill'], over: Partial<Section> = {}): Section {
  return {
    assessment_set_id: SEC_ID[skill],
    skill,
    order: ORDER[skill],
    title: TITLE[skill],
    time_limit_seconds: skill === 'LISTENING' ? 900 : 1200,
    question_count: 4,
    counts_toward_gate: skill === 'LISTENING' || skill === 'READING',
    requires_audio: skill === 'LISTENING',
    requires_microphone: skill === 'SPEAKING',
    phase: 'PENDING',
    started_at: null,
    deadline_at: null,
    remaining_seconds: null,
    ...over,
  };
}

export function activeSection(skill: Section['skill'], over: Partial<Section> = {}): Section {
  const now = Date.now();
  return makeSection(skill, {
    phase: 'ACTIVE',
    started_at: new Date(now).toISOString(),
    deadline_at: new Date(now + 600_000).toISOString(),
    remaining_seconds: 600,
    ...over,
  });
}

/** Section yang sudah selesai. */
export function doneSection(section: Section): Section {
  return { ...section, phase: 'DONE' };
}

export function makeBossAttempt(sections: Section[], over: Partial<Attempt> = {}): Attempt {
  const now = Date.now();
  return makeAttempt([], {
    id: ATTEMPT_ID,
    assessment_set_id: PARENT_SET,
    assessment_type: 'TIER_BOSS_EXAM',
    mode: 'EXAM',
    title: 'Boss Stage Tier 1',
    started_at: new Date(now).toISOString(),
    server_now: new Date(now).toISOString(),
    deadline_at: new Date(now + 6_000_000).toISOString(),
    sections,
    ...over,
  });
}

export const listeningQuestion: QuestionPublic = { ...Q.fill, question_id: 'Q-T1-L-01', skill: 'LISTENING', section_no: 1, prompt: 'Name: ______' };
export const readingQuestion: QuestionPublic = { ...Q.tfng, question_id: 'Q-T1-R-01', skill: 'READING', passage_no: 1, prompt: 'Penulis mendukung rencana.' };

export function startPayload(section: Section, over: Partial<StartSectionData> = {}): StartSectionData {
  const base: StartSectionData = {
    section,
    passage_markdown: null,
    listening: null,
    questions: [],
    answers: [],
    server_now: new Date().toISOString(),
  };
  if (section.skill === 'LISTENING') {
    base.listening = {
      audio_url: `/api/v1/attempts/${ATTEMPT_ID}/audio?section=${section.assessment_set_id}`,
      mime_type: 'audio/mpeg',
      duration_sec: 612,
    };
    base.questions = [listeningQuestion];
  } else if (section.skill === 'READING') {
    base.passage_markdown = '# Cave Dwellers\n\n[A] The cave was dark and deep.';
    base.questions = [readingQuestion];
  } else if (section.skill === 'WRITING') {
    base.questions = [{ ...Q.writing, question_id: 'Q-T1-W-01' }];
  } else {
    base.questions = [{ ...Q.speaking, question_id: 'Q-T1-S-01' }];
  }
  return { ...base, ...over };
}

export const bossIntro: BossIntro = {
  tier_number: 1,
  gate: { type: 'PERCENT', value: 80 },
  sections: [makeSection('LISTENING'), makeSection('READING'), makeSection('WRITING'), makeSection('SPEAKING')],
  total_time_limit_seconds: 4500,
  last_result: { passed: false, score_percent: 75, boss_band: 5.5, at: '2026-11-02T09:00:00.000Z' },
  advisory_note: 'Kelulusan ditentukan oleh Listening dan Reading. Writing dan Speaking dinilai sebagai masukan.',
};

function resultSection(skill: BossResultSection['skill'], over: Partial<BossResultSection> = {}): BossResultSection {
  const objective = skill === 'LISTENING' || skill === 'READING';
  return {
    skill,
    raw_score: objective ? 16 : null,
    max_score: objective ? 20 : null,
    raw_40: objective ? 32 : null,
    band: objective ? 7.5 : null,
    status: 'SUBMITTED',
    submission_ids: objective ? [] : [SUB_ID],
    counts_toward_gate: objective,
    ...over,
  };
}

export function makeBossResult(over: Partial<BossResult> = {}): BossResult {
  return {
    passed: true,
    gate: { type: 'BAND', value: 5 },
    percent: 57.5,
    boss_band: 6.0,
    sections: [
      resultSection('LISTENING'),
      resultSection('READING', { raw_score: 7, raw_40: 14, band: 4.5 }),
      resultSection('WRITING'),
      resultSection('SPEAKING', { status: 'EXPIRED', submission_ids: [] }),
    ],
    overall_band_estimate: null,
    pending_ai: 1,
    band_table_ids: { listening: TABLE_L, reading_academic: TABLE_R },
    tier: { id: '7a1b2c3d-0002-4000-8000-000000000002', tier_number: 2 },
    next_tier_unlocked: true,
    unlocked: [{ kind: 'TIER', id: '7a1b2c3d-0003-4000-8000-000000000003', label: 'Tier 3 Operational IELTS' }],
    retry: { next_allowed_at: null, attempts_remaining_today: 2 },
    disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
    ...over,
  };
}

export const activeBandTables = {
  listening: {
    table_id: TABLE_L,
    version_label: 'Cambridge 2026',
    source_note: null,
    rows: [
      { raw_min: 0, raw_max: 15, band: 4.5 },
      { raw_min: 16, raw_max: 40, band: 7.5 },
    ],
  },
  reading_academic: {
    table_id: TABLE_R,
    version_label: 'Cambridge 2026',
    source_note: null,
    rows: [
      { raw_min: 0, raw_max: 13, band: 4.0 },
      { raw_min: 14, raw_max: 40, band: 4.5 },
    ],
  },
  disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
};
