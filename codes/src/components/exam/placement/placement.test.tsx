import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAttempt, makeResult, Q } from '@/components/quiz/fixtures';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import type { Attempt, AttemptResult, QuestionPublic } from '@/contracts/attempts';
import type { ExamIntroData } from '@/lib/api/exams';
import type { PlacementResult } from '@/lib/api/placement-contract';
import { ExamIntroView } from '../exam-intro';
import { ExamResultView } from '../exam-result';
import { ExamRunner } from '../exam-runner';
import { PlacementResultView, skippedTiersText } from './placement-result';
import { PlacementSession } from './placement-session';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/ujian',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }));

const ATTEMPT_ID = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
const SET = 'd0cc0001-0001-4000-8000-000000000001';
const attemptPath = `/api/v1/attempts/${ATTEMPT_ID}`;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

const json = (body: unknown, status = 200) => ({ status, body });

const mcq = (id: string, prompt: string): QuestionPublic => ({
  ...Q.mcq,
  question_id: id,
  prompt,
  options: [
    { option_id: `${id}a`, text: 'goes' },
    { option_id: `${id}b`, text: 'go' },
  ],
});
const Q1 = mcq('Q-PL-014', 'She ____ to work every day.');
const Q2 = mcq('Q-PL-031', 'They ____ football on Sunday.');

function placementAttempt(over: Partial<Attempt> = {}): Attempt {
  const now = Date.now();
  return makeAttempt([Q1], {
    id: ATTEMPT_ID,
    assessment_set_id: SET,
    assessment_type: 'PLACEMENT_TEST',
    mode: 'EXAM',
    title: 'Placement Test',
    question_count: 25,
    answered_count: 0,
    started_at: new Date(now).toISOString(),
    server_now: new Date(now).toISOString(),
    deadline_at: new Date(now + 1_500_000).toISOString(),
    remaining_seconds: 1500,
    ...over,
  });
}

const answerBody = (next: QuestionPublic | null, answered = 1) => ({
  data: { question_id: Q1.question_id, saved: true, answered_count: answered, feedback: null, next_question: next },
});

