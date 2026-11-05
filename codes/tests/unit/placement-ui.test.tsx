/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/components/test-utils';
import { PlacementRunner } from '@/components/exam/placement-runner';
import { PlacementResultView } from '@/components/exam/placement-result-view';
import type { Attempt, AttemptResult } from '@/contracts/attempts';
import type { PlacementResultDTO } from '@/contracts/placement';
import { attemptsApi } from '@/lib/api/attempts';
import { placementApi } from '@/lib/api/placement';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/ujian',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/attempts', () => ({
  attemptsApi: {
    answer: vi.fn().mockResolvedValue({
      question_id: 'q-p-1',
      saved: true,
      answered_count: 1,
      is_correct: null,
      feedback: null,
    }),
    submit: vi.fn().mockResolvedValue({
      attempt_id: 'a0000000-0000-4000-8000-000000000001',
      status: 'SUBMITTED',
      passed: null,
      score_percent: 60,
      correct_count: 15,
      total_questions: 25,
      target_band: null,
      result_path: '/ujian/a0000000-0000-4000-8000-000000000001/hasil',
    }),
  },
}));

vi.mock('@/lib/api/placement', () => ({
  placementApi: {
    apply: vi.fn().mockResolvedValue({
      tier_number: 3,
      applied_at: new Date().toISOString(),
      skipped_tiers: [1, 2],
    }),
  },
}));

const mockAttempt: Attempt = {
  id: 'a0000000-0000-4000-8000-000000000001',
  assessment_set_id: 'b0000000-0000-4000-8000-000000000001',
  assessment_type: 'PLACEMENT_TEST',
  mode: 'EXAM',
  status: 'IN_PROGRESS',
  title: 'Tes Penempatan Adaptif (Placement Test)',
  started_at: new Date().toISOString(),
  server_now: new Date().toISOString(),
  deadline_at: new Date(Date.now() + 1500 * 1000).toISOString(),
  remaining_seconds: 1500,
  time_limit_seconds: 1500,
  pass_percent: null,
  question_count: 25,
  current_index: 0,
  answered_count: 0,
  passage_markdown: null,
  listening: null,
  resumed: false,
  questions: [
    {
      question_id: 'q-p-1',
      question_type: 'MCQ_SINGLE',
      skill: 'READING',
      prompt: 'Pertanyaan pembuka placement',
      points: 1,
      target_time_ms: null,
      options: [
        { option_id: 'opt-1', text: 'Pilihan Pertama' },
        { option_id: 'opt-2', text: 'Pilihan Kedua' },
      ],
      choose_count: null,
      fixed_choices: null,
      max_words: null,
      matching: null,
      segments: null,
      tokens: null,
      ai_task: null,
    },
  ],
  answers: [],
};

const mockPlacementResult: PlacementResultDTO = {
  recommended_tier: 3,
  ability: 3.5,
  correct_count: 15,
  served_count: 25,
  applied: false,
  tier_options: [
    { tier_number: 1, title: 'Tier 1 - Foundation', cefr_level: 'A2', target_band_min: 3.5, target_band_max: 4.5 },
    { tier_number: 2, title: 'Tier 2 - Developing', cefr_level: 'B1', target_band_min: 5.0, target_band_max: 5.5 },
    { tier_number: 3, title: 'Tier 3 - Competent', cefr_level: 'B2', target_band_min: 6.0, target_band_max: 6.5 },
  ],
};

const mockResult: AttemptResult = {
  attempt: {
    id: 'a0000000-0000-4000-8000-000000000001',
    assessment_set_id: 'b0000000-0000-4000-8000-000000000001',
    assessment_type: 'PLACEMENT_TEST',
    mode: 'EXAM',
    status: 'SUBMITTED',
    started_at: '2026-11-04T08:00:00.000Z',
    submitted_at: '2026-11-04T08:25:00.000Z',
    raw_score: 15,
    max_score: 25,
    score_percent: 60,
    band_score: null,
    passed: null,
    pass_percent: null,
    points_awarded: 0,
  },
  per_skill: [],
  progress: null,
  skip: null,
  boss: null,
  placement: mockPlacementResult,
  review: null,
};

describe('PlacementRunner Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merender judul tes penempatan, timer, nomor soal, dan pilihan jawaban', () => {
    renderWithProviders(<PlacementRunner attempt={mockAttempt} />);

    expect(screen.getByText('Placement Test')).toBeInTheDocument();
    expect(screen.getByText('Pertanyaan pembuka placement')).toBeInTheDocument();
    expect(screen.getByText('Pilihan Pertama')).toBeInTheDocument();
    expect(screen.getByText('Pilihan Kedua')).toBeInTheDocument();
  });

  it('tombol akhiri membuka dialog konfirmasi submit', async () => {
    renderWithProviders(<PlacementRunner attempt={mockAttempt} />);

    const endBtn = screen.getByRole('button', { name: /akhiri/i });
    fireEvent.click(endBtn);

    expect(screen.getByRole('heading', { name: /akhiri tes sekarang\?/i })).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /ya, akhiri/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(attemptsApi.submit).toHaveBeenCalledWith(mockAttempt.id);
    });
  });
});

describe('PlacementResultView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merender hasil rekomendasi tier, skor kemampuan, dan opsi tier yang tersedia', () => {
    renderWithProviders(<PlacementResultView result={mockResult} />);

    expect(screen.getByText('Rekomendasi: Mulai di Tier 3')).toBeInTheDocument();
    expect(screen.getByText('Tier 3: Tier 3 - Competent')).toBeInTheDocument();
    expect(screen.getByText('15 dari 25 soal dijawab dengan benar')).toBeInTheDocument();
    expect(screen.getByTestId('apply-recommended-btn')).toBeInTheDocument();
  });

  it('membuka dialog konfirmasi pemilihan tier dan memanggil apply API', async () => {
    renderWithProviders(<PlacementResultView result={mockResult} />);

    const submitBtn = screen.getByTestId('apply-recommended-btn');
    fireEvent.click(submitBtn);

    expect(screen.getByRole('heading', { name: /konfirmasi pilihan tier/i })).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('confirm-apply-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(placementApi.apply).toHaveBeenCalledWith(mockResult.attempt.id, 3);
      expect(replace).toHaveBeenCalledWith('/peta');
    });
  });
});
