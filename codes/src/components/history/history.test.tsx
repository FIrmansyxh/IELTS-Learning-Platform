import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAM_HISTORY, PREDICTIONS } from '@/components/gamification/fixtures';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import { BandProgressChart, isIndicativePoint, progressSummary } from './band-progress-chart';
import { ExamHistory, safeInternalPath } from './exam-history';
import { HistoryTabs } from './history-tabs';

const meta = (n: number) => ({ page: 1, page_size: 20, total: n });

function serve(opts: { predictions?: unknown[]; history?: unknown[]; historyStatus?: number } = {}) {
  return mockFetch((url) => {
    if (url.pathname === '/api/v1/me/band-predictions') return { body: { data: opts.predictions ?? PREDICTIONS, meta: meta((opts.predictions ?? PREDICTIONS).length) } };
    if (url.pathname === '/api/v1/me/exam-history') {
      if (opts.historyStatus) return { status: opts.historyStatus, body: errorBody('INTERNAL_ERROR', 'x') };
      return { body: { data: opts.history ?? EXAM_HISTORY, meta: meta((opts.history ?? EXAM_HISTORY).length) } };
    }
    return { status: 404, body: errorBody('NOT_FOUND', 'x') };
  });
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
});

describe('HistoryTabs', () => {
  it('dua tab tautan Ujian | Penilaian AI dengan aria-current pada tab aktif', () => {
    renderWithProviders(<HistoryTabs current="penilaian" />);
    const nav = screen.getByRole('navigation', { name: 'Bagian riwayat' });
    expect(within(nav).getByRole('link', { name: 'Ujian' })).toHaveAttribute('href', '/riwayat/ujian');
    expect(within(nav).getByRole('link', { name: 'Ujian' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Penilaian AI' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Penilaian AI' })).toHaveAttribute('href', '/riwayat/penilaian');
  });
});

describe('BandProgressChart', () => {
  it('satu titik per prediksi, garis, sumbu Y 0-9 (tick 0,3,6,9), tanggal awal-akhir, ringkasan', () => {
    renderWithProviders(<BandProgressChart points={PREDICTIONS} />);
    expect(screen.getAllByTestId('band-point')).toHaveLength(3);
    expect(screen.getByTestId('band-line')).toBeInTheDocument();
    const svg = screen.getByRole('img', { name: /Grafik garis perkembangan prediksi band/ });
    for (const tick of ['0', '3', '6', '9']) expect(within(svg as unknown as HTMLElement).getAllByText(tick).length).toBeGreaterThan(0);
    expect(screen.getByText('3 titik prediksi, dari Band 5,0 sampai Band 6,5.')).toBeInTheDocument();
  });

  it('satu titik: tanpa garis, tetap satu titik', () => {
    renderWithProviders(<BandProgressChart points={[PREDICTIONS[0]!]} />);
    expect(screen.getAllByTestId('band-point')).toHaveLength(1);
    expect(screen.queryByTestId('band-line')).toBeNull();
  });

  it('kosong: pesan, tanpa chart dan tanpa tombol tabel', () => {
    renderWithProviders(<BandProgressChart points={[]} />);
    expect(screen.getByTestId('band-progress-empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lihat sebagai tabel' })).toBeNull();
    expect(progressSummary([])).toContain('Belum ada titik prediksi');
  });

  it('toggle tabel alternatif menampilkan semua nilai; tooltip titik lewat fokus', () => {
    renderWithProviders(<BandProgressChart points={PREDICTIONS} />);
    const point = screen.getByRole('img', { name: /^\d{1,2} \S+ 2026: Band 6,5$/ });
    fireEvent.focus(point);
    expect(screen.getByTestId('band-tooltip')).toHaveTextContent('Band 6,5');
    fireEvent.click(screen.getByRole('button', { name: 'Lihat sebagai tabel' }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('5,0')).toBeInTheDocument();
    expect(within(table).getAllByText('Boss Stage')).toHaveLength(2);
    expect(within(table).getByText('Perhitungan ulang')).toBeInTheDocument();
  });
});