describe('PlacementSession', () => {
  it('satu soal per layar tanpa navigator, Sebelumnya, atau umpan balik; Jawab menunggu pilihan', async () => {
    const calls = mockFetch((url, init) => (init.method === 'PUT' ? json(answerBody(Q2)) : json({}, 404)));
    renderWithProviders(<PlacementSession attempt={placementAttempt()} />);
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 1 dari 25');
    expect(screen.getByRole('progressbar', { name: 'Progres Placement Test' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByRole('button', { name: /sebelumnya/i })).toBeNull();
    expect(screen.queryByText(/Buka daftar soal/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Ke soal/ })).toBeNull();
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    const answer = screen.getByRole('button', { name: 'Jawab' });
    expect(answer).toBeDisabled();

    fireEvent.click(screen.getAllByRole('radio')[0]!);
    expect(answer).toBeEnabled();
    fireEvent.click(answer);

    // Soal berikutnya dari next_question; hitungan maju; tanpa umpan balik.
    expect(await screen.findByText('They ____ football on Sunday.')).toBeInTheDocument();
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 2 dari 25');
    expect(screen.queryByText('Benar!')).toBeNull();
    expect(screen.getByRole('button', { name: 'Jawab' })).toBeDisabled();
    expect(screen.getAllByRole('status').some((el) => el.textContent === 'Soal 2 dari 25')).toBe(true);
    // Fokus ke kepala soal baru.
    await waitFor(() => expect(document.activeElement?.tagName).toBe('LEGEND'));

    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(put.url.pathname).toBe(`${attemptPath}/answers/Q-PL-014`);
    expect(put.json).toEqual({ response: { option_ids: ['Q-PL-014a'] } });
  });

  it('next_question null: attempt dikirim lalu hasil dibuka', async () => {
    const calls = mockFetch((url, init) => {
      if (init.method === 'PUT') return json(answerBody(null, 25));
      if (url.pathname === `${attemptPath}/submit` && init.method === 'POST') return json({ data: makeResult() });
      return json({}, 404);
    });
    renderWithProviders(<PlacementSession attempt={placementAttempt({ answered_count: 24 })} />);
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Jawab' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/ujian/${ATTEMPT_ID}/hasil`));
    expect(calls.some((c) => c.url.pathname === `${attemptPath}/submit`)).toBe(true);
  });

  it('jaringan gagal: Toast dengan "Coba lagi", soal tidak maju, jawaban tetap terpilih', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    const { toast } = await import('sonner');
    renderWithProviders(<PlacementSession attempt={placementAttempt()} />);
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Jawab' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [msg, opts] = vi.mocked(toast.error).mock.calls[0] as unknown as [string, { action: { label: string } }];
    expect(msg).toBe('Jawaban belum tersimpan, soal tidak maju.');
    expect(opts.action.label).toBe('Coba lagi');
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 1 dari 25');
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
  });

  it('409 QUESTION_ALREADY_ANSWERED (perangkat lain): sinkron ulang ke soal yang sedang berjalan', async () => {
    const calls = mockFetch((url, init) => {
      if (init.method === 'PUT') return json(errorBody('QUESTION_ALREADY_ANSWERED', 'x'), 409);
      if (url.pathname === attemptPath) {
        return json({ data: placementAttempt({ questions: [Q1, Q2], answers: [{ question_id: Q1.question_id, response: { option_ids: ['x'] }, feedback: null }], answered_count: 1 }) });
      }
      return json({}, 404);
    });
    renderWithProviders(<PlacementSession attempt={placementAttempt()} />);
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Jawab' }));
    expect(await screen.findByText('They ____ football on Sunday.')).toBeInTheDocument();
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 2 dari 25');
    expect(calls.some((c) => c.url.pathname === attemptPath)).toBe(true);
  });

  it('next_question tidak sesuai kontrak: tidak maju dan tidak ditambal', async () => {
    mockFetch((url, init) => (init.method === 'PUT' ? json(answerBody({ question_id: 'Q-X' } as unknown as QuestionPublic)) : json({}, 404)));
    const { toast } = await import('sonner');
    renderWithProviders(<PlacementSession attempt={placementAttempt()} />);
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Jawab' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Respons server tidak sesuai kontrak. Hubungi pengelola.'));
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 1 dari 25');
  });

  it('Akhiri: Dialog menjelaskan hasil dari soal yang sudah dijawab, lalu kirim', async () => {
    const calls = mockFetch((url, init) => (url.pathname === `${attemptPath}/submit` && init.method === 'POST' ? json({ data: makeResult() }) : json({}, 404)));
    renderWithProviders(<PlacementSession attempt={placementAttempt()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Akhiri' }));
    expect(screen.getByText('Akhiri tes sekarang?')).toBeInTheDocument();
    expect(screen.getByText('Hasil dihitung dari soal yang sudah dijawab.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, akhiri' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/ujian/${ATTEMPT_ID}/hasil`));
    expect(calls.some((c) => c.url.pathname === `${attemptPath}/submit`)).toBe(true);
  });

  it('muat ulang: melanjutkan soal pending (soal tersaji terakhir tanpa jawaban)', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(
      <PlacementSession
        attempt={placementAttempt({
          questions: [Q1, Q2],
          answers: [{ question_id: Q1.question_id, response: { option_ids: ['Q-PL-014a'] }, feedback: null }],
          answered_count: 1,
        })}
      />,
    );
    expect(screen.getByText('They ____ football on Sunday.')).toBeInTheDocument();
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 2 dari 25');
  });

  it('waktu habis: Dialog "Waktu habis", lalu hasil dihitung dari soal yang dijawab', async () => {
    const calls = mockFetch((url, init) => (url.pathname === `${attemptPath}/submit` && init.method === 'POST' ? json({ data: makeResult() }) : json({}, 404)));
    const past = new Date(Date.now() - 5_000).toISOString();
    renderWithProviders(<PlacementSession attempt={placementAttempt({ deadline_at: past })} />);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Waktu habis');
    fireEvent.click(screen.getByRole('button', { name: 'Lihat Hasil' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/ujian/${ATTEMPT_ID}/hasil`));
    expect(calls.some((c) => c.url.pathname === `${attemptPath}/submit`)).toBe(true);
  });

  it('ExamRunner mengarahkan attempt PLACEMENT_TEST ke sesi adaptif', async () => {
    mockFetch((url) => (url.pathname === attemptPath ? json({ data: placementAttempt() }) : json({}, 404)));
    renderWithProviders(<ExamRunner attemptId={ATTEMPT_ID} />);
    expect(await screen.findByTestId('question-counter')).toHaveTextContent('Soal 1 dari 25');
  });
});

const tierOptions = [
  { tier_number: 1, title: 'Foundation', cefr_level: 'A1-A2', target_band_min: 3.0, target_band_max: 4.0 },
  { tier_number: 2, title: 'Bridge to Academic', cefr_level: 'B1', target_band_min: 4.0, target_band_max: 5.0 },
  { tier_number: 3, title: 'Operational IELTS', cefr_level: 'B2', target_band_min: 5.5, target_band_max: 6.5 },
];
const placement = (over: Partial<PlacementResult> = {}): PlacementResult => ({
  recommended_tier: 3,
  ability: 3.5,
  correct_count: 13,
  served_count: 25,
  applied: false,
  tier_options: tierOptions,
  ...over,
});
const applyOk = { data: { applied: true, tier_number: 3, skipped_tiers: [1, 2], unlocked: [] } };

