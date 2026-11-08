import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
