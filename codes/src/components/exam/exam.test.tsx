import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAttempt, makeResult, Q } from '@/components/quiz/fixtures';
import { curriculumApi } from '@/lib/api/curriculum';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import type { ExamIntro } from '@/contracts/exams';
import { ExamIntroView } from './exam-intro';
import { ExamResult, ExamResultView, firstSubModuleCode } from './exam-result';
import { ExamRunner, ExamSession } from './exam-runner';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/ujian',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/api/curriculum', () => ({ curriculumApi: { tree: vi.fn(async () => ({ tiers: [] })) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }));

const SET = 'f0a1b2c3-0001-4000-8000-0000000000e1';
const MODULE_ID = '7a1b2c3d-0021-4000-8000-000000000021';

const intro = (over: Partial<ExamIntro> = {}): ExamIntro => ({
  assessment_set_id: SET,
  assessment_type: 'SKIP_MODULE_TEST',
  title: 'Uji Kompetensi Modul 2.1',
  scope: { kind: 'MODULE', id: MODULE_ID, label: 'Modul 2.1 Complex Grammar' },
  time_limit_seconds: 900,
  question_count: 12,
  threshold: { kind: 'PERCENT', value: 85 },
  rules: ['Skor minimal 85% membuka level berikutnya tanpa materi.', 'Tidak ada pembahasan selama ujian.'],
  available: true,
  blocked_reason: null,
  cooldown: { next_allowed_at: null, attempts_in_window: 0, max_attempts: 3 },
  active_attempt_id: null,
  requires_audio: false,
  requires_microphone: false,
  boss: null,
  placement: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ExamIntroView', () => {
  it('menampilkan banner ambang, aturan, ringkasan, dan memulai ujian lewat POST /attempts', async () => {
    const attempt = makeAttempt([Q.mcq], { mode: 'EXAM', assessment_type: 'SKIP_MODULE_TEST' });
    const calls = mockFetch((url, init) =>
      url.pathname === '/api/v1/attempts' && init.method === 'POST' ? { status: 201, body: { data: attempt } } : { status: 404, body: {} },
    );
    renderWithProviders(<ExamIntroView intro={intro()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Uji Kompetensi Modul 2.1' })).toBeInTheDocument();
    expect(screen.getByText('Skor >= 85% membuka level berikutnya tanpa materi')).toBeInTheDocument();
    expect(screen.getByText('12 soal - 15 menit')).toBeInTheDocument();
    expect(screen.getByText('Tidak ada pembahasan selama ujian.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Ujian' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/ujian/${attempt.id}`));
    expect(calls[0]!.json).toEqual({ assessment_set_id: SET });
  });

  it('cooldown aktif: tombol disabled dengan jam coba lagi WIB dan tautan kembali ke Peta', () => {
    renderWithProviders(
      <ExamIntroView
        intro={intro({
          available: false,
          blocked_reason: 'COOLDOWN_ACTIVE',
          cooldown: { next_allowed_at: '2026-11-03T11:30:00.000Z', attempts_in_window: 1, max_attempts: 3 },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
    expect(screen.getByText('Coba lagi pukul 18:30 WIB')).toBeInTheDocument();
    expect(screen.getByText('Percobaan 24 jam terakhir: 1 dari 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kembali ke Peta' })).toHaveAttribute('href', '/peta');
  });

  it('batas harian dan level sudah dimulai menampilkan alasan Indonesia', () => {
    const { unmount } = renderWithProviders(<ExamIntroView intro={intro({ available: false, blocked_reason: 'DAILY_ATTEMPT_LIMIT' })} />);
    expect(screen.getByText('Batas percobaan hari ini tercapai')).toBeInTheDocument();
    unmount();
    renderWithProviders(<ExamIntroView intro={intro({ available: false, blocked_reason: 'SKIP_NOT_AVAILABLE' })} />);
    expect(screen.getByText('Level ini sudah dimulai')).toBeInTheDocument();
  });

  it('attempt berjalan: tombol "Lanjutkan Ujian" menuju attempt tanpa POST', () => {
    const calls = mockFetch(() => ({ status: 404, body: {} }));
    renderWithProviders(<ExamIntroView intro={intro({ active_attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan Ujian' }));
    expect(push).toHaveBeenCalledWith('/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a');
    expect(calls).toHaveLength(0);
  });

  it('429 COOLDOWN_ACTIVE memunculkan Dialog (bukan Toast) berisi jam coba lagi', async () => {
    mockFetch(() => ({
      status: 429,
      body: errorBody('COOLDOWN_ACTIVE', 'x', [{ path: 'next_allowed_at', code: 'cooldown_active', message: '2026-11-03T11:30:00.000Z' }]),
    }));
    renderWithProviders(<ExamIntroView intro={intro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Ujian' }));
    expect(await screen.findByText('Anda dapat mencoba lagi pukul 18:30 WIB.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('perangkat: audio dan mikrofon hanya bila dibutuhkan', () => {
    renderWithProviders(<ExamIntroView intro={intro({ requires_audio: true, requires_microphone: true })} />);
    expect(screen.getByText('Pastikan speaker atau headphone berfungsi.')).toBeInTheDocument();
    expect(screen.getByText(/mikrofon berfungsi/)).toBeInTheDocument();
  });
});

describe('ExamSession (mode ujian)', () => {
  const examAttempt = (over = {}) => {
    const now = Date.now();
    return makeAttempt([Q.mcq, Q.fill, Q.tfng], {
      mode: 'EXAM',
      assessment_type: 'SKIP_MODULE_TEST',
      title: 'Uji Kompetensi Modul 2.1',
      started_at: new Date(now).toISOString(),
      server_now: new Date(now).toISOString(),
      deadline_at: new Date(now + 600_000).toISOString(),
      remaining_seconds: 600,
      ...over,
    });
  };
  const answerOk = { status: 200, body: { data: { question_id: 'Q-01', saved: true, answered_count: 1, feedback: null, next_question: null } } };

  it('tanpa umpan balik: jawaban disimpan otomatis (debounce) hanya dengan {response}; timer dari deadline', async () => {
    const calls = mockFetch((url, init) => (init.method === 'PUT' ? answerOk : { status: 404, body: {} }));
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    expect(screen.getByRole('timer', { name: 'Sisa waktu' })).toHaveTextContent('10:00');
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(put.url.pathname).toBe('/api/v1/attempts/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/answers/Q-01');
    expect(put.json).toEqual({ response: { option_ids: ['o3x9aw'] } });
    expect(screen.queryByText('Benar!')).toBeNull();
    expect(screen.queryByText('Kurang tepat')).toBeNull();
    expect(await screen.findByText('Jawaban tersimpan')).toBeInTheDocument();
  });

  it('navigator memindah soal (menyimpan dulu) dan menandai soal; pilihan masih bisa diganti', async () => {
    mockFetch(() => answerOk);
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 1 dari 3');
    fireEvent.click(screen.getByText(/Buka daftar soal/));
    fireEvent.click(screen.getByRole('button', { name: /Ke soal 3/ }));
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 3 dari 3');
    fireEvent.click(screen.getByRole('button', { name: 'Tandai soal' }));
    expect(screen.getByRole('button', { name: /Ke soal 3, Kosong, Ditandai/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hapus tanda' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Akhiri -> konfirmasi -> submit lalu ke halaman hasil', async () => {
    const calls = mockFetch((url, init) =>
      url.pathname.endsWith('/submit') && init.method === 'POST' ? { body: { data: makeResult() } } : answerOk,
    );
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Akhiri' }));
    expect(screen.getByText(/3 soal belum dijawab/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, akhiri' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/hasil'));
    expect(calls.some((c) => c.url.pathname.endsWith('/submit'))).toBe(true);
  });

  it('waktu habis (deadline terlewati) mengirim otomatis; ATTEMPT_EXPIRED tetap berakhir di hasil', async () => {
    const now = Date.now();
    mockFetch((url) =>
      url.pathname.endsWith('/submit') ? { status: 409, body: errorBody('ATTEMPT_EXPIRED', 'x') } : answerOk,
    );
    renderWithProviders(
      <ExamSession attempt={examAttempt({ deadline_at: new Date(now - 1000).toISOString(), remaining_seconds: 0 })} />,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/hasil'));
  });

  it('F-08-09: pengiriman otomatis dicoba lagi bila gagal (jaringan)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let submits = 0;
    mockFetch((url) => {
      if (url.pathname.endsWith('/submit')) {
        submits += 1;
        return submits === 1 ? { status: 500, body: errorBody('INTERNAL_ERROR', 'x') } : { body: { data: makeResult() } };
      }
      return answerOk;
    });
    renderWithProviders(
      <ExamSession attempt={examAttempt({ deadline_at: new Date(Date.now() - 1000).toISOString(), remaining_seconds: 0 })} />,
    );
    await waitFor(() => expect(submits).toBe(1));
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/hasil'));
    expect(submits).toBe(2);
    vi.useRealTimers();
  });

  it('F-08-09: tidak mengirim ujian bila penyimpanan jawaban terakhir gagal', async () => {
    const calls = mockFetch((url, init) =>
      init.method === 'PUT' ? { status: 500, body: errorBody('INTERNAL_ERROR', 'x') } : url.pathname.endsWith('/submit') ? { body: { data: makeResult() } } : answerOk,
    );
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Akhiri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ya, akhiri' }));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Akhiri' })).toBeEnabled());
    expect(calls.some((c) => c.url.pathname.endsWith('/submit'))).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('F-08-09: peringatan beforeunload aktif selama ujian dan dilepas saat tidak lagi terpasang', () => {
    mockFetch(() => answerOk);
    const { unmount } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    unmount();
    const ev2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
  });

  it('timer mengikuti jam server: selisih server_now diperhitungkan', () => {
    const now = Date.now();
    mockFetch(() => answerOk);
    renderWithProviders(
      <ExamSession
        attempt={examAttempt({
          server_now: new Date(now + 60_000).toISOString(),
          deadline_at: new Date(now + 60_000 + 125_000).toISOString(),
        })}
      />,
    );
    expect(screen.getByRole('timer', { name: 'Sisa waktu' })).toHaveTextContent('02:05');
  });

  it('jawaban tersimpan dipulihkan setelah muat ulang', () => {
    mockFetch(() => answerOk);
    renderWithProviders(
      <ExamSession
        attempt={examAttempt({
          answered_count: 1,
          answers: [{ question_id: 'Q-01', response: { option_ids: ['ok7f2q'] }, feedback: null }],
        })}
      />,
    );
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
  });
});

describe('ExamRunner', () => {
  it('attempt yang sudah selesai dialihkan ke hasil', async () => {
    const done = makeAttempt([], { status: 'GRADED', mode: 'EXAM' });
    mockFetch(() => ({ body: { data: done } }));
    renderWithProviders(<ExamRunner attemptId={done.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/ujian/${done.id}/hasil`));
  });
  it('404 menampilkan "Ujian tidak ditemukan"', async () => {
    mockFetch(() => ({ status: 404, body: errorBody('NOT_FOUND', 'x') }));
    renderWithProviders(<ExamRunner attemptId="9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a" />);
    expect(await screen.findByText('Ujian tidak ditemukan')).toBeInTheDocument();
  });
});

const skipPassed = {
  passed: true,
  score_percent: 91.67,
  threshold_percent: 85,
  scope: { kind: 'MODULE', id: MODULE_ID, label: 'Modul 2.1 Complex Grammar' },
  skipped_sub_module_count: 4,
  unlocked: [{ kind: 'SUB_MODULE', id: '7a1b2c3d-0221-4000-8000-000000000221', label: '2.2.1 Anatomi Paragraf Akademik' }],
  retry: { next_allowed_at: null, attempts_remaining_today: 2 },
};
const examResult = (skip: unknown, passed: boolean, score: number) => {
  const r = makeResult({ passed, score });
  return {
    ...r,
    attempt: { ...r.attempt, mode: 'EXAM' as const, assessment_type: 'SKIP_MODULE_TEST' as const, pass_percent: 85 },
    review: [
      { question_id: 'Q-01', is_correct: true, score: 1, max_score: 1, response: { option_ids: ['x'] } },
      { question_id: 'Q-02', is_correct: false, score: 0, max_score: 1, response: { option_ids: ['y'] } },
    ],
    progress: null,
    skip,
  };
};

describe('ExamResultView', () => {
  it('Skip lulus: "Level dilewati", jumlah sub-modul, Terbuka, tombol Buka Peta; tanpa kunci/pembahasan', () => {
    mockFetch(() => ({ body: { data: { tiers: [] } } }));
    renderWithProviders(<ExamResultView result={examResult(skipPassed, true, 91.67)} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Level dilewati' })).toBeInTheDocument();
    expect(screen.getByText('4 sub-modul ditandai Dilewati')).toBeInTheDocument();
    expect(screen.getByText(/Terbuka: 2\.2\.1 Anatomi Paragraf Akademik/)).toBeInTheDocument();
    expect(screen.getByText('Ambang lulus 85%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buka Peta Belajar' })).toHaveAttribute('href', '/peta');
    // QA F-08-01: tidak ada benar/salah per soal pada hasil ujian, walau server masih mengirim review.
    expect(screen.queryByText(/Benar$/)).toBeNull();
    expect(screen.queryByText(/Salah$/)).toBeNull();
    expect(screen.queryByText('Hasil per soal')).toBeNull();
    expect(screen.queryByText('Pembahasan')).toBeNull();
    expect(screen.queryByText('Jawaban benar')).toBeNull();
  });

  it('Skip gagal: pesan suportif, jam coba lagi, sisa percobaan, tombol mulai ke sub-modul pertama target', async () => {
    const skip = {
      ...skipPassed,
      passed: false,
      score_percent: 50,
      skipped_sub_module_count: 0,
      unlocked: [],
      retry: { next_allowed_at: '2026-11-03T11:30:00.000Z', attempts_remaining_today: 2 },
    };
    const tree = {
      tiers: [
        {
          id: 'x',
          modules: [{ id: MODULE_ID, sub_modules: [{ sub_module_code: '2.1.1', content_state: 'AVAILABLE' }] }],
        },
      ],
    };
    vi.mocked(curriculumApi.tree).mockResolvedValue(tree as never);
    renderWithProviders(<ExamResultView result={examResult(skip, false, 50)} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Belum lulus' })).toBeInTheDocument();
    expect(screen.getByText('Tidak ada penalti. Pelajari materinya lalu coba lagi.')).toBeInTheDocument();
    expect(screen.getByText('Coba lagi setelah 18:30 WIB')).toBeInTheDocument();
    expect(screen.getByText('Sisa percobaan hari ini: 2')).toBeInTheDocument();
    // Tautan awal modul mengikuti pohon kurikulum bila tersedia.
    await waitFor(() => expect(screen.getByRole('link', { name: 'Mulai Belajar dari Awal Modul' })).toHaveAttribute('href', '/belajar/2.1.1'));
  });

  it('toleran terhadap ketiadaan review / is_correct dan tetap menampilkan agregat + rincian per skill', () => {
    const r = examResult(skipPassed, true, 91.67) as Record<string, unknown>;
    r.review = null;
    r.per_skill = [{ skill: 'GRAMMAR', raw_score: 8, max_score: 10, score_percent: 80 }];
    mockFetch(() => ({ body: { data: { tiers: [] } } }));
    renderWithProviders(<ExamResultView result={r as never} />);
    expect(screen.getByTestId('score-percent')).toHaveTextContent('91,67%');
    expect(screen.getByText('GRAMMAR')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('Lulus')).toBeInTheDocument();
  });

  it('F-08-04: 84,996 tampil 84,99% (tidak dibulatkan ke 85) dan status mengikuti server', () => {
    const r = examResult({ ...skipPassed, passed: false, score_percent: 84.996 }, false, 84.996);
    mockFetch(() => ({ body: { data: { tiers: [] } } }));
    renderWithProviders(<ExamResultView result={r as never} />);
    expect(screen.getByTestId('score-percent')).toHaveTextContent('84,99%');
    expect(screen.queryByText('Lulus')).toBeNull();
  });

  it('hasil bersama band menampilkan BandBadge bersama disclaimer perkiraan', () => {
    const r = examResult(null, true, 80);
    r.attempt.band_score = 6.5;
    renderWithProviders(<ExamResultView result={r} />);
    expect(screen.getByText('6,5')).toBeInTheDocument();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
  });
});

describe('ExamResult', () => {
  it('ATTEMPT_NOT_FINISHED mengembalikan ke ujian', async () => {
    mockFetch(() => ({ status: 409, body: errorBody('ATTEMPT_NOT_FINISHED', 'x') }));
    renderWithProviders(<ExamResult attemptId="9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a'));
  });
});

describe('firstSubModuleCode', () => {
  it('mencari sub-modul AVAILABLE pertama pada modul atau tier target', () => {
    const tree = {
      tiers: [
        {
          id: 'T2',
          modules: [
            { id: 'M1', sub_modules: [{ sub_module_code: '2.1.1', content_state: 'COMING_SOON' }, { sub_module_code: '2.1.2', content_state: 'AVAILABLE' }] },
          ],
        },
      ],
    } as never;
    expect(firstSubModuleCode(tree, { kind: 'MODULE', id: 'M1', label: '' })).toBe('2.1.2');
    expect(firstSubModuleCode(tree, { kind: 'TIER', id: 'T2', label: '' })).toBe('2.1.2');
    expect(firstSubModuleCode(tree, { kind: 'MODULE', id: 'zzz', label: '' })).toBeNull();
    expect(firstSubModuleCode(undefined, { kind: 'MODULE', id: 'M1', label: '' })).toBeNull();
  });
});

