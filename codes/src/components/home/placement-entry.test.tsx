import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RADAR_EMPTY, STATS_NEW_USER } from '@/components/gamification/fixtures';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import { SkillTreeView } from '@/components/skill-tree/skill-tree-view';
import { Dashboard } from './dashboard';
import { PlacementMapHint } from './placement-entry';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const SET = 'd0cc0001-0001-4000-8000-000000000001';
const ATTEMPT = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';

const status = (over: Record<string, unknown> = {}) => ({
  available: true,
  blocked_reason: null,
  assessment_set_id: SET,
  question_count: 25,
  time_limit_seconds: 1500,
  completed_at: null,
  active_attempt_id: null,
  pending_result: null,
  ...over,
});

function serve(placement: { status?: number; body: unknown }, resume: unknown = null) {
  return mockFetch((url) => {
    if (url.pathname === '/api/v1/placement') return placement;
    if (url.pathname === '/api/v1/me/last-learned') return { body: { data: resume } };
    if (url.pathname === '/api/v1/auth/me') return { body: { data: { user: USER } } };
    if (url.pathname === '/api/v1/me/stats') return { body: { data: STATS_NEW_USER } };
    if (url.pathname === '/api/v1/me/skills/radar') return { body: { data: RADAR_EMPTY } };
    if (url.pathname === '/api/v1/curriculum/tree') return { body: { data: { tiers: [] } } };
    return { status: 404, body: errorBody('NOT_FOUND', 'x') };
  });
}

describe('Titik masuk Placement', () => {
  it('dashboard kosong + available: tombol "Ikut Placement Test" ke /ujian/mulai/{set}', async () => {
    serve({ body: { data: status() } });
    renderWithProviders(<Dashboard />);
    const link = await screen.findByRole('link', { name: 'Ikut Placement Test' });
    expect(link).toHaveAttribute('href', `/ujian/mulai/${SET}`);
    expect(screen.getByRole('link', { name: 'Mulai dari Tier 1' })).toHaveAttribute('href', '/peta');
  });

  it('available=false: tombol Placement tersembunyi', async () => {
    serve({ body: { data: status({ available: false, blocked_reason: 'PROGRESS_EXISTS' }) } });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Mulai perjalanan Anda')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Ikut Placement Test' })).toBeNull());
  });

  it('GET /placement gagal: dashboard tetap tampil tanpa tombol Placement dan tanpa galat', async () => {
    serve({ status: 500, body: errorBody('INTERNAL_ERROR', 'x') });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Mulai perjalanan Anda')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ikut Placement Test' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('RESULT_PENDING_APPLY: kartu "Hasil Placement Anda menunggu" dengan tombol "Lihat Hasil"', async () => {
    serve({ body: { data: status({ available: false, blocked_reason: 'RESULT_PENDING_APPLY', pending_result: { attempt_id: ATTEMPT, recommended_tier: 3 } }) } });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Hasil Placement Anda menunggu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat Hasil' })).toHaveAttribute('href', `/ujian/${ATTEMPT}/hasil`);
  });

  it('attempt Placement berjalan: tautan "Lanjutkan Placement Test"; tombol mulai tidak ganda', async () => {
    serve({ body: { data: status({ active_attempt_id: ATTEMPT }) } });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByRole('link', { name: 'Lanjutkan Placement Test' })).toHaveAttribute('href', `/ujian/${ATTEMPT}`);
    expect(screen.queryByRole('link', { name: 'Ikut Placement Test' })).toBeNull();
  });

  it('/peta: ajakan Placement untuk pengguna tanpa progres', async () => {
    serve({ body: { data: status() } });
    renderWithProviders(<PlacementMapHint />);
    const hint = await screen.findByTestId('placement-map-hint');
    expect(hint).toHaveTextContent('Sudah mahir bahasa Inggris?');
    expect(screen.getByRole('link', { name: 'Ikut Placement Test' })).toHaveAttribute('href', `/ujian/mulai/${SET}`);
  });

  it('SkillTreeView memuat ajakan Placement di atas peta', async () => {
    serve({ body: { data: status() } });
    renderWithProviders(<SkillTreeView />);
    expect(await screen.findByTestId('placement-map-hint')).toBeInTheDocument();
  });

  it('NO_PLACEMENT_PUBLISHED dengan nilai null tetap lolos kontrak klien dan tidak menampilkan apa pun', async () => {
    serve({
      body: { data: status({ available: false, blocked_reason: 'NO_PLACEMENT_PUBLISHED', assessment_set_id: null, question_count: null, time_limit_seconds: null }) },
    });
    renderWithProviders(<PlacementMapHint />);
    await waitFor(() => expect(screen.queryByTestId('placement-map-hint')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
