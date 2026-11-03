import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BandPanel } from '@/components/admin/band-panel';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import { validateBandRows, type EditableRow } from '@/lib/band-rows';
import { BandBadge, BandConversionTable, BandResultBlock, EstimasiNotice } from './band-display';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const rows = [
  { raw_min: 0, raw_max: 22, band: 5.5 },
  { raw_min: 23, raw_max: 25, band: 6.0 },
  { raw_min: 26, raw_max: 29, band: 6.5 },
  { raw_min: 30, raw_max: 40, band: 7.0 },
];

describe('komponen band', () => {
  it('BandBadge menampilkan 1 desimal berformat Indonesia dengan label', () => {
    render(<BandBadge band={6} />);
    expect(screen.getByText('6,0')).toBeInTheDocument();
    expect(screen.getByText('Band')).toBeInTheDocument();
  });

  it('BandResultBlock selalu menyertakan EstimasiNotice', () => {
    render(
      <BandResultBlock>
        <BandBadge band={7.5} />
      </BandResultBlock>,
    );
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
    render(<EstimasiNotice />);
  });

  it('BandConversionTable menyorot baris yang dicapai dan tersedia sebagai tabel + daftar kartu', () => {
    const { container } = render(<BandConversionTable rows={rows} achievedRaw={28} versionLabel="v1-umum-2026-11" />);
    const hit = container.querySelector('tr[data-achieved]');
    expect(hit).toHaveTextContent('26-29');
    expect(hit).toHaveTextContent('6,5');
    expect(hit).toHaveTextContent('Dicapai');
    expect(screen.getByRole('table', { hidden: true })).toBeInTheDocument();
    expect(container.querySelectorAll('ul > li')).toHaveLength(4);
    expect(screen.getByText('Tabel v1-umum-2026-11')).toBeInTheDocument();
  });
});

describe('validateBandRows', () => {
  const r = (a: number | null, b: number | null, band: number | null): EditableRow => ({ raw_min: a, raw_max: b, band });
  it('tabel valid tanpa isu', () => {
    expect(validateBandRows(rows.map((x) => r(x.raw_min, x.raw_max, x.band)))).toEqual([]);
  });
  it('celah: pesan persis "Celah: skor 16 tidak tercakup."', () => {
    const issues = validateBandRows([r(0, 15, 4), r(17, 40, 6)]);
    expect(issues.map((i) => i.message)).toContain('Celah: skor 16 tidak tercakup.');
    expect(issues[0]!.code).toBe('coverage_gap');
  });
  it('tumpang tindih dan rentang celah', () => {
    expect(validateBandRows([r(0, 20, 4), r(18, 40, 6)]).map((i) => i.message)).toContain('Tumpang tindih di 18-20.');
    expect(validateBandRows([r(0, 10, 4), r(20, 40, 6)]).map((i) => i.message)).toContain('Celah: skor 11-19 tidak tercakup.');
  });
  it('band bukan kelipatan 0,5, rentang terbalik, dan band menurun', () => {
    expect(validateBandRows([r(0, 40, 6.3)])[0]!.code).toBe('band_invalid');
    expect(validateBandRows([r(30, 20, 6)])[0]!.code).toBe('range_invalid');
    expect(validateBandRows([r(0, 20, 6), r(21, 40, 5)]).some((i) => i.code === 'non_monotonic')).toBe(true);
    expect(validateBandRows([r(null, 40, 6)])[0]!.code).toBe('range_invalid');
  });
});

const list = [
  {
    id: 'aa11bb22-0001-4000-8000-000000000001',
    skill: 'LISTENING',
    version_label: 'v1-umum-2026-11',
    is_active: true,
    effective_from: '2026-11-03T00:00:00.000Z',
    row_count: 17,
    used_by_attempts: 12,
    created_at: '2026-11-03T00:00:00.000Z',
  },
  {
    id: 'aa11bb22-0003-4000-8000-000000000003',
    skill: 'LISTENING',
    version_label: 'v2-contoh',
    is_active: false,
    effective_from: null,
    row_count: 3,
    used_by_attempts: 0,
    created_at: '2026-11-03T00:00:00.000Z',
  },
];

