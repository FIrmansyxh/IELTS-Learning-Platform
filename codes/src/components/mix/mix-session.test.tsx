import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import type { AttemptResult } from '@/contracts/attempts';
import { MixResultView } from './mix-result';
import { MixSession } from './mix-session';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const ID = '5b3a8d52-0f0e-4f43-9d1c-77c1f9a1c0de';
const SET = '0a1b2c3d-0000-4000-8000-000000000001';

const base = {
  skill: 'GRAMMAR',
  points: 1,
  target_time_ms: null,
  passage_no: null,
  section_no: null,
  options: null,
  choose_count: null,
  fixed_choices: null,
  max_words: null,
  matching: null,
  segments: null,
  tokens: null,
  ai_task: null,
};

const GRAMMAR_Q = {
  ...base,
  question_id: 'Q-GRR-001',
  question_type: 'MCQ_SINGLE',
  bank_code: 'GT-GR-REGISTER',
  prompt: 'Pilih penutup surat formal yang tepat.',
  options: [
    { option_id: 'oa', text: 'Yours faithfully' },
    { option_id: 'ob', text: 'Cheers' },
  ],
};
const READING_Q = {
  ...base,
  skill: 'READING',
  question_id: 'Q-RD1-001',
  question_type: 'TFNG',
  bank_code: 'GT-RD-S1-EVERYDAY',
  passage_no: 1,
  passage_index: 0,
  prompt: 'The notice is about a fire drill.',
  fixed_choices: ['True', 'False', 'Not Given'],
};

function attempt(over: Record<string, unknown> = {}) {
  return {
    data: {
      id: ID,
      assessment_set_id: null,
      assessment_type: 'MIX_PRACTICE',
      mode: 'PRACTICE',
      status: 'IN_PROGRESS',
      title: 'Latihan campur',
      started_at: new Date().toISOString(),
      server_now: new Date().toISOString(),
      deadline_at: null,
      remaining_seconds: null,
      time_limit_seconds: 0,
      pass_percent: null,
      question_count: 2,
      answered_count: 0,
      current_index: 0,
      passage_markdown: null,
      passages: [{ passage_no: 1, bank_set_id: SET, markdown: '# Fire Drill Notice\n\n[A] All staff must leave by the north exit.' }],
      listening: null,
      questions: [GRAMMAR_Q, READING_Q],
      answers: [],
      resumed: false,
      ...over,
    },
  };
}

function result(over: Partial<AttemptResult> = {}): { data: AttemptResult } {
  return {
    data: {
      attempt: {
        id: ID,
        assessment_set_id: null,
        assessment_type: 'MIX_PRACTICE',
        mode: 'PRACTICE',
        status: 'GRADED',
        started_at: '2026-11-08T10:00:00.000Z',
        submitted_at: '2026-11-08T10:10:00.000Z',
        raw_score: 3,
        max_score: 4,
        score_percent: 75,
        pass_percent: null,
        passed: null,
        points_awarded: 0,
        band_score: null,
      },
      per_skill: [],
      review: null,
      progress: null,
      mix: {
        per_skill: [
          { skill: 'GRAMMAR', answered: 2, correct: 1, percent: 50 },
          { skill: 'READING', answered: 2, correct: 2, percent: 100 },
        ],
        per_question_type: [{ question_type: 'TFNG', answered: 2, correct: 2, percent: 100 }],
        ai_items: [
          { question_id: 'Q-W', skill: 'WRITING', submission_id: null, status: null },
          { question_id: 'Q-S', skill: 'SPEAKING', submission_id: '11111111-1111-4111-8111-111111111111', status: 'GRADING' },
        ],
        suggested_banks: [
          { bank_code: 'GT-GR-REGISTER', title: 'Grammar: register surat', bank_kind: 'GRAMMAR_GT_REGISTER', reason: 'SKILL_TERLEMAH' },
        ],
      },
      ...over,
    },
  };
}

