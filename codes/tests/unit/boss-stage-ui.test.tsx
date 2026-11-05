/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/components/test-utils';
import { SectionGate } from '@/components/exam/section-gate';
import { BossResultView } from '@/components/exam/boss-result-view';
import type { SectionDTO, BossResultDTO } from '@/contracts/exams';
import type { AttemptResult } from '@/contracts/attempts';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/ujian',
  useSearchParams: () => new URLSearchParams(),
}));

const mockSection: SectionDTO = {
  assessment_set_id: 'sec-1111-1111',
  skill: 'LISTENING',
  order: 1,
  title: 'Listening Section',
  time_limit_seconds: 1800,
  question_count: 40,
  counts_toward_gate: true,
  requires_audio: true,
  requires_microphone: false,
  phase: 'PENDING',
  started_at: null,
  deadline_at: null,
  remaining_seconds: 1800,
};

const mockNextSection: SectionDTO = {
  assessment_set_id: 'sec-2222-2222',
  skill: 'READING',
  order: 2,
  title: 'Reading Section',
  time_limit_seconds: 3600,
  question_count: 40,
  counts_toward_gate: true,
  requires_audio: false,
  requires_microphone: false,
  phase: 'PENDING',
  started_at: null,
  deadline_at: null,
  remaining_seconds: 3600,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SectionGate Component', () => {
  it('merender mode INTRO dengan benar dan memicu onStart', () => {
    const onStart = vi.fn();
    renderWithProviders(
      <SectionGate
        mode="INTRO"
        section={mockSection}
        totalSections={4}
        onStart={onStart}
      />,
    );

    expect(screen.getByTestId('section-gate-intro')).toBeInTheDocument();
    expect(screen.getByText('Listening Section')).toBeInTheDocument();
    expect(screen.getByText('Section 1 / 4')).toBeInTheDocument();
    expect(screen.getByText('30 menit')).toBeInTheDocument();
    expect(screen.getByText('40 soal')).toBeInTheDocument();
    expect(screen.getByText('Menentukan kelulusan')).toBeInTheDocument();

    const startBtn = screen.getByTestId('start-section-btn');
    fireEvent.click(startBtn);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('merender mode DONE dengan info section berikutnya dan memicu onNext', () => {
    const onNext = vi.fn();
    renderWithProviders(
      <SectionGate
        mode="DONE"
        section={mockSection}
        totalSections={4}
        nextSection={mockNextSection}
        onNext={onNext}
      />,
    );

    expect(screen.getByTestId('section-gate-done')).toBeInTheDocument();
    expect(screen.getByText('Section Listening Section selesai')).toBeInTheDocument();
    expect(screen.getByText('Section berikutnya: Reading Section')).toBeInTheDocument();

    const nextBtn = screen.getByTestId('next-section-btn');
    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('BossResultView Component', () => {
  const dummyBoss: BossResultDTO = {
    passed: true,
    gate: { type: 'BAND', value: 6.0 },
    percent: 78,
    boss_band: 6.5,
    sections: [
      {
        skill: 'LISTENING',
        raw_score: 28,
        max_score: 40,
        raw_40: 28,
        band: 6.5,
        status: 'SUBMITTED',
        submission_ids: [],
        counts_toward_gate: true,
      },
      {
        skill: 'READING',
        raw_score: 27,
        max_score: 40,
        raw_40: 27,
        band: 6.5,
        status: 'SUBMITTED',
        submission_ids: [],
        counts_toward_gate: true,
      },
      {
        skill: 'WRITING',
        raw_score: null,
        max_score: null,
        raw_40: null,
        band: 6.0,
        status: 'GRADED',
        submission_ids: ['44444444-4444-4444-8444-444444444444'],
        counts_toward_gate: false,
      },
      {
        skill: 'SPEAKING',
        raw_score: null,
        max_score: null,
        raw_40: null,
        band: 6.5,
        status: 'GRADED',
        submission_ids: ['55555555-5555-4555-8555-555555555555'],
        counts_toward_gate: false,
      },
    ],
    overall_band_estimate: 6.5,
    pending_ai: 0,
    band_table_ids: {
      listening: '11111111-1111-4111-8111-111111111111',
      reading_academic: '22222222-2222-4222-8222-222222222222',
    },
    tier: { id: '33333333-3333-4333-8333-333333333333', tier_number: 3 },
    next_tier_unlocked: true,
    unlocked: [{ kind: 'TIER', id: '66666666-6666-4666-8666-666666666666', label: 'Tier 4: Expert' }],
    retry: { next_allowed_at: null, attempts_remaining_today: 2 },
    disclaimer: 'Advisory Note',
  };

  const dummyResult: AttemptResult = {
    attempt: {
      id: '77777777-7777-4777-8777-777777777777',
      assessment_set_id: '88888888-8888-4888-8888-888888888888',
      assessment_type: 'TIER_BOSS_EXAM',
      mode: 'EXAM',
      status: 'GRADED',
      started_at: '2026-11-04T08:00:00.000Z',
      submitted_at: '2026-11-04T10:00:00.000Z',
      raw_score: 55,
      max_score: 80,
      score_percent: 68.75,
      band_score: 6.5,
      passed: true,
      pass_percent: 60,
      points_awarded: 0,
    },
    per_skill: [],
    progress: null,
    skip: null,
    boss: dummyBoss,
    placement: null,
    review: null,
  };

  it('merender hasil Boss Stage lulus, perbandingan gerbang, dan CTA tier berikutnya', () => {
    renderWithProviders(<BossResultView result={dummyResult} />);

    expect(screen.getByTestId('boss-result-view')).toBeInTheDocument();
    expect(screen.getByText('Lulus')).toBeInTheDocument();
    expect(screen.getByText('Terbuka: Tier 4: Expert')).toBeInTheDocument();
    expect(screen.getByText('Perkiraan Overall Band')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buka Tier 4/i })).toBeInTheDocument();
  });

  it('merender hasil Boss Stage belum lulus ketika passed = false', () => {
    const failedResult: AttemptResult = {
      ...dummyResult,
      boss: {
        ...dummyBoss,
        passed: false,
        next_tier_unlocked: false,
        unlocked: [],
      },
    };

    renderWithProviders(<BossResultView result={failedResult} />);
    expect(screen.getByText('Belum lulus')).toBeInTheDocument();
    expect(screen.getByText('Buka Peta Belajar')).toBeInTheDocument();
  });
});
