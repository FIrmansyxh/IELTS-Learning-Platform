import type { Stats } from '@/lib/api/gamification-contract';
import type { BandPrediction, ExamHistoryItem, Radar, SkillScore } from '@/lib/api/skills-contract';

/** Fixture bersama untuk uji komponen SPEC-016/017 (mengikuti contoh `_api-contract.md`). */
export const STATS: Stats = {
  total_points: 365,
  daily_streak_days: 5,
  longest_daily_streak: 7,
  best_speed_streak: 6,
  gold_crowns: 2,
  silver_crowns: 4,
  last_active_date: '2026-11-03',
  streak_at_risk: false,
};

export const STATS_NEW_USER: Stats = {
  total_points: 0,
  daily_streak_days: 0,
  longest_daily_streak: 0,
  best_speed_streak: 0,
  gold_crowns: 0,
  silver_crowns: 0,
  last_active_date: null,
  streak_at_risk: false,
};

const T = '2026-11-03T10:34:12.000Z';
export const skill = (name: SkillScore['skill'], over: Partial<SkillScore> = {}): SkillScore => ({
  skill: name,
  score_percent: null,
  estimated_band: null,
  sample_size: 0,
  is_proxy: name === 'GRAMMAR' || name === 'VOCAB',
  updated_at: null,
  ...over,
});

export const RADAR_PARTIAL: Radar = {
  skills: [
    skill('LISTENING', { score_percent: 80, estimated_band: 7.5, sample_size: 50, updated_at: T }),
    skill('READING', { score_percent: 75, estimated_band: null, sample_size: 4, updated_at: T }),
    skill('WRITING', { score_percent: 66.67, estimated_band: 6.0, sample_size: 3, updated_at: T }),
    skill('SPEAKING'),
    skill('GRAMMAR', { score_percent: 60, estimated_band: 6.0, sample_size: 20, updated_at: T }),
    skill('VOCAB'),
  ],
  target_band: 6.5,
  prediction: {
    overall_band: null,
    indicative_band: 7.0,
    range_low: 6.5,
    range_high: 7.5,
    complete: false,
    components: { LISTENING: 7.5, READING: null, WRITING: 6.0, SPEAKING: null },
    basis_note: 'Indikatif: berdasarkan Listening dan Writing. Selesaikan Writing dan Speaking untuk prediksi lengkap.',
  },
  disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
};

export const RADAR_EMPTY: Radar = {
  skills: ['LISTENING', 'READING', 'WRITING', 'SPEAKING', 'GRAMMAR', 'VOCAB'].map((s) => skill(s as SkillScore['skill'])),
  target_band: null,
  prediction: {
    overall_band: null,
    indicative_band: null,
    range_low: null,
    range_high: null,
    complete: false,
    components: { LISTENING: null, READING: null, WRITING: null, SPEAKING: null },
    basis_note: 'Indikatif: berdasarkan -. Selesaikan Writing dan Speaking untuk prediksi lengkap.',
  },
  disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
};

export const RADAR_COMPLETE: Radar = {
  ...RADAR_PARTIAL,
  skills: [
    skill('LISTENING', { score_percent: 80, estimated_band: 7.0, sample_size: 50, updated_at: T }),
    skill('READING', { score_percent: 70, estimated_band: 6.0, sample_size: 50, updated_at: T }),
    skill('WRITING', { score_percent: 66.67, estimated_band: 6.0, sample_size: 3, updated_at: T }),
    skill('SPEAKING', { score_percent: 72.22, estimated_band: 6.5, sample_size: 2, updated_at: T }),
    skill('GRAMMAR', { score_percent: 60, estimated_band: 6.0, sample_size: 20, updated_at: T }),
    skill('VOCAB', { score_percent: 55, estimated_band: 5.5, sample_size: 20, updated_at: T }),
  ],
  prediction: {
    overall_band: 6.5,
    indicative_band: 6.5,
    range_low: 6.0,
    range_high: 7.0,
    complete: true,
    components: { LISTENING: 7.0, READING: 6.0, WRITING: 6.0, SPEAKING: 6.5 },
    basis_note: 'Berdasarkan Listening, Reading, Writing, dan Speaking.',
  },
};

export const PREDICTIONS: BandPrediction[] = [
  {
    id: '11aa22bb-0001-4000-8000-000000000001',
    overall_band: 5.0,
    components: { LISTENING: 5.5, READING: 4.5, WRITING: null, SPEAKING: null },
    trigger: 'BOSS',
    attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
    created_at: '2026-11-01T12:00:00.000Z',
  },
  {
    id: '11aa22bb-0001-4000-8000-000000000002',
    overall_band: 5.5,
    components: { LISTENING: 5.5, READING: 4.5, WRITING: 6.0, SPEAKING: null },
    trigger: 'RECALC',
    attempt_id: null,
    created_at: '2026-11-02T09:00:00.000Z',
  },
  {
    id: '11aa22bb-0001-4000-8000-000000000003',
    overall_band: 6.5,
    components: { LISTENING: 7.0, READING: 6.0, WRITING: 6.0, SPEAKING: 6.5 },
    trigger: 'BOSS',
    attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5b',
    created_at: '2026-11-03T09:00:00.000Z',
  },
];

export const EXAM_HISTORY: ExamHistoryItem[] = [
  {
    attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
    assessment_type: 'TIER_BOSS_EXAM',
    title: 'Boss Stage Tier 2',
    status: 'GRADED',
    score_percent: 57.5,
    band_score: 6.0,
    passed: true,
    submitted_at: '2026-11-01T12:00:00.000Z',
    result_path: '/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/hasil',
  },
  {
    attempt_id: 'd0cc0001-0001-4000-8000-0000000000aa',
    assessment_type: 'PLACEMENT_TEST',
    title: 'Placement Test',
    status: 'GRADED',
    score_percent: 62,
    band_score: null,
    passed: null,
    submitted_at: '2026-10-30T08:00:00.000Z',
    result_path: '/ujian/d0cc0001-0001-4000-8000-0000000000aa/hasil',
  },
];
