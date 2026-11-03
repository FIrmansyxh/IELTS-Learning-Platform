import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attempt } from '@/contracts/attempts';
import { renderWithProviders } from '@/components/test-utils';
import { ApiError } from '@/lib/api/client';
import { attemptsApi } from '@/lib/api/attempts';
import { ActiveDrill, resolveStartIndex } from './active-drill';
import { DrillResult } from './drill-result';
import { makeAttempt, makeResult, Q } from './fixtures';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/api/attempts', () => ({
  attemptsApi: { start: vi.fn(), get: vi.fn(), answer: vi.fn(), submit: vi.fn(), result: vi.fn() },
}));

const api = vi.mocked(attemptsApi);

const fb = (ok: boolean) => ({
  is_correct: ok,
  score: ok ? 1 : 0,
  max_score: 1,
  correct_answer: { display: ['The beans are ground in a grinder.'] },
  explanation_id: "Bentuk V3 dari 'grind' adalah 'ground'.",
});

function drill(attempt: Attempt, extra: Partial<React.ComponentProps<typeof ActiveDrill>> = {}) {
  const onFinished = vi.fn();
  const onIndexChange = vi.fn();
  const ui = renderWithProviders(<ActiveDrill attempt={attempt} onFinished={onFinished} onIndexChange={onIndexChange} {...extra} />);
  return { ...ui, onFinished, onIndexChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('ActiveDrill', () => {
  it('Periksa dinonaktifkan sampai ada jawaban, lalu menampilkan umpan balik, lalu Lanjut', async () => {
    api.answer.mockResolvedValue({ question_id: 'Q-01', saved: true, answered_count: 1, feedback: fb(true), next_question: null });
    drill(makeAttempt([Q.mcq, Q.fill]));
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 1 dari 2');
    const check = screen.getByRole('button', { name: 'Periksa' });
    expect(check).toBeDisabled();
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    expect(check).toBeEnabled();
    fireEvent.click(check);
    expect(await screen.findByText('Benar!')).toBeInTheDocument();
    expect(api.answer).toHaveBeenCalledWith('9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a', 'Q-01', { option_ids: ['ok7f2q'] });
    // Klien tidak mengirim skor/kebenaran/waktu.
    expect(Object.keys(api.answer.mock.calls[0]![2] as object)).toEqual(['option_ids']);
    expect(screen.getByText("Bentuk V3 dari 'grind' adalah 'ground'.")).toBeInTheDocument();
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 2 dari 2');
  });

  it('jawaban salah menampilkan "Kurang tepat", jawaban benar, dan pembahasan', async () => {
    api.answer.mockResolvedValue({ question_id: 'Q-01', saved: true, answered_count: 1, feedback: fb(false), next_question: null });
    drill(makeAttempt([Q.mcq]));
    fireEvent.click(screen.getAllByRole('radio')[3]!);
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    expect(await screen.findByText('Kurang tepat')).toBeInTheDocument();
    expect(screen.getAllByText('The beans are ground in a grinder.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Lihat Hasil' })).toBeInTheDocument();
  });

  it('soal terakhir: "Lihat Hasil" memanggil submit dan menyerahkan hasil server', async () => {
    api.answer.mockResolvedValue({ question_id: 'Q-05', saved: true, answered_count: 1, feedback: fb(true), next_question: null });
    const result = makeResult();
    api.submit.mockResolvedValue(result);
    const { onFinished } = drill(makeAttempt([Q.fill]));
    fireEvent.change(screen.getByLabelText('Jawaban Anda'), { target: { value: 'are sorted' } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    await screen.findByText('Benar!');
    fireEvent.click(screen.getByRole('button', { name: 'Lihat Hasil' }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(result));
    expect(api.submit).toHaveBeenCalledTimes(1);
  });

  it('kegagalan jaringan saat Periksa: tidak maju, jawaban tetap, bisa dicoba lagi', async () => {
    api.answer.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'x' }));
    api.answer.mockResolvedValueOnce({ question_id: 'Q-01', saved: true, answered_count: 1, feedback: fb(true), next_question: null });
    drill(makeAttempt([Q.mcq, Q.fill]));
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    await waitFor(() => expect(api.answer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Periksa' })).toBeEnabled());
    expect(screen.queryByText('Benar!')).toBeNull();
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    expect(await screen.findByText('Benar!')).toBeInTheDocument();
  });

  it('ATTEMPT_EXPIRED membuka dialog "Waktu habis" lalu ke hasil', async () => {
    api.answer.mockRejectedValue(new ApiError({ status: 409, code: 'ATTEMPT_EXPIRED', message: 'x' }));
    const result = makeResult();
    api.result.mockResolvedValue(result);
    const { onFinished } = drill(makeAttempt([Q.mcq]));
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    expect(await screen.findByText('Waktu habis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lihat hasil' }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(result));
  });

  it('soal AI tidak memblokir: langsung bisa Lanjut tanpa memanggil answer', () => {
    drill(makeAttempt([Q.writing, Q.fill]));
    expect(screen.getByText('Tugas dinilai AI. Kerjakan di Tab Terapkan.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 2 dari 2');
    expect(api.answer).not.toHaveBeenCalled();
  });

  it('resume: jawaban tersimpan dipulihkan; mulai di soal tak terjawab pertama / indeks q (dibatasi)', () => {
    const attempt = makeAttempt([Q.mcq, Q.fill, Q.tfng], {
      answered_count: 1,
      current_index: 1,
      answers: [{ question_id: 'Q-01', response: { option_ids: ['ok7f2q'] }, feedback: fb(true) }],
    });
    expect(resolveStartIndex(attempt, null)).toBe(1);
    expect(resolveStartIndex(attempt, 0)).toBe(0);
    expect(resolveStartIndex(attempt, 2)).toBe(1);
    expect(resolveStartIndex(makeAttempt([Q.mcq], { current_index: 1 }), 5)).toBe(0);
    drill(attempt, { startIndex: 0 });
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 1 dari 3');
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    expect(screen.getByText('Benar!')).toBeInTheDocument();
  });

  it('melaporkan indeks soal ke perekam posisi', () => {
    const { onIndexChange } = drill(makeAttempt([Q.writing, Q.fill]));
    expect(onIndexChange).toHaveBeenCalledWith(0, '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a');
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(onIndexChange).toHaveBeenLastCalledWith(1, '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a');
  });

  it('pintasan: tombol 2 memilih opsi kedua dan Enter memeriksa; dapat dimatikan', async () => {
    api.answer.mockResolvedValue({ question_id: 'Q-01', saved: true, answered_count: 1, feedback: fb(true), next_question: null });
    const { container } = drill(makeAttempt([Q.mcq]));
    const section = container.querySelector('section')!;
    fireEvent.keyDown(section, { key: '2' });
    expect(screen.getAllByRole('radio')[1]).toBeChecked();
    fireEvent.keyDown(section, { key: 'Enter' });
    await waitFor(() => expect(api.answer).toHaveBeenCalledWith(expect.anything(), 'Q-01', { option_ids: ['o3x9aw'] }));
  });

  it('pintasan dimatikan lewat preferensi', () => {
    window.localStorage.setItem('drill.shortcuts', 'off');
    const { container } = drill(makeAttempt([Q.mcq]));
    fireEvent.keyDown(container.querySelector('section')!, { key: '2' });
    for (const r of screen.getAllByRole('radio')) expect(r).not.toBeChecked();
  });

  it('fokus pindah ke kepala soal setelah Lanjut', () => {
    drill(makeAttempt([Q.writing, Q.fill]));
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(document.activeElement?.tagName).toBe('LEGEND');
    expect(document.activeElement).toHaveTextContent('Lengkapi');
  });
});

describe('DrillResult', () => {
  const noop = () => {};
  it('lulus: skor, status, terbuka, mahkota, tombol Sub-Modul Berikutnya', () => {
    renderWithProviders(<DrillResult result={makeResult()} questions={[Q.mcq, Q.fill]} onRetry={noop} retrying={false} onReviewMaterial={noop} />);
    expect(screen.getByTestId('score-percent')).toHaveTextContent('80%');
    expect(screen.getByText('Lulus')).toBeInTheDocument();
    expect(screen.getByText('Ambang lulus 75%')).toBeInTheDocument();
    expect(screen.getByText(/Terbuka: 2\.1\.4 Conditional Sentences/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sub-Modul Berikutnya' })).toHaveAttribute('href', '/belajar/2.1.4');
    expect(screen.getByRole('img', { name: /Mahkota Perak/ })).toBeInTheDocument();
    expect(screen.getByText('Tinjauan soal')).toBeInTheDocument();
  });

  it('gagal: pesan suportif, "Ulangi Latihan" primer dan "Tinjau Materi"', () => {
    const retry = vi.fn();
    const review = vi.fn();
    renderWithProviders(<DrillResult result={makeResult({ passed: false })} onRetry={retry} retrying={false} onReviewMaterial={review} />);
    expect(screen.getByText('Belum lulus')).toBeInTheDocument();
    expect(screen.getByText('Belum lulus. Coba ulangi setelah meninjau materi.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sub-Modul Berikutnya' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ulangi Latihan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tinjau Materi' }));
    expect(retry).toHaveBeenCalled();
    expect(review).toHaveBeenCalled();
  });

  it('ambang tepat 75% dianggap lulus sesuai data server (klien tidak menghitung ulang)', () => {
    const r = makeResult({ passed: true, score: 75 });
    renderWithProviders(<DrillResult result={r} onRetry={noop} retrying={false} onReviewMaterial={noop} />);
    expect(screen.getByText('Lulus')).toBeInTheDocument();
  });
});
