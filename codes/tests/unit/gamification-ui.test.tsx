/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/components/test-utils';
import { CrownBadge } from '@/components/gamification/crown-badge';
import { StatsCard } from '@/components/gamification/stats-card';
import { HeaderChips } from '@/components/gamification/header-chips';
import { DrillResult } from '@/components/quiz/drill-result';
import type { StatsDTO } from '@/contracts/gamification';
import type { AttemptResult } from '@/contracts/attempts';

let mockPathname = '/dashboard';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockStats: StatsDTO = {
  total_points: 365,
  daily_streak_days: 5,
  longest_daily_streak: 7,
  best_speed_streak: 6,
  gold_crowns: 2,
  silver_crowns: 4,
  last_active_date: '2026-11-04',
  streak_at_risk: false,
};

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationStats: () => ({
    data: mockStats,
    isLoading: false,
    isError: false,
  }),
}));

describe('CrownBadge Component (SPEC-016)', () => {
  it('merender mahkota emas dengan nama aksesibel dan label teks', () => {
    renderWithProviders(<CrownBadge crown="GOLD" size={24} scorePercent={95} showLabel={true} />);

    const badge = screen.getByTestId('crown-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-crown', 'GOLD');
    expect(screen.getByText('Emas')).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('Mahkota Emas'));
  });

  it('merender mahkota perak dengan nama aksesibel dan label teks', () => {
    renderWithProviders(<CrownBadge crown="SILVER" size={24} scorePercent={80} showLabel={true} />);

    const badge = screen.getByTestId('crown-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-crown', 'SILVER');
    expect(screen.getByText('Perak')).toBeInTheDocument();
  });

  it('tidak merender apapun untuk NONE jika renderEmpty=false', () => {
    const { container } = renderWithProviders(<CrownBadge crown="NONE" />);
    expect(container.firstChild).toBeNull();
  });

  it('merender outline kosong untuk NONE jika renderEmpty=true', () => {
    renderWithProviders(<CrownBadge crown="NONE" renderEmpty={true} />);
    const badge = screen.getByTestId('crown-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-crown', 'NONE');
  });
});

describe('StatsCard Component (SPEC-016)', () => {
  it('merender total poin, streak harian, mahkota emas/perak, dan speed streak', () => {
    const onOpen = vi.fn();
    renderWithProviders(<StatsCard stats={mockStats} onOpenHistory={onOpen} />);

    expect(screen.getByTestId('stats-card')).toBeInTheDocument();
    expect(screen.getByTestId('stats-total-points')).toHaveTextContent('365');
    expect(screen.getByTestId('stats-daily-streak')).toHaveTextContent('5');
    expect(screen.getByTestId('stats-gold-crowns')).toHaveTextContent('2');
    expect(screen.getByTestId('stats-silver-crowns')).toHaveTextContent('4');
    expect(screen.getByTestId('stats-speed-streak')).toHaveTextContent('6x');

    const historyBtn = screen.getByTestId('open-points-history-btn');
    fireEvent.click(historyBtn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('menampilkan peringatan lembut saat streak_at_risk bernilai true', () => {
    const atRiskStats: StatsDTO = {
      ...mockStats,
      streak_at_risk: true,
    };
    renderWithProviders(<StatsCard stats={atRiskStats} />);

    expect(screen.getByText(/Belajar hari ini untuk menjaga streak 5 hari/i)).toBeInTheDocument();
  });
});

describe('HeaderChips Component (SPEC-016)', () => {
  beforeEach(() => {
    mockPathname = '/dashboard';
  });

  it('merender chip streak dan chip poin dengan nilai dan label aksesibel', () => {
    renderWithProviders(<HeaderChips />);

    expect(screen.getByTestId('header-chips')).toBeInTheDocument();
    expect(screen.getByTestId('chip-streak')).toHaveTextContent('5');
    expect(screen.getByTestId('chip-points')).toHaveTextContent('365');
  });

  it('disembunyikan pada Mode Ujian (/ujian/...)', () => {
    mockPathname = '/ujian/some-attempt-id';
    const { container } = renderWithProviders(<HeaderChips />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DrillResult Component with Gamification (SPEC-016)', () => {
  const dummyResult: AttemptResult = {
    attempt: {
      id: 'a0000000-0000-4000-8000-000000000001',
      assessment_set_id: 'b0000000-0000-4000-8000-000000000001',
      assessment_type: 'ACTIVE_DRILL',
      mode: 'PRACTICE',
      status: 'GRADED',
      started_at: '2026-11-04T08:00:00.000Z',
      submitted_at: '2026-11-04T08:15:00.000Z',
      raw_score: 8,
      max_score: 10,
      score_percent: 80,
      band_score: null,
      passed: true,
      pass_percent: 75,
      points_awarded: 145,
    },
    per_skill: [{ skill: 'READING', raw_score: 8, max_score: 10, score_percent: 80 }],
    progress: {
      sub_module_id: 'c0000000-0000-4000-8000-000000000001',
      status: 'COMPLETED',
      mastery_crown: 'SILVER',
      best_score_percent: 80,
      next_sub_module_code: null,
      unlocked: [],
    },
    skip: null,
    boss: null,
    placement: null,
    review: null,
    gamification: {
      points: {
        drill: 80,
        speed_streak: 15,
        crown: 50,
        boss: 0,
        daily: 5,
        total: 150,
      },
      crown: {
        previous: 'NONE',
        current: 'SILVER',
        changed: true,
      },
      best_speed_streak: 4,
      daily_streak_days: 5,
    },
  };

  it('merender rincian perolehan poin dan perubahan mahkota perak', () => {
    renderWithProviders(
      <DrillResult
        result={dummyResult}
        onRetry={vi.fn()}
        retrying={false}
        onReviewMaterial={vi.fn()}
      />,
    );

    expect(screen.getByTestId('drill-gamification')).toBeInTheDocument();
    expect(screen.getByText('+150 Poin')).toBeInTheDocument();
    expect(screen.getByText('+80')).toBeInTheDocument();
    expect(screen.getByText('+15')).toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText(/Mahkota Perak Diraih!/i)).toBeInTheDocument();
    expect(screen.getByText(/Streak Belajar: 5 hari berturut-turut!/i)).toBeInTheDocument();
  });
});