describe('BandPanel (admin)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('daftar versi: Badge Aktif, banner permanen; versi aktif tanpa tombol Aktifkan/Hapus', async () => {
    mockFetch(() => ({ body: { data: list } }));
    renderWithProviders(<BandPanel />);
    expect(await screen.findByRole('cell', { name: 'v2-contoh' })).toBeInTheDocument();
    expect(screen.getByText(/Tabel ini perkiraan dan bervariasi antar versi tes/)).toBeInTheDocument();
    const activeRow = screen.getByRole('cell', { name: 'v1-umum-2026-11' }).closest('tr')!;
    expect(within(activeRow).getByText('Aktif')).toBeInTheDocument();
    expect(within(activeRow).queryByRole('button')).toBeNull();
    const inactiveRow = screen.getByRole('cell', { name: 'v2-contoh' }).closest('tr')!;
    expect(within(inactiveRow).getByRole('button', { name: /Aktifkan/ })).toBeInTheDocument();
    expect(within(inactiveRow).getByRole('button', { name: /Hapus/ })).toBeInTheDocument();
  });

  it('Aktifkan lewat Dialog konfirmasi memanggil POST .../activate', async () => {
    const calls = mockFetch((url, init) =>
      init.method === 'POST' && url.pathname.endsWith('/activate')
        ? { body: { data: { id: list[1]!.id, skill: 'LISTENING', is_active: true, effective_from: '2026-11-03T12:00:00.000Z' } } }
        : { body: { data: list } },
    );
    renderWithProviders(<BandPanel />);
    const row = (await screen.findByRole('cell', { name: 'v2-contoh' })).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Aktifkan/ }));
    expect(await screen.findByText('Aktifkan tabel ini?')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aktifkan' }));
    await waitFor(() => expect(calls.some((c) => c.url.pathname === `/api/v1/admin/band-tables/${list[1]!.id}/activate`)).toBe(true));
  });

  it('Buat Versi Baru: Simpan nonaktif saat ada celah dan menampilkan pesan celah; aktif saat valid; kirim rows', async () => {
    const calls = mockFetch((url, init) =>
      init.method === 'POST' && url.pathname === '/api/v1/admin/band-tables'
        ? { status: 201, body: { data: { id: 'aa11bb22-0009-4000-8000-000000000009', skill: 'LISTENING', version_label: 'v3', is_active: false, row_count: 2 } } }
        : { body: { data: list } },
    );
    renderWithProviders(<BandPanel />);
    await screen.findByRole('cell', { name: 'v2-contoh' });
    fireEvent.click(screen.getByRole('button', { name: 'Buat Versi Baru' }));
    const save = await screen.findByRole('button', { name: 'Simpan' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Label versi'), { target: { value: 'v3' } });
    // baris awal 0-40 band kosong -> belum valid
    expect(save).toBeDisabled();
    fireEvent.change(document.getElementById('band-row-0-raw_max')!, { target: { value: '15' } });
    fireEvent.change(document.getElementById('band-row-0-band')!, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah baris' }));
    fireEvent.change(document.getElementById('band-row-1-raw_min')!, { target: { value: '17' } });
    fireEvent.change(document.getElementById('band-row-1-raw_max')!, { target: { value: '40' } });
    fireEvent.change(document.getElementById('band-row-1-band')!, { target: { value: '6' } });
    expect(screen.getByText('Celah: skor 16 tidak tercakup.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(document.getElementById('band-row-1-raw_min')!, { target: { value: '16' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.init.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.init.method === 'POST')!.json).toEqual({
      skill: 'LISTENING',
      version_label: 'v3',
      rows: [
        { raw_min: 0, raw_max: 15, band: 4 },
        { raw_min: 16, raw_max: 40, band: 6 },
      ],
    });
  });

  it('409 VERSION_LABEL_TAKEN tampil sebagai pesan Indonesia di sheet', async () => {
    mockFetch((url, init) =>
      init.method === 'POST' ? { status: 409, body: errorBody('VERSION_LABEL_TAKEN', 'x') } : { body: { data: list } },
    );
    renderWithProviders(<BandPanel />);
    await screen.findByRole('cell', { name: 'v2-contoh' });
    fireEvent.click(screen.getByRole('button', { name: 'Buat Versi Baru' }));
    fireEvent.change(await screen.findByLabelText('Label versi'), { target: { value: 'v1-umum-2026-11' } });
    fireEvent.change(document.getElementById('band-row-0-band')!, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Label versi sudah dipakai pada skill ini.')).toBeInTheDocument();
  });
});
