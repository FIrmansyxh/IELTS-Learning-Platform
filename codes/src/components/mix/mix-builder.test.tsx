import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import { MixBuilder } from './mix-builder';

const push = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const ATTEMPT = '5b3a8d52-0f0e-4f43-9d1c-77c1f9a1c0de';

const BANKS = [
  {
    bank_code: 'GT-GR-REGISTER',
    bank_kind: 'GRAMMAR_GT_REGISTER',
    title: 'Grammar: register surat',
    skill: 'GRAMMAR',
    question_count: 16,
    question_types: [
      { question_type: 'MCQ_SINGLE', count: 12 },
      { question_type: 'ERROR_RECOGNITION', count: 4 },
    ],
    has_passage: false,
    selectable_in_mix: true,
  },
  {
    bank_code: 'GT-RD-S1-EVERYDAY',
    bank_kind: 'READING_GT_S1',
    title: 'Reading S1: Teks sehari-hari',
    skill: 'READING',
    question_count: 8,
    question_types: [
      { question_type: 'TFNG', count: 5 },
      { question_type: 'MCQ_SINGLE', count: 3 },
    ],
    has_passage: true,
    selectable_in_mix: true,
  },
  {
    bank_code: 'GT-WR-T2',
    bank_kind: 'WRITING_GT_T2',
    title: 'Writing Task 2',
    skill: 'WRITING',
    question_count: 9,
    question_types: [{ question_type: 'WRITING_TASK', count: 9 }],
    has_passage: false,
    selectable_in_mix: true,
  },
  {
    bank_code: 'GT-LS-S1',
    bank_kind: 'LISTENING_GT_S1',
    title: 'Listening S1',
    skill: 'LISTENING',
    question_count: 10,
    question_types: [{ question_type: 'MCQ_SINGLE', count: 10 }],
    has_passage: false,
    selectable_in_mix: false,
  },
];

const session = { data: { attempt_id: ATTEMPT, question_count: 10, mode: 'MANUAL', passage_count: 0, ai_item_count: 0 } };

const ACTIVE = { attempt_id: ATTEMPT, mode: 'MANUAL', question_count: 12, answered_count: 4, started_at: '2026-11-08T10:00:00.000Z' };

const NO_REVIEWS = { due_count: 0, scheduled_count: 0, mastered_count: 0, next_due_at: null };

function setup(opts: { banks?: unknown; mixStatus?: number; mixBody?: unknown; active?: unknown; reviews?: unknown } = {}) {
  return mockFetch((url, init) => {
    if (url.pathname === '/api/v1/banks') return { body: { data: opts.banks ?? BANKS } };
    if (url.pathname === '/api/v1/mix-sessions' && init.method === 'POST') {
      return { status: opts.mixStatus ?? 201, body: opts.mixBody ?? session };
    }
    if (url.pathname === '/api/v1/mix-sessions/active') return { body: { data: opts.active ?? null } };
    if (url.pathname === '/api/v1/me/reviews') return { body: { data: opts.reviews ?? NO_REVIEWS } };
    return { status: 404, body: errorBody('NOT_FOUND', 'x') };
  });
}

const postCalls = (calls: ReturnType<typeof mockFetch>) => calls.filter((c) => c.url.pathname === '/api/v1/mix-sessions');
const heading = () => screen.findByRole('heading', { level: 1, name: 'Latihan campur' });
const skillCard = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  search = '';
});