const feedback = { is_correct: true, score: 1, max_score: 1, correct_answer: { display: ['Yours faithfully'] }, explanation_id: 'Penutup formal.' };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('MixSession', () => {
  it('memakai Active Drill: umpan balik instan, teks bacaan hanya untuk soal Reading, tanpa timer total, lalu hasil', async () => {
    const calls = mockFetch((url, init) => {
      if (url.pathname === `/api/v1/attempts/${ID}` && init.method !== 'PUT') return { body: attempt() };
      if (url.pathname.endsWith('/answers/Q-GRR-001')) {
        return { body: { data: { question_id: 'Q-GRR-001', saved: true, answered_count: 1, feedback, next_question: null } } };
      }
      if (url.pathname.endsWith('/answers/Q-RD1-001')) {
        return { body: { data: { question_id: 'Q-RD1-001', saved: true, answered_count: 2, feedback, next_question: null } } };
      }
      if (url.pathname.endsWith('/submit')) return { body: result() };
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<MixSession attemptId={ID} />);

    expect(await screen.findByText('Pilih penutup surat formal yang tepat.')).toBeInTheDocument();
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 1 dari 2');
    expect(screen.queryByTestId('mix-passage')).not.toBeInTheDocument();
    expect(screen.queryByRole('timer', { name: 'Sisa waktu latihan' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    expect(await screen.findByText('Benar!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));

    // Soal Reading: teks bacaan tampil utuh, tanpa pemisah.
    const passage = await screen.findByTestId('mix-passage');
    expect(within(passage).getByText('Fire Drill Notice')).toBeInTheDocument();
    expect(within(passage).getByText(/All staff must leave by the north exit/)).toBeInTheDocument();
    expect(passage.textContent).not.toContain('===PASSAGE===');

    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    await screen.findByText('Benar!');
    fireEvent.click(screen.getByRole('button', { name: 'Lihat Hasil' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Hasil latihan campur' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith('/submit') && c.init.method === 'POST')).toBe(true);
    // Jawaban dikirim hanya sebagai `response`.
    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(Object.keys(put.json as object)).toEqual(['response']);
  });

  it('teks bacaan dapat dilipat dengan tombol beraria-expanded', async () => {
    mockFetch(() => ({ body: attempt({ questions: [READING_Q], question_count: 1 }) }));
    renderWithProviders(<MixSession attemptId={ID} />);
    const toggle = await screen.findByRole('button', { name: /Teks bacaan/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('attempt selesai: memuat hasil dari /result', async () => {
    mockFetch((url) => {
      if (url.pathname.endsWith('/result')) return { body: result() };
      return { body: attempt({ status: 'GRADED' }) };
    });
    renderWithProviders(<MixSession attemptId={ID} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Hasil latihan campur' })).toBeInTheDocument();
  });

  it('attempt ABANDONED: pesan dihentikan (bukan galat hasil) dengan tautan kembali', async () => {
    mockFetch(() => ({ body: attempt({ status: 'ABANDONED' }) }));
    renderWithProviders(<MixSession attemptId={ID} />);
    expect(await screen.findByText('Sesi ini dihentikan karena Anda memulai sesi baru.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('404: pesan tidak ditemukan dengan tautan kembali', async () => {
    mockFetch(() => ({ status: 404, body: errorBody('NOT_FOUND', 'x') }));
    renderWithProviders(<MixSession attemptId={ID} />);
    expect(await screen.findByText('Sesi latihan tidak ditemukan.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Latihan campur' })).toHaveAttribute('href', '/latihan/campur');
  });

  it('galat server: peringatan dengan Coba lagi', async () => {
    mockFetch(() => ({ status: 400, body: errorBody('VALIDATION_ERROR', 'x') }));
    renderWithProviders(<MixSession attemptId={ID} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesi latihan gagal dimuat');
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('MixResultView', () => {
  it('menampilkan skor objektif, rincian per skill/tipe, item AI, disclaimer, dan saran bank; tanpa lulus/poin', () => {
    render(<MixResultView result={result().data} />);
    expect(screen.getByTestId('score-percent')).toHaveTextContent('75%');
    expect(screen.getByText('3 dari 4 poin')).toBeInTheDocument();
    expect(screen.getByText('Hasil per skill')).toBeInTheDocument();
    expect(screen.getByText('1 benar dari 2 soal')).toBeInTheDocument();
    expect(screen.getByText('True / False / Not Given')).toBeInTheDocument();

    expect(screen.getByText('Belum dikirim')).toBeInTheDocument();
    expect(screen.getByText('Menunggu penilaian')).toBeInTheDocument();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();

    const suggest = screen.getByRole('link', { name: 'Latih bank ini' });
    expect(suggest).toHaveAttribute('href', '/latihan/campur?bank=GT-GR-REGISTER');
    expect(screen.queryByText(/Lulus|Belum lulus|\+\d+ Poin/)).not.toBeInTheDocument();
    expect(screen.getByText('Latihan campur tidak memiliki batas lulus dan tidak menambah poin.')).toBeInTheDocument();
  });

  it('tanpa soal objektif yang dijawab: skor tidak ditampilkan', () => {
    const r = result();
    r.data.mix = { per_skill: [], per_question_type: [], ai_items: [], suggested_banks: [] };
    render(<MixResultView result={r.data} />);
    expect(screen.queryByTestId('score-percent')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tidak ada soal objektif yang dijawab');
  });

  it('status AI: dinilai, gagal', () => {
    const r = result();
    r.data.mix!.ai_items = [
      { question_id: 'a', skill: 'WRITING', submission_id: '11111111-1111-4111-8111-111111111111', status: 'GRADED' },
      { question_id: 'b', skill: 'SPEAKING', submission_id: '22222222-2222-4222-8222-222222222222', status: 'FAILED' },
    ];
    render(<MixResultView result={r.data} />);
    expect(screen.getByText('Sudah dinilai')).toBeInTheDocument();
    expect(screen.getByText('Penilaian gagal')).toBeInTheDocument();
  });

  it('fokus berpindah ke judul hasil', () => {
    render(<MixResultView result={result().data} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});
