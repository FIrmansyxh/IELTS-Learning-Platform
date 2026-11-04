import { describe, expect, it } from 'vitest';
import { BossResultSchema, StartSectionResponseSchema, SubmitSectionResponseSchema, BossIntroSchema } from './boss-contract';
import { ApplyPlacementResponseSchema, PlacementResultSchema, PlacementStatusResponseSchema } from './placement-contract';

/** Contoh persis dari specifications/014_spec_boss_stage.md dan 015_spec_placement_test.md. */
const sectionL = {
  assessment_set_id: 'b0551001-0001-4000-8000-000000000001',
  skill: 'LISTENING',
  order: 1,
  title: 'Listening Tier 1',
  time_limit_seconds: 900,
  question_count: 10,
  counts_toward_gate: true,
  requires_audio: true,
  requires_microphone: false,
  phase: 'PENDING',
  started_at: null,
  deadline_at: null,
  remaining_seconds: null,
};

describe('kontrak Boss Stage (klien)', () => {
  it('intro.boss contoh spec lolos', () => {
    const r = BossIntroSchema.safeParse({
      tier_number: 1,
      gate: { type: 'PERCENT', value: 80 },
      sections: [sectionL],
      total_time_limit_seconds: 4500,
      last_result: { passed: false, score_percent: 75.0, boss_band: 5.5, at: '2026-11-02T09:00:00.000Z' },
      advisory_note: 'Kelulusan ditentukan oleh Listening dan Reading. Writing dan Speaking dinilai sebagai masukan.',
    });
    expect(r.success).toBe(true);
  });

  it('respons start section contoh spec lolos; tanpa server_now ditolak (drift tidak ditambal)', () => {
    const body = {
      data: {
        section: { ...sectionL, phase: 'ACTIVE', started_at: '2026-11-03T12:00:00.000Z', deadline_at: '2026-11-03T12:15:00.000Z', remaining_seconds: 900 },
        passage_markdown: null,
        listening: { audio_url: '/api/v1/attempts/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/audio?section=b0551001-0001-4000-8000-000000000001', mime_type: 'audio/mpeg', duration_sec: 612 },
        questions: [
          { question_id: 'Q-T1-L-01', question_type: 'FILL_IN_BLANK', skill: 'LISTENING', prompt: 'Name: ______', points: 1, target_time_ms: null, passage_no: null, section_no: 1, options: null, choose_count: null, fixed_choices: null, max_words: 2, matching: null, segments: null, tokens: null, ai_task: null },
        ],
        answers: [],
        server_now: '2026-11-03T12:00:00.000Z',
      },
    };
    expect(StartSectionResponseSchema.safeParse(body).success).toBe(true);
    const { server_now: _omit, ...rest } = body.data;
    void _omit;
    expect(StartSectionResponseSchema.safeParse({ data: rest }).success).toBe(false);
  });

  it('respons submit section: next_section boleh null', () => {
    expect(SubmitSectionResponseSchema.safeParse({ data: { section: { ...sectionL, phase: 'DONE' }, next_section: null } }).success).toBe(true);
  });

  it('hasil boss contoh spec lolos', () => {
    const r = BossResultSchema.safeParse({
      passed: true,
      gate: { type: 'BAND', value: 5.0 },
      percent: 57.5,
      boss_band: 6.0,
      sections: [
        { skill: 'LISTENING', raw_score: 16, max_score: 20, raw_40: 32, band: 7.5, status: 'SUBMITTED', submission_ids: [], counts_toward_gate: true },
        { skill: 'WRITING', raw_score: null, max_score: null, raw_40: null, band: null, status: 'SUBMITTED', submission_ids: ['d4c3b2a1-1111-4000-8000-0000000000f1'], counts_toward_gate: false },
        { skill: 'SPEAKING', raw_score: null, max_score: null, raw_40: null, band: null, status: 'EXPIRED', submission_ids: [], counts_toward_gate: false },
      ],
      overall_band_estimate: null,
      pending_ai: 1,
      band_table_ids: { listening: 'aa11bb22-0001-4000-8000-000000000001', reading_academic: 'aa11bb22-0002-4000-8000-000000000002' },
      tier: { id: '7a1b2c3d-0002-4000-8000-000000000002', tier_number: 2 },
      next_tier_unlocked: true,
      unlocked: [{ kind: 'TIER', id: '7a1b2c3d-0003-4000-8000-000000000003', label: 'Tier 3 Operational IELTS' }],
      retry: { next_allowed_at: null, attempts_remaining_today: 2 },
      disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
    });
    expect(r.success).toBe(true);
  });
});

describe('kontrak Placement (klien)', () => {
  it('GET /placement contoh spec lolos', () => {
    expect(
      PlacementStatusResponseSchema.safeParse({
        data: { available: true, blocked_reason: null, assessment_set_id: 'd0cc0001-0001-4000-8000-000000000001', question_count: 25, time_limit_seconds: 1500, completed_at: null, active_attempt_id: null, pending_result: null },
      }).success,
    ).toBe(true);
  });

  it('blocked_reason di luar kontrak ditolak', () => {
    expect(
      PlacementStatusResponseSchema.safeParse({
        data: { available: false, blocked_reason: 'LAINNYA', assessment_set_id: null, question_count: null, time_limit_seconds: null, completed_at: null, active_attempt_id: null, pending_result: null },
      }).success,
    ).toBe(false);
  });

  it('hasil placement dan respons apply contoh spec lolos', () => {
    expect(
      PlacementResultSchema.safeParse({
        recommended_tier: 3,
        ability: 3.5,
        correct_count: 13,
        served_count: 25,
        applied: false,
        tier_options: [{ tier_number: 1, title: 'Foundation', cefr_level: 'A1-A2', target_band_min: 3.0, target_band_max: 4.0 }],
      }).success,
    ).toBe(true);
    expect(
      ApplyPlacementResponseSchema.safeParse({
        data: {
          applied: true,
          tier_number: 3,
          skipped_tiers: [1, 2],
          unlocked: [{ kind: 'TIER', id: '7a1b2c3d-0003-4000-8000-000000000003', label: 'Tier 3 Operational IELTS' }],
        },
      }).success,
    ).toBe(true);
  });
});