describe('MixBuilder', () => {
  it('memuat kerangka bertanda status, lalu kartu skill; Listening tidak menjadi kartu', async () => {
    setup();
    renderWithProviders(<MixBuilder />);
    expect(screen.getByRole('status', { name: 'Memuat...' })).toBeInTheDocument();
    await heading();
    for (const name of ['Grammar', 'Reading', 'Writing']) {
      expect(skillCard(name)).toHaveAttribute('aria-pressed', 'true');
    }
    expect(screen.queryByRole('button', { name: /^Listening/ })).not.toBeInTheDocument();
    // Bank tidak ditampilkan; Listening hanya diberi keterangan.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Listening belum tersedia di latihan campur')).toBeInTheDocument();
    // Skill tanpa bank dinonaktifkan dengan keterangan.
    expect(skillCard('Vocabulary')).toBeDisabled();
    expect(screen.getAllByText('Belum ada bank').length).toBeGreaterThan(0);
  });

  it('kosong: pesan "Belum ada bank soal" tanpa tombol mulai', async () => {
    setup({ banks: [] });
    renderWithProviders(<MixBuilder />);
    expect(await screen.findByText('Belum ada bank soal. Tambahkan lewat berkas konten.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mulai latihan' })).not.toBeInTheDocument();
  });

  it('hanya bank Listening dianggap kosong', async () => {
    setup({ banks: [BANKS[3]] });
    renderWithProviders(<MixBuilder />);
    expect(await screen.findByText(/Belum ada bank soal/)).toBeInTheDocument();
  });

  it('galat memuat: peringatan dengan tombol Coba lagi yang memuat ulang', async () => {
    let n = 0;
    mockFetch((url) => {
      if (url.pathname === '/api/v1/banks') {
        n += 1;
        return n === 1 ? { status: 400, body: errorBody('VALIDATION_ERROR', 'x') } : { body: { data: BANKS } };
      }
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<MixBuilder />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Bank soal gagal dimuat');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await heading();
  });

  it('ramah pengguna: preset kesulitan, penjelasan tipe terpilih, dan ringkasan sesi', async () => {
    setup();
    renderWithProviders(<MixBuilder />);
    await heading();
    const summary = screen.getByRole('complementary', { name: 'Ringkasan sesi' });
    expect(summary).toHaveTextContent('Semua tipe');
    fireEvent.click(screen.getByRole('button', { name: 'Sulit' }));
    expect(screen.getByTestId('mix-difficulty-range')).toHaveTextContent('4 sampai 5');
    expect(screen.getByRole('button', { name: 'Sulit' })).toHaveAttribute('aria-pressed', 'true');
    expect(summary).toHaveTextContent('4 sampai 5');
    fireEvent.click(screen.getByRole('button', { name: /^Pilihan ganda/ }));
    expect(screen.getByTestId('mix-type-help')).toHaveTextContent('Pilih satu jawaban benar');
    expect(summary).toHaveTextContent('Pilihan ganda');
  });

  it('MANUAL: mengirim skill, chip tipe, kesulitan, dan jumlah otomatis; tanpa user_id atau skor; lalu membuka sesi', async () => {
    const calls = setup();
    renderWithProviders(<MixBuilder />);
    await heading();
    fireEvent.click(skillCard('Reading'));
    fireEvent.click(skillCard('Writing'));
    fireEvent.click(screen.getByRole('button', { name: /^Pilihan ganda/ }));
    fireEvent.change(screen.getByRole('slider', { name: 'Kesulitan terendah' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Kesulitan tertinggi' }), { target: { value: '4' } });
    expect(screen.getByTestId('mix-difficulty-range')).toHaveTextContent('2 sampai 4');
    fireEvent.click(screen.getByRole('button', { name: 'Mulai latihan' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/latihan/campur/${ATTEMPT}`));
    expect(postCalls(calls)[0]!.json).toEqual({
      count: 10,
      mode: 'MANUAL',
      skills: ['GRAMMAR'],
      question_types: ['MCQ_SINGLE'],
      difficulty_min: 2,
      difficulty_max: 4,
    });
  });

  it('?bank= (saran dari hasil) memilih bank itu dan skill-nya saja, dapat dilepas', async () => {
    search = 'bank=GT-RD-S1-EVERYDAY';
    setup();
    renderWithProviders(<MixBuilder />);
    await heading();
    expect(skillCard('Reading')).toHaveAttribute('aria-pressed', 'true');
    expect(skillCard('Grammar')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('complementary', { name: 'Ringkasan sesi' })).toHaveTextContent('Reading');
    fireEvent.click(screen.getByRole('button', { name: 'Lepas' }));
    expect(screen.queryByRole('button', { name: 'Lepas' })).not.toBeInTheDocument();
  });

  it('Campur otomatis: mode AUTO_WEAKNESS hanya dengan count', async () => {
    const calls = setup({ mixBody: { data: { ...session.data, mode: 'AUTO_WEAKNESS' } } });
    renderWithProviders(<MixBuilder />);
    await heading();
    fireEvent.click(screen.getByRole('button', { name: 'Campur otomatis (fokus kelemahan)' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(postCalls(calls)[0]!.json).toEqual({ count: 10, mode: 'AUTO_WEAKNESS' });
  });

  it('tanpa skill terpilih: tombol Mulai nonaktif dengan pesan', async () => {
    setup();
    renderWithProviders(<MixBuilder />);
    await heading();
    for (const n of ['Grammar', 'Reading', 'Writing']) fireEvent.click(skillCard(n));
    expect(screen.getByRole('button', { name: 'Mulai latihan' })).toBeDisabled();
    expect(screen.getByText('Pilih minimal satu skill.')).toBeInTheDocument();
  });

  it('MIX_NOT_ENOUGH_QUESTIONS: pesan "Hanya N soal tersedia" dan jumlah otomatis turun ke N', async () => {
    setup({
      mixStatus: 422,
      mixBody: errorBody('MIX_NOT_ENOUGH_QUESTIONS', 'x', [
        { path: 'count', code: 'max_available:7', message: 'Hanya 7 soal tersedia untuk filter ini.' },
      ]),
    });
    renderWithProviders(<MixBuilder />);
    await heading();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai latihan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hanya 7 soal tersedia untuk pilihan ini.');
    expect(screen.getByRole('complementary', { name: 'Ringkasan sesi' })).toHaveTextContent('7 soal');
    expect(push).not.toHaveBeenCalled();
  });

  it('kapasitas klien kurang dari 5: pesan jelas dan tombol Mulai nonaktif', async () => {
    setup({ banks: [BANKS[2]] }); // hanya Writing: kapasitas efektif 1
    renderWithProviders(<MixBuilder />);
    await heading();
    expect(screen.getByRole('alert')).toHaveTextContent('Soal belum cukup');
    expect(screen.getByRole('button', { name: 'Mulai latihan' })).toBeDisabled();
  });

  it('galat server saat memulai: Toast dengan aksi Coba lagi', async () => {
    const { toast } = await import('sonner');
    setup({ mixStatus: 500, mixBody: errorBody('INTERNAL_ERROR', 'x') });
    renderWithProviders(<MixBuilder />);
    await heading();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai latihan' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const opts = vi.mocked(toast.error).mock.calls[0]![1] as { action: { label: string } };
    expect(opts.action.label).toBe('Coba lagi');
  });

  it('sesi aktif: banner Lanjutkan dan konfirmasi sebelum memulai sesi baru', async () => {
    const calls = setup({ active: ACTIVE });
    renderWithProviders(<MixBuilder />);
    expect(await screen.findByText('Sesi latihan campur belum selesai')).toBeInTheDocument();
    expect(screen.getByText('4 dari 12 soal sudah dijawab.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lanjutkan sesi' })).toHaveAttribute('href', `/latihan/campur/${ATTEMPT}`);

    fireEvent.click(screen.getByRole('button', { name: 'Mulai latihan' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Mulai sesi baru?');
    expect(postCalls(calls)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postCalls(calls)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Mulai latihan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mulai sesi baru' }));
    await waitFor(() => expect(postCalls(calls)).toHaveLength(1));
  });

  it('tanpa sesi aktif: tidak ada banner dan Mulai langsung membuat sesi tanpa dialog', async () => {
    const calls = setup();
    renderWithProviders(<MixBuilder />);
    await heading();
    expect(screen.queryByText('Sesi latihan campur belum selesai')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai latihan' }));
    await waitFor(() => expect(postCalls(calls)).toHaveLength(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Ulangi soal yang salah (SPEC-026)', () => {
  it('belum ada jadwal: kartu menjelaskan sumbernya dan tanpa tombol ulang', async () => {
    setup();
    renderWithProviders(<MixBuilder />);
    await heading();
    expect(await screen.findByTestId('review-card')).toHaveTextContent('Ulangi soal yang salah');
    expect(screen.getByTestId('review-card')).toHaveTextContent('Belum ada soal untuk diulang');
    expect(screen.queryByRole('button', { name: /^Ulangi \d+ soal/ })).not.toBeInTheDocument();
  });

  it('ada soal jatuh tempo: tombol memulai sesi REVIEW_DUE dengan batas 20 soal', async () => {
    const calls = setup({ reviews: { due_count: 27, scheduled_count: 30, mastered_count: 4, next_due_at: null } });
    renderWithProviders(<MixBuilder />);
    await heading();
    expect(await screen.findByTestId('review-due')).toHaveTextContent('27 soal jatuh tempo');
    fireEvent.click(screen.getByRole('button', { name: 'Ulangi 20 soal' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/latihan/campur/${ATTEMPT}`));
    expect(postCalls(calls)[0]!.json).toEqual({ count: 20, mode: 'REVIEW_DUE' });
  });

  it('terjadwal tetapi belum jatuh tempo: tombol nonaktif dan menampilkan jatuh tempo berikutnya', async () => {
    setup({ reviews: { due_count: 0, scheduled_count: 3, mastered_count: 0, next_due_at: '2026-11-12T08:00:00.000Z' } });
    renderWithProviders(<MixBuilder />);
    await heading();
    expect(await screen.findByRole('button', { name: 'Ulangi 0 soal' })).toBeDisabled();
    expect(screen.getByTestId('review-card')).toHaveTextContent('Soal berikutnya jatuh tempo');
  });
});
