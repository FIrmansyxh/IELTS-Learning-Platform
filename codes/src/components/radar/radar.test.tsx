import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREDICTIONS, RADAR_COMPLETE, RADAR_EMPTY, RADAR_PARTIAL, skill } from '@/components/gamification/fixtures';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import { axisAngle, isRadarEmpty, labelAt, pointAt, polygonPoints, RADAR, summarizeSkills } from '@/lib/radar';
import { PredictionCard } from './prediction-card';
import { RadarCard } from './radar-card';
import { RadarChart, radarSummary } from './radar-chart';
import { RadarTable } from './radar-table';

function setNarrow(narrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: narrow && query.includes('max-width: 399px'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => setNarrow(false));
afterEach(() => vi.restoreAllMocks());

const serveRadar = (data: unknown) => mockFetch((url) => (url.pathname === '/api/v1/me/skills/radar' ? { body: { data } } : { status: 404, body: errorBody('NOT_FOUND', 'x') }));

describe('geometri radar (lib/radar)', () => {
  it('sumbu pertama di atas dan enam sumbu searah jarum jam', () => {
    expect(axisAngle(0)).toBeCloseTo(-Math.PI / 2);
    const top = pointAt(0, 9);
    expect(top.x).toBeCloseTo(RADAR.cx);
    expect(top.y).toBeCloseTo(RADAR.cy - RADAR.radius);
    const right = pointAt(1, 9);
    expect(right.x).toBeGreaterThan(RADAR.cx);
    expect(pointAt(3, 9).y).toBeGreaterThan(RADAR.cy);
  });

  it('nilai di luar 0-9 dijepit ke batas', () => {
    expect(pointAt(0, 99).y).toBeCloseTo(RADAR.cy - RADAR.radius);
    expect(pointAt(0, -3).y).toBeCloseTo(RADAR.cy);
    expect(polygonPoints([0, 0, 0, 0, 0, 0]).split(' ')).toHaveLength(6);
  });

  it('label kiri/kanan memakai jangkar teks yang menjauhi pusat', () => {
    expect(labelAt(0).anchor).toBe('middle');
    expect(labelAt(1).anchor).toBe('start');
    expect(labelAt(4).anchor).toBe('end');
  });

  it('ringkasan: terendah = keterampilan tanpa band, tertinggi = band terbesar', () => {
    const { low, high } = summarizeSkills(RADAR_PARTIAL.skills);
    expect(low?.skill).toBe('READING');
    expect(high?.skill).toBe('LISTENING');
    expect(radarSummary(RADAR_PARTIAL.skills)).toBe('Skor terendah: Reading belum cukup data; tertinggi: Listening 7,5');
  });

  it('ringkasan lengkap: terendah adalah band terkecil', () => {
    expect(summarizeSkills(RADAR_COMPLETE.skills).low?.skill).toBe('VOCAB');
    expect(isRadarEmpty(RADAR_EMPTY.skills)).toBe(true);
    expect(isRadarEmpty(RADAR_PARTIAL.skills)).toBe(false);
  });
});

describe('RadarChart', () => {
  it('menggambar 6 sumbu berlabel penuh dengan font >= 12px dan tidak dirotasi', () => {
    renderWithProviders(<RadarChart skills={RADAR_COMPLETE.skills} targetBand={6.5} />);
    for (const [k, name] of [['LISTENING', 'Listening'], ['READING', 'Reading'], ['WRITING', 'Writing'], ['SPEAKING', 'Speaking'], ['GRAMMAR', 'Grammar'], ['VOCAB', 'Vocabulary']] as const) {
      const el = screen.getByTestId(`radar-label-${k}`);
      expect(el).toHaveTextContent(name);
      expect(Number(el.getAttribute('font-size'))).toBeGreaterThanOrEqual(12);
      expect(el.getAttribute('transform')).toBeNull();
    }
  });

  it('svg punya nama aksesibel berisi ringkasan skor terendah dan tertinggi', () => {
    renderWithProviders(<RadarChart skills={RADAR_PARTIAL.skills} targetBand={null} />);
    expect(screen.getByRole('img', { name: /Skor terendah: Reading belum cukup data; tertinggi: Listening 7,5/ })).toBeInTheDocument();
  });

  it('garis target hanya muncul bila target_band tidak null, lengkap dengan legenda', () => {
    const { rerender } = renderWithProviders(<RadarChart skills={RADAR_PARTIAL.skills} targetBand={6.5} />);
    const target = screen.getByTestId('radar-target');
    expect(target).toHaveAttribute('stroke-dasharray');
    expect(screen.getByTestId('radar-target-legend')).toHaveTextContent('Target band 6,5');
    rerender(<RadarChart skills={RADAR_PARTIAL.skills} targetBand={null} />);
    expect(screen.queryByTestId('radar-target')).toBeNull();
    expect(screen.queryByTestId('radar-target-legend')).toBeNull();
  });

  it('cincin tiap 1,0 (9 cincin) berupa garis solid, bukan putus-putus', () => {
    renderWithProviders(<RadarChart skills={RADAR_COMPLETE.skills} targetBand={null} />);
    const rings = document.querySelectorAll('svg g[aria-hidden="true"] polygon');
    expect(rings).toHaveLength(9);
    rings.forEach((r) => expect(r.getAttribute('stroke-dasharray')).toBeNull());
  });

  it('viewport < 400px: label singkatan (Lis, Rea, Wri, Spk, Gra, Voc) dengan legenda lengkap', () => {
    setNarrow(true);
    renderWithProviders(<RadarChart skills={RADAR_COMPLETE.skills} targetBand={6.5} />);
    expect(['LISTENING', 'READING', 'WRITING', 'SPEAKING', 'GRAMMAR', 'VOCAB'].map((k) => screen.getByTestId(`radar-label-${k}`).textContent)).toEqual([
      'Lis', 'Rea', 'Wri', 'Spk', 'Gra*', 'Voc*',
    ]);
    expect(screen.getByTestId('radar-abbr-legend')).toHaveTextContent('Lis = Listening');
    expect(screen.getByTestId('radar-abbr-legend')).toHaveTextContent('Voc = Vocabulary');
  });

  it('keterampilan tanpa band digambar 0, tanpa titik, dan disebut di legenda "belum cukup data"', () => {
    renderWithProviders(<RadarChart skills={RADAR_PARTIAL.skills} targetBand={6.5} />);
    expect(screen.queryByTestId('radar-point-READING')).toBeNull();
    expect(screen.getByTestId('radar-point-LISTENING')).toBeInTheDocument();
    expect(screen.getByTestId('radar-nodata')).toHaveTextContent('Belum cukup data: Reading, Speaking, Vocabulary');
    const area = screen.getByTestId('radar-area').getAttribute('points')!.split(' ');
    // Reading (indeks 1) tanpa band berada di pusat.
    expect(area[1]).toBe(`${RADAR.cx.toFixed(1)},${RADAR.cy.toFixed(1)}`);
  });

  it('tooltip nilai muncul saat fokus (keyboard) dan hilang saat blur', () => {
    renderWithProviders(<RadarChart skills={RADAR_COMPLETE.skills} targetBand={null} />);
    const point = screen.getByTestId('radar-point-LISTENING');
    expect(point).toHaveAttribute('tabindex', '0');
    expect(point).toHaveAccessibleName('Listening: Band 7,0');
    fireEvent.focus(point);
    expect(screen.getByTestId('radar-tooltip')).toHaveTextContent('Listening: Band 7,0');
    fireEvent.blur(point);
    expect(screen.queryByTestId('radar-tooltip')).toBeNull();
  });

  it('titik 8px dengan cincin permukaan 2px dan area sentuh >= 24px', () => {
    renderWithProviders(<RadarChart skills={RADAR_COMPLETE.skills} targetBand={null} />);
    const hit = screen.getByTestId('radar-point-LISTENING');
    expect(Number(hit.getAttribute('r')) * 2).toBeGreaterThanOrEqual(24);
    const dot = hit.previousElementSibling!;
    expect(Number(dot.getAttribute('r')) * 2).toBeGreaterThanOrEqual(8);
    expect(dot.getAttribute('stroke')).toBe('var(--color-surface)');
    expect(dot.getAttribute('stroke-width')).toBe('2');
  });
});

describe('RadarTable', () => {
  it('menampilkan 6 baris data, catatan Proksi untuk Grammar/Vocab, dan aria-label ringkasan', () => {
    renderWithProviders(<RadarTable skills={RADAR_PARTIAL.skills} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(table).getAllByText('Proksi (memakai tabel Reading)')).toHaveLength(2);
    expect(within(table).getByText('Belum cukup data (minimal 5 jawaban)')).toBeInTheDocument();
    expect(screen.getByTestId('radar-table')).toHaveAttribute('aria-label', expect.stringContaining('Skor terendah: Reading belum cukup data'));
    expect(within(table).getByText('80%')).toBeInTheDocument();
  });
});

describe('proksi pada grafik radar (F-17-03)', () => {
  it('label Grammar/Vocab bertanda * dengan legenda proksi; tooltip menyebut (proksi)', () => {
    renderWithProviders(<RadarChart skills={RADAR_COMPLETE.skills} targetBand={null} />);
    expect(screen.getByTestId('radar-label-GRAMMAR')).toHaveTextContent('Grammar*');
    expect(screen.getByTestId('radar-label-VOCAB')).toHaveTextContent('Vocabulary*');
    expect(screen.getByTestId('radar-label-LISTENING').textContent).toBe('Listening');
    expect(screen.getByTestId('radar-proxy-legend')).toHaveTextContent('Proksi');
    fireEvent.focus(screen.getByTestId('radar-point-GRAMMAR'));
    expect(screen.getByTestId('radar-tooltip')).toHaveTextContent('(proksi)');
  });
});

describe('PredictionCard sampel (F-17-02)', () => {
  it('tanpa field sample_size dari Backend: tidak ada baris sampel (fallback aman)', () => {
    renderWithProviders(<PredictionCard prediction={RADAR_PARTIAL.prediction} targetBand={null} />);
    expect(screen.queryByTestId('prediction-sample')).toBeNull();
  });

  it('sample_size ditampilkan; low_sample memunculkan lencana "Sampel kecil (n)"', () => {
    renderWithProviders(<PredictionCard prediction={{ ...RADAR_PARTIAL.prediction, sample_size: 6, low_sample: true }} targetBand={null} />);
    expect(screen.getByTestId('prediction-sample')).toHaveTextContent('Berdasarkan 6 sampel');
    expect(screen.getByTestId('small-sample-badge')).toHaveTextContent('Sampel kecil (6)');
  });
});

describe('PredictionCard', () => {
  it('belum lengkap: BandBadge berlabel Indikatif, rentang, catatan dasar, dan EstimasiNotice', () => {
    renderWithProviders(<PredictionCard prediction={RADAR_PARTIAL.prediction} targetBand={6.5} />);
    expect(screen.getByTestId('indicative-badge')).toHaveTextContent('Indikatif');
    expect(screen.getByTestId('prediction-card')).toHaveTextContent('7,0');
    expect(screen.getByTestId('prediction-range')).toHaveTextContent('6,5–7,5');
    expect(screen.getByTestId('prediction-basis')).toHaveTextContent('Indikatif: berdasarkan Listening dan Writing.');
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
    expect(screen.getByText(/Prediksi Anda sudah mencapai target/)).toBeInTheDocument();
  });

  it('lengkap: Overall Band tanpa label Indikatif dan selisih ke target', () => {
    renderWithProviders(<PredictionCard prediction={RADAR_COMPLETE.prediction} targetBand={7} />);
    expect(screen.queryByTestId('indicative-badge')).toBeNull();
    expect(screen.getByText('Overall Band')).toBeInTheDocument();
    expect(screen.getByText(/Selisih ke target: 0,5 band/)).toBeInTheDocument();
  });

  it('tanpa prediksi: pesan kosong dan disclaimer tetap terlihat', () => {
    renderWithProviders(<PredictionCard prediction={RADAR_EMPTY.prediction} targetBand={null} />);
    expect(screen.getByText('Belum ada prediksi')).toBeInTheDocument();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
  });
});

describe('RadarCard', () => {
  it('memuat radar lalu menampilkan chart, prediksi, dan disclaimer', async () => {
    serveRadar(RADAR_PARTIAL);
    renderWithProviders(<RadarCard />);
    expect(screen.getByRole('status', { name: 'Memuat...' })).toBeInTheDocument();
    expect(await screen.findByTestId('radar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('prediction-card')).toBeInTheDocument();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
  });

  it('toggle "Lihat sebagai tabel" menukar grafik dengan tabel 6 baris dan kembali', async () => {
    serveRadar(RADAR_COMPLETE);
    renderWithProviders(<RadarCard />);
    await screen.findByTestId('radar-chart');
    const toggle = screen.getByRole('button', { name: 'Lihat sebagai tabel' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(screen.queryByTestId('radar-chart')).toBeNull();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Lihat sebagai grafik' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Lihat sebagai grafik' }));
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('kosong (belum ada sampel): pesan, tanpa chart', async () => {
    serveRadar(RADAR_EMPTY);
    renderWithProviders(<RadarCard />);
    expect(await screen.findByText('Selesaikan latihan pertama untuk melihat radar Anda.')).toBeInTheDocument();
    expect(screen.queryByTestId('radar-chart')).toBeNull();
  });

  it('galat: kartu "Gagal memuat radar" dengan tombol Coba lagi yang memuat ulang', async () => {
    let fail = true;
    const calls = mockFetch(() => (fail ? { status: 500, body: errorBody('INTERNAL_ERROR', 'x') } : { body: { data: RADAR_PARTIAL } }));
    renderWithProviders(<RadarCard />);
    expect(await screen.findByText('Gagal memuat radar')).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByTestId('radar-chart')).toBeInTheDocument();
    expect(calls.length).toBe(2);
  });

  it('respons yang menyimpang dari kontrak (5 keterampilan) menjadi galat, tidak ditambal', async () => {
    serveRadar({ ...RADAR_PARTIAL, skills: RADAR_PARTIAL.skills.slice(0, 5) });
    renderWithProviders(<RadarCard />);
    expect(await screen.findByText('Gagal memuat radar')).toBeInTheDocument();
  });

  it('tabel: keterampilan tanpa sampel (Speaking dan Vocabulary) diberi catatan "Belum ada data"', async () => {
    serveRadar({ ...RADAR_PARTIAL, skills: RADAR_PARTIAL.skills.map((s) => (s.skill === 'SPEAKING' ? skill('SPEAKING') : s)) });
    renderWithProviders(<RadarCard />);
    await screen.findByTestId('radar-chart');
    fireEvent.click(screen.getByRole('button', { name: 'Lihat sebagai tabel' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(within(screen.getByRole('table')).getAllByText('Belum ada data')).toHaveLength(2);
  });
});

describe('fixture prediksi', () => {
  it('urut lama ke baru (untuk grafik riwayat)', () => {
    const t = PREDICTIONS.map((p) => Date.parse(p.created_at));
    expect([...t].sort((a, b) => a - b)).toEqual(t);
  });
});
