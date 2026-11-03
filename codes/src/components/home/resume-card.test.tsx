import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import type { ResumeCard as ResumeData } from '@/contracts/resume';
import { Dashboard } from './dashboard';

const card: ResumeData = {
  state: 'RESUME',
  sub_module: { id: '7a1b2c3d-0213-4000-8000-000000000213', sub_module_code: '2.1.3', title: 'Passive Voice untuk Deskripsi Proses' },
  breadcrumb: { tier_label: 'Tier 2', module_title: 'Complex Grammar' },
  active_tab: 'LEARN',
  active_learn_subtab: 'VIDEO',
  video_progress_sec: 222,
  last_question_index: null,
  question_count: null,
  position_label: 'Video 03:42',
  progress_percent: 20,
  resume_path: '/belajar/2.1.3?tab=pelajari&sub=video&t=222',
  change_path: '/peta',
  updated_at: '2026-11-03T10:25:41.000Z',
};

function serve(resume: { status?: number; body: unknown }) {
  return mockFetch((url) => {
    if (url.pathname === '/api/v1/me/last-learned') return resume;
    if (url.pathname === '/api/v1/auth/me') return { body: { data: { user: USER } } };
    return { status: 404, body: errorBody('NOT_FOUND', 'x') };
  });
}

describe('Dashboard + ResumeCard', () => {
  it('RESUME: sapaan, satu CTA primer ke resume_path, posisi, progres, nama aksesibel', async () => {
    serve({ body: { data: card } });
    renderWithProviders(<Dashboard />);
    const cta = await screen.findByRole('link', { name: 'Lanjutkan Belajar: Passive Voice untuk Deskripsi Proses' });
    expect(cta).toHaveAttribute('href', '/belajar/2.1.3?tab=pelajari&sub=video&t=222');
    expect(screen.getByText('Video 03:42')).toBeInTheDocument();
    expect(screen.getByText('Tier 2 > Complex Grammar')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByRole('link', { name: 'Ganti sub-modul' })).toHaveAttribute('href', '/peta');
    expect(screen.getAllByText('Lanjutkan Belajar').length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByRole('heading', { level: 1, name: 'Halo, Budi Santoso' })).toBeInTheDocument();
  });

  it('FALLBACK_NEXT: label "Berikutnya untuk Anda"', async () => {
    serve({ body: { data: { ...card, state: 'FALLBACK_NEXT', position_label: 'Sub-modul berikutnya', resume_path: '/belajar/1.1.1?tab=pelajari' } } });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Berikutnya untuk Anda')).toBeInTheDocument();
    expect(screen.getByText('Sub-modul berikutnya')).toBeInTheDocument();
  });

  it('data null: empty state dengan satu tombol "Mulai dari Tier 1"; Placement tersembunyi', async () => {
    serve({ body: { data: null } });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Mulai perjalanan Anda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mulai dari Tier 1' })).toHaveAttribute('href', '/peta');
    expect(screen.queryByRole('link', { name: 'Ikut Placement Test' })).toBeNull();
  });

  it('galat: kartu galat, Coba lagi, dan tautan Peta Belajar', async () => {
    serve({ status: 500, body: errorBody('INTERNAL_ERROR', 'x') });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Posisi terakhir gagal dimuat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(screen.getByRole('link', { name: 'Buka Peta Belajar' })).toHaveAttribute('href', '/peta');
  });
});
