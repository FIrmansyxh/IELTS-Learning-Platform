import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttemptResult } from '@/contracts/attempts';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import { DrillResult } from '@/components/quiz/drill-result';
import { makeResult } from '@/components/quiz/fixtures';
import { ProfileStats, StatsCard } from './stats-card';
import { BossPointsNote, GamificationResult, parseGamification } from './gamification-result';
import { CrownBadge } from './crown-badge';
import { PointsHistorySheet } from './points-history-sheet';
import { STATS, STATS_NEW_USER } from './fixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => setReducedMotion(false));
afterEach(() => vi.restoreAllMocks());

const POINTS = { drill: 80, speed_streak: 15, crown: 50, boss: 0, daily: 5, total: 150 };
const block = (over: Record<string, unknown> = {}) => ({
  points: POINTS,
  crown: { previous: 'NONE', current: 'SILVER', changed: true },
  best_speed_streak: 4,
  daily_streak_days: 5,
  ...over,
});

describe('CrownBadge', () => {
  it('Emas/Perak punya nama aksesibel teks dan label, bukan hanya warna', () => {
    const { rerender } = renderWithProviders(<CrownBadge crown="GOLD" scorePercent={92} />);
    expect(screen.getByRole('img', { name: 'Mahkota Emas, skor 92%' })).toBeInTheDocument();
    expect(screen.getByText('Emas')).toBeInTheDocument();
    rerender(<CrownBadge crown="SILVER" />);
    expect(screen.getByRole('img', { name: 'Mahkota Perak' })).toBeInTheDocument();
  });

  it('NONE tidak dirender kecuali showNone (outline putus-putus berlabel)', () => {
    const { container, rerender } = renderWithProviders(<CrownBadge crown="NONE" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CrownBadge crown="NONE" showNone />);
    expect(screen.getByRole('img', { name: 'Belum ada mahkota' })).toBeInTheDocument();
  });

  it('tiga ukuran 16/24/48 px (size-4, size-6, size-12)', () => {
    const { rerender } = renderWithProviders(<CrownBadge crown="GOLD" size="sm" />);
    expect(document.querySelector('svg')).toHaveClass('size-4');
    rerender(<CrownBadge crown="GOLD" size="md" />);
    expect(document.querySelector('svg')).toHaveClass('size-6');
    rerender(<CrownBadge crown="GOLD" size="lg" />);
    expect(document.querySelector('svg')).toHaveClass('size-12');
  });
});