describe('PlacementResultView', () => {
  it('rekomendasi, ringkasan benar, tiga cara memilih Tier awal, dan disclaimer', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<PlacementResultView attemptId={ATTEMPT_ID} placement={placement()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hasil Placement Test' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Rekomendasi: Mulai di Tier 3' })).toBeInTheDocument();
    expect(screen.getByText('Operational IELTS · CEFR B2 · Target Band 5.5–6.5')).toBeInTheDocument();
    expect(screen.getByText('13 dari 25 benar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mulai di Tier 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mulai dari Tier 1' })).toBeInTheDocument();
    const select = screen.getByLabelText('Pilih Tier lain');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Pilih Tier', 'Tier 2: Bridge to Academic']);
    expect(screen.getByText('Ini rekomendasi latihan, bukan penilaian resmi.')).toBeInTheDocument();
  });

  it('terapkan rekomendasi: konfirmasi menyebut Tier yang dilewati, POST apply, Toast, ke /peta', async () => {
    const calls = mockFetch((url, init) => (url.pathname === '/api/v1/placement/apply' && init.method === 'POST' ? json(applyOk) : json({}, 404)));
    const { toast } = await import('sonner');
    renderWithProviders(<PlacementResultView attemptId={ATTEMPT_ID} placement={placement()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai di Tier 3' }));
    expect(screen.getByText('Mulai di Tier 3?')).toBeInTheDocument();
    expect(screen.getByText('Tier 1 dan 2 akan ditandai Dilewati.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/peta'));
    expect(calls[0]!.json).toEqual({ attempt_id: ATTEMPT_ID, tier_number: 3 });
    expect(toast.success).toHaveBeenCalledWith('Tier awal Anda: Tier 3');
  });

  it('Mulai dari Tier 1: tidak ada Tier yang dilewati; Batal tidak memanggil API', async () => {
    const calls = mockFetch((url, init) => (init.method === 'POST' ? json({ data: { ...applyOk.data, tier_number: 1, skipped_tiers: [] } }) : json({}, 404)));
    renderWithProviders(<PlacementResultView attemptId={ATTEMPT_ID} placement={placement()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai dari Tier 1' }));
    expect(screen.getByText('Tidak ada Tier yang dilewati.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai dari Tier 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
    await waitFor(() => expect(calls[0]!.json).toEqual({ attempt_id: ATTEMPT_ID, tier_number: 1 }));
  });

  it('Pilih Tier lain (di antara): konfirmasi menyebut Tier 1 dilewati', async () => {
    const calls = mockFetch((url, init) => (init.method === 'POST' ? json({ data: { ...applyOk.data, tier_number: 2, skipped_tiers: [1] } }) : json({}, 404)));
    renderWithProviders(<PlacementResultView attemptId={ATTEMPT_ID} placement={placement()} />);
    fireEvent.change(screen.getByLabelText('Pilih Tier lain'), { target: { value: '2' } });
    expect(screen.getByText('Mulai di Tier 2?')).toBeInTheDocument();
    expect(screen.getByText('Tier 1 akan ditandai Dilewati.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
    await waitFor(() => expect(calls[0]!.json).toEqual({ attempt_id: ATTEMPT_ID, tier_number: 2 }));
  });

  it('rekomendasi Tier 1: tanpa tombol Tier 1 kedua dan tanpa pilihan lain', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<PlacementResultView attemptId={ATTEMPT_ID} placement={placement({ recommended_tier: 1, tier_options: tierOptions.slice(0, 1), correct_count: 3 })} />);
    expect(screen.getByRole('button', { name: 'Mulai di Tier 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mulai dari Tier 1' })).toBeNull();
    expect(screen.queryByLabelText('Pilih Tier lain')).toBeNull();
  });

  it('PLACEMENT_ALREADY_APPLIED: pesan galat dan tombol diganti tautan ke Peta', async () => {
    mockFetch((url, init) => (init.method === 'POST' ? json(errorBody('PLACEMENT_ALREADY_APPLIED', 'x'), 409) : json({}, 404)));
    renderWithProviders(<PlacementResultView attemptId={ATTEMPT_ID} placement={placement()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai di Tier 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tier awal dari Placement Test sudah diterapkan.');
    expect(screen.getByRole('link', { name: 'Buka Peta Belajar' })).toHaveAttribute('href', '/peta');
    expect(screen.queryByRole('button', { name: 'Mulai di Tier 3' })).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('TIER_ABOVE_RECOMMENDATION ditampilkan apa adanya dari kamus; tombol tetap tersedia', async () => {
    mockFetch((url, init) => (init.method === 'POST' ? json(errorBody('TIER_ABOVE_RECOMMENDATION', 'x'), 409) : json({}, 404)));
    renderWithProviders(<PlacementResultView attemptId={ATTEMPT_ID} placement={placement()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai di Tier 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tier awal tidak boleh lebih tinggi dari rekomendasi.');
    expect(screen.getByRole('button', { name: 'Mulai di Tier 3' })).toBeInTheDocument();
  });

  it('sudah diterapkan (applied=true dari server): tanpa tombol pilih', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<PlacementResultView attemptId={ATTEMPT_ID} placement={placement({ applied: true })} />);
    expect(screen.getByText('Tier awal dari Placement Test ini sudah diterapkan.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mulai di Tier/ })).toBeNull();
  });

  it('skippedTiersText: 1, 2, dan 3 Tier', () => {
    expect(skippedTiersText(1)).toBeNull();
    expect(skippedTiersText(2)).toBe('Tier 1');
    expect(skippedTiersText(3)).toBe('Tier 1 dan 2');
    expect(skippedTiersText(4)).toBe('Tier 1, 2, dan 3');
  });
});

describe('ExamResultView untuk Placement', () => {
  const withPlacement = (p: unknown): AttemptResult => {
    const base = makeResult();
    return { ...base, attempt: { ...base.attempt, id: ATTEMPT_ID, assessment_type: 'PLACEMENT_TEST', passed: null }, review: null, per_skill: [], placement: p };
  };

  it('blok placement memakai tampilan Placement', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamResultView result={withPlacement(placement())} />);
    expect(screen.getByRole('heading', { name: 'Rekomendasi: Mulai di Tier 3' })).toBeInTheDocument();
  });

  it('blok placement tidak sesuai kontrak: galat, bukan hasil generik', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamResultView result={withPlacement({ recommended_tier: 9 })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Hasil Placement tidak sesuai kontrak');
  });
});

describe('Intro Placement', () => {
  const intro = (over: Partial<ExamIntroData> = {}): ExamIntroData => ({
    assessment_set_id: SET,
    assessment_type: 'PLACEMENT_TEST',
    title: 'Placement Test',
    scope: { kind: 'TIER_PLACEMENT', id: null, label: 'Penentuan Tier awal' },
    time_limit_seconds: 1500,
    question_count: 25,
    threshold: null,
    rules: ['Soal menyesuaikan jawaban Anda.', 'Tidak ada pembahasan dan Anda tidak dapat kembali ke soal sebelumnya.'],
    available: true,
    blocked_reason: null,
    cooldown: { next_allowed_at: null, attempts_in_window: 0, max_attempts: 1 },
    active_attempt_id: null,
    requires_audio: false,
    requires_microphone: false,
    boss: null,
    placement: { adaptive: true, question_count: 25 },
    ...over,
  });

  it('aturan Placement, ringkasan 25 soal - 25 menit, tanpa banner ambang; Mulai Ujian memanggil POST /attempts', async () => {
    const calls = mockFetch((url, init) => (url.pathname === '/api/v1/attempts' && init.method === 'POST' ? json({ data: placementAttempt() }, 201) : json({}, 404)));
    renderWithProviders(<ExamIntroView intro={intro()} />);
    expect(screen.getByText('Penentuan Tier awal')).toBeInTheDocument();
    expect(screen.getByText('25 soal - 25 menit')).toBeInTheDocument();
    expect(screen.getByText('Soal menyesuaikan jawaban Anda.')).toBeInTheDocument();
    expect(screen.queryByText(/membuka level berikutnya/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Ujian' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/ujian/${ATTEMPT_ID}`));
    expect(calls[0]!.json).toEqual({ assessment_set_id: SET });
  });

  it.each<[ExamIntroData['blocked_reason'], string]>([
    ['ALREADY_COMPLETED', 'Placement Test hanya dapat diikuti satu kali dan sudah selesai.'],
    ['PROGRESS_EXISTS', 'Placement Test hanya untuk akun tanpa progres belajar.'],
  ])('%s: tombol disabled dengan alasan', (reason, text) => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamIntroView intro={intro({ available: false, blocked_reason: reason })} />);
    expect(screen.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('RESULT_PENDING_APPLY: alasan dan tautan ke Beranda', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamIntroView intro={intro({ available: false, blocked_reason: 'RESULT_PENDING_APPLY' })} />);
    expect(screen.getByText('Hasil Placement Anda menunggu. Buka Beranda untuk memilih Tier awal.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ke Beranda' })).toHaveAttribute('href', '/');
  });

  it('409 PLACEMENT_NOT_AVAILABLE saat mulai: Dialog', async () => {
    mockFetch(() => json(errorBody('PLACEMENT_NOT_AVAILABLE', 'x', [{ path: '', code: 'PROGRESS_EXISTS', message: 'x' }]), 409));
    renderWithProviders(<ExamIntroView intro={intro()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Ujian' }));
    expect(await screen.findByText('Placement Test tidak tersedia untuk akun ini.')).toBeInTheDocument();
  });
});