describe('titik indikatif (F-17-03)', () => {
  it('komponen null = indikatif; semua komponen terisi = lengkap', () => {
    expect(isIndicativePoint(PREDICTIONS[0]!)).toBe(true);
    expect(isIndicativePoint({ ...PREDICTIONS[0]!, components: { LISTENING: 6, READING: 6, WRITING: 6, SPEAKING: 6 } })).toBe(false);
  });

  it('titik indikatif berbentuk belah ketupat berongga (bukan hanya warna), titik lengkap lingkaran; ada legenda dan disclaimer', () => {
    const full = { ...PREDICTIONS[1]!, components: { LISTENING: 6, READING: 6, WRITING: 6, SPEAKING: 6 } };
    renderWithProviders(<BandProgressChart points={[PREDICTIONS[0]!, full]} />);
    const marks = screen.getAllByTestId('band-point');
    expect(marks.map((m) => [m.tagName.toLowerCase(), m.getAttribute('data-kind')])).toEqual([['polygon', 'indicative'], ['circle', 'full']]);
    expect(screen.getByTestId('band-legend')).toHaveTextContent('Titik indikatif');
    expect(screen.getByRole('img', { name: /Band 5,0 \(indikatif\)$/ })).toBeInTheDocument();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
  });

  it('tabel alternatif memuat kolom Jenis (Indikatif/Lengkap)', () => {
    const full = { ...PREDICTIONS[1]!, components: { LISTENING: 6, READING: 6, WRITING: 6, SPEAKING: 6 } };
    renderWithProviders(<BandProgressChart points={[PREDICTIONS[0]!, full]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lihat sebagai tabel' }));
    expect(screen.getAllByTestId('band-kind').map((c) => c.textContent)).toEqual(['Indikatif', 'Lengkap']);
  });

  it('/riwayat/ujian menampilkan EstimasiNotice', async () => {
    serve();
    renderWithProviders(<ExamHistory />);
    await screen.findByRole('table');
    expect(screen.getAllByText('Perkiraan latihan, bukan skor resmi IELTS.').length).toBeGreaterThan(0);
  });
});

describe('ExamHistory', () => {
  it('menampilkan grafik dan tabel: tanggal, jenis, skor, band, hasil (ikon + teks), tautan Lihat', async () => {
    serve();
    renderWithProviders(<ExamHistory />);
    expect(await screen.findByTestId('band-progress')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('Lulus')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('57,50%')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('6,0')).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('link', { name: 'Lihat hasil Boss Stage Tier 2' })).toHaveAttribute(
      'href',
      '/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/hasil',
    );
    // Placement: band dan hasil null -> "-".
    expect(within(rows[2]!).getAllByText('-').length).toBe(2);
  });

  it('filter jenis: awalnya tanpa assessment_type, lalu mengirim nilai yang dipilih', async () => {
    const calls = serve();
    renderWithProviders(<ExamHistory />);
    await screen.findByRole('table');
    expect(calls.find((c) => c.url.pathname === '/api/v1/me/exam-history')!.url.searchParams.has('assessment_type')).toBe(false);
    fireEvent.change(screen.getByLabelText('Jenis ujian'), { target: { value: 'PLACEMENT_TEST' } });
    await waitFor(() =>
      expect(calls.some((c) => c.url.pathname === '/api/v1/me/exam-history' && c.url.searchParams.get('assessment_type') === 'PLACEMENT_TEST')).toBe(true),
    );
  });

  it('kosong: "Belum ada riwayat. Mulai latihan pertama Anda." dan grafik kosong', async () => {
    serve({ predictions: [], history: [] });
    renderWithProviders(<ExamHistory />);
    expect(await screen.findByText('Belum ada riwayat. Mulai latihan pertama Anda.')).toBeInTheDocument();
    expect(await screen.findByTestId('band-progress-empty')).toBeInTheDocument();
  });

  it('galat daftar: Coba lagi memuat ulang; galat grafik tidak menyembunyikan daftar', async () => {
    mockFetch((url) =>
      url.pathname === '/api/v1/me/band-predictions'
        ? { status: 500, body: errorBody('INTERNAL_ERROR', 'x') }
        : { body: { data: EXAM_HISTORY, meta: meta(2) } },
    );
    renderWithProviders(<ExamHistory />);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('band-progress')).toBeNull();
  });

  it('galat daftar ujian: kartu galat dengan Coba lagi', async () => {
    serve({ historyStatus: 500 });
    renderWithProviders(<ExamHistory />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });

  it('lebih dari 100 titik: mengambil halaman terakhir (terbaru)', async () => {
    const calls = mockFetch((url) => {
      if (url.pathname === '/api/v1/me/band-predictions') {
        const page = Number(url.searchParams.get('page'));
        return { body: { data: page === 1 ? PREDICTIONS.slice(0, 1) : PREDICTIONS, meta: { page, page_size: 100, total: 230 } } };
      }
      return { body: { data: [], meta: meta(0) } };
    });
    renderWithProviders(<ExamHistory />);
    await waitFor(() => expect(screen.getAllByTestId('band-point')).toHaveLength(3));
    const pages = calls.filter((c) => c.url.pathname === '/api/v1/me/band-predictions').map((c) => c.url.searchParams.get('page'));
    expect(pages).toEqual(['1', '3']);
  });
});

describe('safeInternalPath', () => {
  it('menolak tautan eksternal dan protocol-relative', () => {
    expect(safeInternalPath('/ujian/x/hasil')).toBe('/ujian/x/hasil');
    expect(safeInternalPath('https://evil.test')).toBe('/riwayat/ujian');
    expect(safeInternalPath('//evil.test')).toBe('/riwayat/ujian');
  });
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/riwayat/ujian',
  useSearchParams: () => new URLSearchParams(),
}));