describe('GamificationResult', () => {
  it('Silver baru: mahkota besar beranimasi, chip +150 poin, rincian, streak harian, tanpa confetti', () => {
    renderWithProviders(<GamificationResult block={parseGamification(block())!} scorePercent={80} />);
    expect(screen.getByTestId('crown-gain')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mahkota Perak, skor 80%' })).toBeInTheDocument();
    expect(screen.getByText('Mahkota baru: Mahkota Perak')).toBeInTheDocument();
    expect(screen.getByText('+150 poin').closest('[role="status"]')).toHaveTextContent('+150 poin');
    expect(screen.getByText('Streak harian: 5 hari')).toBeInTheDocument();
    expect(screen.getByText('Speed streak terbaik sesi ini: 4 jawaban beruntun')).toBeInTheDocument();
    const details = screen.getByText('Rincian poin').closest('details')!;
    expect(within(details).getByText('Jawaban benar')).toBeInTheDocument();
    expect(within(details).getByText('+80')).toBeInTheDocument();
    expect(within(details).getByText('+15')).toBeInTheDocument();
    expect(within(details).getByText('Aktivitas harian')).toBeInTheDocument();
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  it('berubah menjadi Gold: confetti satu kali dan kilau mahkota', () => {
    renderWithProviders(
      <GamificationResult block={parseGamification(block({ crown: { previous: 'SILVER', current: 'GOLD', changed: true } }))!} scorePercent={92} />,
    );
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
    expect(screen.getByTestId('crown-shine')).toBeInTheDocument();
    expect(screen.getByText('Mahkota naik dari Mahkota Perak ke Mahkota Emas')).toBeInTheDocument();
  });

  it('prefers-reduced-motion: tanpa confetti sama sekali (mahkota tetap tampil)', () => {
    setReducedMotion(true);
    renderWithProviders(
      <GamificationResult block={parseGamification(block({ crown: { previous: 'NONE', current: 'GOLD', changed: true } }))!} scorePercent={95} />,
    );
    expect(screen.queryByTestId('confetti')).toBeNull();
    expect(screen.getByRole('img', { name: 'Mahkota Emas, skor 95%' })).toBeInTheDocument();
  });

  it('mahkota tidak berubah: tidak ada blok perolehan dan tidak ada confetti', () => {
    renderWithProviders(
      <GamificationResult block={parseGamification(block({ crown: { previous: 'GOLD', current: 'GOLD', changed: false } }))!} />,
    );
    expect(screen.queryByTestId('crown-gain')).toBeNull();
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  it('tanpa poin baru: pesan anti-farming, tanpa chip dan tanpa rincian', () => {
    const zero = { drill: 0, speed_streak: 0, crown: 0, boss: 0, daily: 0, total: 0 };
    renderWithProviders(<GamificationResult block={parseGamification(block({ points: zero, crown: null, daily_streak_days: 0 }))!} />);
    expect(screen.getByText(/Poin hanya bertambah bila hasil Anda lebih baik/)).toBeInTheDocument();
    expect(screen.queryByText('Rincian poin')).toBeNull();
  });

  it('blok tidak sesuai kontrak diabaikan (hadiah tambahan, bukan hasil utama)', () => {
    expect(parseGamification({ points: 1 })).toBeNull();
    expect(parseGamification(null)).toBeNull();
    expect(parseGamification(undefined)).toBeNull();
  });
});

describe('DrillResult + gamifikasi', () => {
  const noop = () => undefined;
  it('menampilkan hadiah dari result.gamification dan tidak menggandakan mahkota kecil', () => {
    mockFetch(() => ({ body: { data: STATS } }));
    const result = { ...makeResult({ score: 92 }), gamification: block({ crown: { previous: 'NONE', current: 'GOLD', changed: true } }) as AttemptResult['gamification'] };
    renderWithProviders(<DrillResult result={result} onRetry={noop} retrying={false} onReviewMaterial={noop} />);
    expect(screen.getByTestId('gamification-result')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Mahkota/ })).toHaveLength(1);
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('tanpa blok gamifikasi (sebelum SPEC-016 aktif): hasil lama tetap, tanpa kartu hadiah', () => {
    mockFetch(() => ({ body: { data: STATS } }));
    renderWithProviders(<DrillResult result={makeResult()} onRetry={noop} retrying={false} onReviewMaterial={noop} />);
    expect(screen.queryByTestId('gamification-result')).toBeNull();
    expect(screen.getByRole('img', { name: /Mahkota Perak/ })).toBeInTheDocument();
  });

  it('menyegarkan statistik, radar, dan riwayat prediksi setelah hasil tampil', () => {
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    renderWithProviders(<DrillResult result={makeResult()} onRetry={noop} retrying={false} onReviewMaterial={noop} />);
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(['me', 'stats']));
    expect(keys).toContain(JSON.stringify(['me', 'skills']));
    expect(keys).toContain(JSON.stringify(['me', 'band-predictions']));
  });
});

describe('BossPointsNote', () => {
  it('hanya muncul bila ada poin Boss; tenang tanpa animasi', () => {
    const { rerender } = renderWithProviders(<BossPointsNote raw={block({ points: { ...POINTS, boss: 200 }, crown: null })} />);
    expect(screen.getByTestId('boss-points')).toHaveTextContent('+200 poin');
    rerender(<BossPointsNote raw={block({ crown: null })} />);
    expect(screen.queryByTestId('boss-points')).toBeNull();
  });
});

describe('StatsCard dan profil', () => {
  it('menampilkan poin, streak, mahkota emas/perak', async () => {
    mockFetch(() => ({ body: { data: STATS } }));
    renderWithProviders(<StatsCard />);
    expect(await screen.findByText('365')).toBeInTheDocument();
    expect(screen.getByText('5 hari')).toBeInTheDocument();
    expect(screen.getByText('Mahkota Emas')).toBeInTheDocument();
    expect(screen.getByText('Mahkota Perak')).toBeInTheDocument();
    expect(screen.queryByTestId('streak-risk')).toBeNull();
  });

  it('streak_at_risk: teks lembut tanpa nada menekan', async () => {
    mockFetch(() => ({ body: { data: { ...STATS, streak_at_risk: true } } }));
    renderWithProviders(<StatsCard />);
    expect(await screen.findByText('Belajar hari ini untuk menjaga streak 5 hari.')).toBeInTheDocument();
    expect(screen.getByTestId('streak-risk')).not.toHaveClass('text-destructive');
  });

  it('pengguna baru: semua angka 0 dan ajakan memulai', async () => {
    mockFetch(() => ({ body: { data: STATS_NEW_USER } }));
    renderWithProviders(<StatsCard />);
    expect(await screen.findByText('Mulai latihan untuk memulai streak Anda.')).toBeInTheDocument();
    expect(screen.getByText('0 hari')).toBeInTheDocument();
  });

  it('galat memuat: kartu disembunyikan tanpa alert', async () => {
    mockFetch(() => ({ status: 500, body: errorBody('INTERNAL_ERROR', 'x') }));
    renderWithProviders(<StatsCard />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByTestId('stats-card')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('profil: menampilkan streak terpanjang, speed streak terbaik, dan tanggal terakhir aktif', async () => {
    mockFetch(() => ({ body: { data: STATS } }));
    renderWithProviders(<ProfileStats />);
    expect(await screen.findByText('Streak terpanjang')).toBeInTheDocument();
    expect(screen.getByText('7 hari')).toBeInTheDocument();
    expect(screen.getByText('6 jawaban beruntun')).toBeInTheDocument();
    expect(screen.getByText('Terakhir aktif')).toBeInTheDocument();
  });
});

describe('PointsHistorySheet', () => {
  const entry = { id: 1042, source: 'CROWN', points: 50, note: 'Mahkota Perak 2.1.3', source_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a', created_at: '2026-11-03T10:34:12.000Z' };

  it('membuka Sheet dan memuat GET /me/points dengan page_size 20', async () => {
    const calls = mockFetch((url) => ({ body: { data: [entry], meta: { page: 1, page_size: 20, total: 1 } }, status: url.pathname === '/api/v1/me/points' ? 200 : 404 }));
    renderWithProviders(<PointsHistorySheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Riwayat poin' }));
    expect((await screen.findAllByText('Mahkota Perak 2.1.3')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('+50').length).toBeGreaterThan(0);
    const call = calls.find((c) => c.url.pathname === '/api/v1/me/points')!;
    expect(call.url.searchParams.get('page_size')).toBe('20');
  });

  it('kosong: "Belum ada poin."', async () => {
    mockFetch(() => ({ body: { data: [], meta: { page: 1, page_size: 20, total: 0 } } }));
    renderWithProviders(<PointsHistorySheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Riwayat poin' }));
    expect(await screen.findByText('Belum ada poin.')).toBeInTheDocument();
  });

  it('tipe ledger tak dikenal (ADJUSTMENT) tidak merusak daftar: baris lain tetap tampil, baris asing berlabel umum', async () => {
    mockFetch(() => ({ body: { data: [entry, { ...entry, id: 1043, source: 'ADJUSTMENT', points: -10, note: null }], meta: { page: 1, page_size: 20, total: 2 } } }));
    renderWithProviders(<PointsHistorySheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Riwayat poin' }));
    expect((await screen.findAllByText('Mahkota Perak 2.1.3')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Poin lainnya').length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('respons yang benar-benar rusak (poin bukan angka) tetap menjadi galat', async () => {
    mockFetch(() => ({ body: { data: [{ ...entry, points: 'x' }], meta: { page: 1, page_size: 20, total: 1 } } }));
    renderWithProviders(<PointsHistorySheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Riwayat poin' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
