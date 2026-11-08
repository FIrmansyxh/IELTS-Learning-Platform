import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import type { SubModuleDetail } from '@/contracts/player';
import { makeAttempt, Q } from '@/components/quiz/fixtures';
import { makeDetail } from './fixtures';
import { parsePlayerQuery } from './query';
import { SubModulePlayer } from './sub-module-player';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('./youtube', async (orig) => {
  const real = await orig<typeof import('./youtube')>();
  return { ...real, loadYouTubeApi: vi.fn(() => new Promise(() => {})) };
});

beforeAll(() => {
  // Embla membutuhkan API peramban yang tidak ada di jsdom.
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

const initial = parsePlayerQuery({});
const tabMouse = (name: RegExp | string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

function serve(detail: SubModuleDetail, extra: (url: URL, init: RequestInit) => { status?: number; body?: unknown } | null = () => null) {
  return mockFetch((url, init) => {
    const e = extra(url, init);
    if (e) return e;
    if (url.pathname === '/api/v1/sub-modules/2.1.3') return { body: { data: detail } };
    if (url.pathname === '/api/v1/me/last-learned') return { body: { data: { updated_at: '2026-11-03T10:25:41.000Z' } } };
    if (url.pathname.endsWith('/learn-progress'))
      return { body: { data: { learn_active_seconds: 60, learn_visited_subtabs: ['ARTICLE'], learn_ready: false } } };
    return { status: 404, body: errorBody('NOT_FOUND', 'x') };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/belajar/2.1.3');
});

describe('SubModulePlayer', () => {
  it('memuat sub-modul: judul h1, tab Pelajari/Latihan/Terapkan, artikel, lampiran, atribusi', async () => {
    const calls = serve(makeDetail());
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    expect(await screen.findByRole('heading', { level: 1, name: /Passive Voice/ })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(expect.arrayContaining(['Pelajari', 'Latihan', 'Terapkan']));
    expect(screen.getByRole('heading', { name: /Mengapa Passive Voice/ })).toBeInTheDocument();
    expect(screen.getByText('Tips Examiner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Unduh PDF \(471 KB\)/ })).toHaveAttribute(
      'href',
      '/api/v1/assets/c1d2e3f4-0003-4000-8000-0000000000a3/file',
    );
    expect(screen.getByText('Diadaptasi dari materi terbuka.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Selanjutnya/ })).toHaveAttribute('href', '/belajar/2.1.4');
    // Posisi awal direkam (SPEC-007).
    await waitFor(() => expect(calls.some((c) => c.url.pathname === '/api/v1/me/last-learned' && c.init.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.url.pathname === '/api/v1/me/last-learned')!;
    expect(put.json).toMatchObject({ sub_module_id: '7a1b2c3d-0213-4000-8000-000000000213', active_tab: 'LEARN', active_learn_subtab: 'ARTICLE' });
  });

  it('"Selesai Belajar" aria-disabled dengan alasan sampai learn_ready; klik tidak memanggil API', async () => {
    const calls = serve(makeDetail());
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    const btn = await screen.findByRole('button', { name: 'Selesai Belajar' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Belajar aktif minimal 60 detik.')).toBeInTheDocument();
    expect(screen.getByText('Buka tab Video terlebih dahulu.')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(calls.some((c) => c.url.pathname.endsWith('/learn-complete'))).toBe(false);
  });

  it('learn_ready: klik menyelesaikan materi lalu pindah ke tab Latihan dengan "Mulai Latihan" aktif', async () => {
    const ready = makeDetail();
    ready.progress = { ...ready.progress, learn_ready: true, learn_active_seconds: 61, learn_visited_subtabs: ['ARTICLE', 'VIDEO', 'SLIDES'] };
    const calls = serve(ready, (url) =>
      url.pathname.endsWith('/learn-complete')
        ? { body: { data: { learn_completed_at: '2026-11-03T10:20:00.000Z', drill_can_start: true } } }
        : null,
    );
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    const btn = await screen.findByRole('button', { name: 'Selesai Belajar' });
    expect(btn).not.toHaveAttribute('aria-disabled');
    fireEvent.click(btn);
    const start = await screen.findByRole('button', { name: 'Mulai Latihan' });
    expect(start).toBeEnabled();
    expect(screen.getByRole('tab', { name: /Latihan/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Pelajari/ })).toHaveTextContent('(selesai)');
    expect(calls.find((c) => c.url.pathname.endsWith('/learn-complete'))?.init.method).toBe('POST');
    expect(window.location.search).toContain('tab=latihan');
  });

  it('409 LEARN_REQUIREMENTS_NOT_MET menampilkan pesan server', async () => {
    const ready = makeDetail();
    ready.progress = { ...ready.progress, learn_ready: true };
    serve(ready, (url) =>
      url.pathname.endsWith('/learn-complete')
        ? {
            status: 409,
            body: errorBody('LEARN_REQUIREMENTS_NOT_MET', 'x', [
              { path: 'learn_active_seconds', code: 'insufficient_active_time', message: 'Waktu belajar aktif minimal 60 detik (sekarang 42).' },
            ]),
          }
        : null,
    );
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Selesai Belajar' }));
    expect(await screen.findByText('Waktu belajar aktif minimal 60 detik (sekarang 42).')).toBeInTheDocument();
  });

  it('tab Latihan tanpa materi selesai: tombol nonaktif + alasan', async () => {
    serve(makeDetail());
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    await screen.findByRole('heading', { level: 1 });
    tabMouse(/Latihan/);
    expect(await screen.findByText('10 soal - 5 menit - lulus 75%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mulai Latihan' })).toBeDisabled();
    expect(screen.getByText('Selesaikan materi terlebih dahulu.')).toBeInTheDocument();
  });

  it('Mulai Latihan memanggil POST /attempts lalu menampilkan soal pertama; URL memuat attempt', async () => {
    const d = makeDetail();
    d.progress = { ...d.progress, learn_completed_at: '2026-11-03T10:20:00.000Z' };
    d.drill = { ...d.drill, can_start: true, blocked_reason: null };
    const attempt = makeAttempt([Q.mcq, Q.fill]);
    const calls = serve(d, (url, init) => (url.pathname === '/api/v1/attempts' && init.method === 'POST' ? { status: 201, body: { data: attempt } } : null));
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={parsePlayerQuery({ tab: 'latihan' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mulai Latihan' }));
    expect(await screen.findByTestId('question-counter')).toHaveTextContent('Soal 1 dari 2');
    expect(calls.find((c) => c.url.pathname === '/api/v1/attempts')?.json).toEqual({ assessment_set_id: 'e5f6a7b8-0001-4000-8000-0000000000d1' });
    await waitFor(() => expect(window.location.search).toContain(`attempt=${attempt.id}`));
    await waitFor(() =>
      expect(calls.some((c) => c.url.pathname === '/api/v1/me/last-learned' && (c.json as { active_tab?: string })?.active_tab === 'DRILL' && (c.json as { last_question_index?: number }).last_question_index === 0)).toBe(true),
      { timeout: 5000 },
    );
  });

  it('?attempt= memulihkan drill di soal q dengan GET /attempts/{id}', async () => {
    const d = makeDetail();
    d.progress = { ...d.progress, learn_completed_at: '2026-11-03T10:20:00.000Z' };
    d.drill = { ...d.drill, can_start: true, blocked_reason: null };
    const attempt = makeAttempt([Q.mcq, Q.fill, Q.tfng], {
      resumed: true,
      answered_count: 2,
      current_index: 2,
      answers: [
        { question_id: 'Q-01', response: { option_ids: ['ok7f2q'] }, feedback: { is_correct: true, score: 1, max_score: 1, correct_answer: { display: ['x'] }, explanation_id: 'p' } },
        { question_id: 'Q-05', response: { text: 'are sorted' }, feedback: { is_correct: true, score: 1, max_score: 1, correct_answer: { display: ['are sorted'] }, explanation_id: 'p' } },
      ],
    });
    serve(d, (url) => (url.pathname === `/api/v1/attempts/${attempt.id}` ? { body: { data: attempt } } : null));
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={parsePlayerQuery({ tab: 'latihan', q: '2', attempt: attempt.id })} />);
    expect(await screen.findByTestId('question-counter')).toHaveTextContent('Soal 3 dari 3');
  });

  it('sub-modul terkunci (403) menampilkan kartu alasan dan tombol kembali ke Peta tanpa materi', async () => {
    serve(makeDetail(), () => ({
      status: 403,
      body: errorBody('LOCKED_CONTENT', 'x', [{ path: 'sub_module_id', code: 'PREVIOUS_INCOMPLETE', message: 'x' }]),
    }));
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    expect(await screen.findByText('Sub-modul ini masih terkunci')).toBeInTheDocument();
    expect(screen.getByText('Selesaikan sub-modul sebelumnya terlebih dahulu.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kembali ke Peta' })).toHaveAttribute('href', '/peta');
    expect(screen.queryByRole('heading', { name: /Mengapa Passive Voice/ })).toBeNull();
  });

  it('404 dan kode tidak valid menampilkan "Sub-modul tidak ditemukan"', async () => {
    serve(makeDetail(), () => ({ status: 404, body: errorBody('NOT_FOUND', 'x') }));
    const { unmount } = renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    expect(await screen.findByText('Sub-modul tidak ditemukan')).toBeInTheDocument();
    unmount();
    renderWithProviders(<SubModulePlayer code="abc" initial={initial} />);
    expect(screen.getByText('Sub-modul tidak ditemukan')).toBeInTheDocument();
  });

  it('sub-tab Video/Slide hanya muncul bila ada konten; Slide menampilkan carousel dengan indikator "1/2"', async () => {
    serve(makeDetail());
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Slide' }), { button: 0 });
    const region = await screen.findByRole('region', { name: 'Slide materi' });
    expect(region).toHaveAttribute('aria-roledescription', 'carousel');
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByAltText('Diagram alur pabrik')).toHaveAttribute('src', expect.stringContaining('/api/v1/assets/'));
    expect(screen.getByRole('button', { name: 'Slide sebelumnya' })).toBeDisabled();
  });

  it('tanpa video dan slide tidak ada sub-tab', async () => {
    const d = makeDetail();
    d.material = { ...d.material, videos: [], slides: [] };
    serve(d);
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={initial} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('tab', { name: 'Video' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Slide' })).toBeNull();
  });

  it('Terapkan SELF_CHECK: Tandai Selesai memanggil mini-task/complete setelah materi selesai', async () => {
    const d = makeDetail();
    d.progress = { ...d.progress, learn_completed_at: '2026-11-03T10:20:00.000Z' };
    const calls = serve(d, (url) =>
      url.pathname.endsWith('/mini-task/complete') ? { body: { data: { mini_task_completed_at: '2026-11-03T10:40:00.000Z' } } } : null,
    );
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={parsePlayerQuery({ tab: 'terapkan' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tandai Selesai' }));
    expect(await screen.findByText('Mini-Task selesai.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith('/mini-task/complete'))).toBe(true);
  });

  it('Terapkan Mini-Task Writing: panel penulisan tampil bila materi sudah selesai (ADR-004)', async () => {
    const d = makeDetail();
    d.material = { ...d.material, mini_task: { task_type: 'AI_SHORT_WRITING', prompt: 'Tulis.', success_criteria: null } };
    d.progress = { ...d.progress, learn_completed_at: '2026-11-08T10:00:00.000Z' };
    serve(d);
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={parsePlayerQuery({ tab: 'terapkan' })} />);
    expect(await screen.findByTestId('writing-task-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Segera hadir' })).not.toBeInTheDocument();
  });

  it('Terapkan Mini-Task Writing: tertahan dengan pesan bila materi belum selesai', async () => {
    const d = makeDetail();
    d.material = { ...d.material, mini_task: { task_type: 'AI_SHORT_WRITING', prompt: 'Tulis.', success_criteria: null } };
    d.progress = { ...d.progress, learn_completed_at: null };
    serve(d);
    renderWithProviders(<SubModulePlayer code="2.1.3" initial={parsePlayerQuery({ tab: 'terapkan' })} />);
    await screen.findByText('Tulis.');
    expect(screen.queryByTestId('writing-task-panel')).not.toBeInTheDocument();
  });
});

describe('parsePlayerQuery', () => {
  it('menolak nilai di luar enum/rentang/format', () => {
    expect(parsePlayerQuery({ tab: 'x', sub: 'y', t: '-3', q: 'abc', attempt: 'bukan-uuid' })).toEqual({
      tab: 'pelajari',
      sub: 'artikel',
      t: null,
      q: null,
      attempt: null,
    });
    expect(parsePlayerQuery({ tab: 'latihan', sub: 'video', t: '222', q: '3', attempt: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a' })).toMatchObject({
      tab: 'latihan',
      sub: 'video',
      t: 222,
      q: 3,
    });
  });
});
