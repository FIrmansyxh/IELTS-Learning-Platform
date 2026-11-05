/** @vitest-environment jsdom */
import * as React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/components/test-utils';
import { RadarCard } from '@/components/radar/radar-card';
import type { RadarDataDTO } from '@/contracts/skills';

vi.mock('recharts', async () => {
  const original = await vi.importActual<Record<string, unknown>>('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div className="recharts-responsive-container" data-testid="responsive-container">
        {children}
      </div>
    ),
  };
});

const mockRadarData: RadarDataDTO = {
  skills: [
    { skill: 'LISTENING', score_percent: 80.0, estimated_band: 7.5, sample_size: 50, is_proxy: false, updated_at: '2026-11-04T10:00:00.000Z' },
    { skill: 'READING', score_percent: 75.0, estimated_band: null, sample_size: 4, is_proxy: false, updated_at: '2026-11-04T10:00:00.000Z' },
    { skill: 'WRITING', score_percent: 66.67, estimated_band: 6.0, sample_size: 3, is_proxy: false, updated_at: '2026-11-04T10:00:00.000Z' },
    { skill: 'SPEAKING', score_percent: null, estimated_band: null, sample_size: 0, is_proxy: false, updated_at: null },
    { skill: 'GRAMMAR', score_percent: 60.0, estimated_band: 6.0, sample_size: 20, is_proxy: true, updated_at: '2026-11-04T10:00:00.000Z' },
    { skill: 'VOCAB', score_percent: null, estimated_band: null, sample_size: 0, is_proxy: true, updated_at: null },
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

let currentData: RadarDataDTO | undefined = mockRadarData;
let currentLoading = false;
let currentError = false;

vi.mock('@/hooks/use-skills', () => ({
  useRadarData: () => ({
    data: currentData,
    isLoading: currentLoading,
    isError: currentError,
    refetch: vi.fn(),
  }),
  useBandPredictions: () => ({
    data: { data: [], meta: { page: 1, page_size: 20, total: 0 } },
    isLoading: false,
    isError: false,
  }),
  useExamHistory: () => ({
    data: { data: [], meta: { page: 1, page_size: 20, total: 0 } },
    isLoading: false,
    isError: false,
  }),
}));

describe('RadarCard Component (SPEC-017)', () => {
  beforeEach(() => {
    currentData = mockRadarData;
    currentLoading = false;
    currentError = false;
  });

  it('merender kartu radar dengan prediksi indikatif dan target band', () => {
    renderWithProviders(<RadarCard />);

    expect(screen.getByText('Radar Kesiapan 6 Keterampilan')).toBeInTheDocument();
    expect(screen.getByText('Indikatif')).toBeInTheDocument();
    expect(screen.getByText('7,0')).toBeInTheDocument();
    expect(screen.getByText('Rentang: 6.5 – 7.5')).toBeInTheDocument();
    expect(screen.getByText('Target Band')).toBeInTheDocument();
    expect(screen.getByText('6.5')).toBeInTheDocument();
  });

  it('beralih antara mode grafik dan mode tabel dengan tombol toggle', () => {
    renderWithProviders(<RadarCard />);

    // Default: grafik (ada tombol "Lihat sebagai tabel")
    const toggleBtn = screen.getByRole('button', { name: /Lihat sebagai tabel/i });
    expect(toggleBtn).toBeInTheDocument();

    // Klik toggle untuk ke mode tabel
    fireEvent.click(toggleBtn);

    // Sekarang tombol berganti nama jadi "Lihat sebagai radar"
    expect(screen.getByRole('button', { name: /Lihat sebagai radar/i })).toBeInTheDocument();

    // Tabel menampilkan 6 baris keterampilan
    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('Writing')).toBeInTheDocument();
    expect(screen.getByText('Speaking')).toBeInTheDocument();
    expect(screen.getByText('Grammar')).toBeInTheDocument();
    expect(screen.getByText('Vocabulary')).toBeInTheDocument();

    // Skor % dan proksi muncul
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getAllByText('Proksi')).toHaveLength(2);
  });

  it('menampilkan empty state jika semua sampel masih 0', () => {
    currentData = {
      ...mockRadarData,
      skills: mockRadarData.skills.map((s) => ({
        ...s,
        sample_size: 0,
        score_percent: null,
        estimated_band: null,
      })),
    };

    renderWithProviders(<RadarCard />);

    expect(
      screen.getByText('Selesaikan latihan pertama untuk melihat radar Anda.'),
    ).toBeInTheDocument();
  });
});

