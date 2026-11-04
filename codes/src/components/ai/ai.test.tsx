import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import { aiApi } from '@/lib/api/ai';
import { clearExamStorage } from '@/lib/reading/storage';
import { AiJobStatus } from './ai-job-status';
import { EvaluationCard } from './evaluation-card';
import { AI_STATUS, FLAGS, QUOTA, SUBMODULE_ID, SUB_ID, TEXT, graded, makeEvaluation, makeJob, makeRecording, makeSubmission } from './fixtures';
import { RecordingControls } from './recording-controls';
import { RecordingPrefsCard } from './recording-prefs-card';
import { SpeakingTask } from './speaking-task';
import { SubmissionHistory } from './submission-history';
import { WritingTask } from './writing-task';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m), info: vi.fn() } }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  // Radix Select/Tooltip membutuhkan API yang tidak ada di jsdom.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  window.localStorage.clear();
  toastError.mockReset();
});

const ME = { ...USER, consent_recording_at: '2026-11-01T08:00:00.000Z' };
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

function serve(extra: (url: URL, init: RequestInit) => Reply | null, opts: { status?: unknown; me?: unknown } = {}) {
  return mockFetch((url, init) => {
    const e = extra(url, init);
    if (e) return e;
    if (url.pathname === '/api/v1/ai/status') return { body: { data: opts.status ?? AI_STATUS } };
    if (url.pathname === '/api/v1/auth/me') return { body: { data: { user: opts.me ?? ME } } };
    return { status: 404, body: errorBody('NOT_FOUND', 'Data tidak ditemukan.') };
  });
}

const FIVE = 'one two three four five';
const DRAFT_KEY = `draft:v1:${USER.id}:${SUBMODULE_ID}:mini`;
const SUB_KEY = `ai-sub:v1:${USER.id}:${SUBMODULE_ID}:mini`;
const SUB_KEY_SPEAKING = `ai-sub:v1:${USER.id}:${SUBMODULE_ID}:mini-speaking`;

/* ---------------------------------------------------------------- EvaluationCard */
describe('EvaluationCard', () => {
  const renderCard = (ev = makeEvaluation(), text: string | null = TEXT, kind: 'MINI_TASK_WRITING' | 'SPEAKING_PART2' = 'MINI_TASK_WRITING', min?: number) =>
    render(
      <TooltipProvider>
        <EvaluationCard evaluation={ev} kind={kind} responseText={text} minWords={min} />
      </TooltipProvider>,
    );

  it('menampilkan band, disclaimer, 4 kriteria, kekuatan, saran, dan rewrite Band 7', () => {
    renderCard();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
    expect(screen.getAllByText('6,0').length).toBeGreaterThan(0);
    const rows = screen.getAllByTestId('criterion-row');
    expect(rows).toHaveLength(4);
    expect(within(rows[2]!).getByText('Lexical Resource')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Variasi kosakata masih terbatas.')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Struktur pasif Present Simple tepat.')).toBeInTheDocument();
    expect(screen.getByText('Tambahkan keterangan tempat atau alat untuk variasi.')).toBeInTheDocument();
    expect(screen.getByTestId('band7-rewrite')).toHaveTextContent('First, limestone is harvested');
  });

  it('anotasi inline pada kemunculan pertama + diff Hapus/Tambah dengan teks (bukan warna saja)', () => {
    renderCard();
    const ann = screen.getByTestId('annotation');
    expect(ann).toHaveTextContent('it is crushed into powder by a crusher');
    expect(ann).toHaveAttribute('tabindex', '0');
    const diff = screen.getByTestId('band7-diff');
    expect(within(diff).getByText('Hapus:')).toBeInTheDocument();
    expect(within(diff).getByText('Tambah:')).toBeInTheDocument();
    expect(within(diff).getByText('it is ground into fine powder in a crusher')).toBeInTheDocument();
    expect(screen.queryByTestId('unmatched-corrections')).not.toBeInTheDocument();
  });

  it('koreksi yang tidak ditemukan tampil di daftar Koreksi', () => {
    renderCard(makeEvaluation({ corrections: [{ original: 'tidak ada di teks', improved: 'perbaikan', reason_id: 'alasan' }] }));
    expect(screen.queryByTestId('annotation')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('unmatched-corrections')).getByText('perbaikan')).toBeInTheDocument();
  });

  it('teks AI dirender literal: tidak ada elemen script atau HTML di DOM', () => {
    const evil = '<script>alert(1)</script>';
    const { container } = renderCard(
      makeEvaluation({
        strengths_id: [evil],
        band7_rewrite: `<img src=x onerror=alert(1)> ${evil}`,
        criteria: [{ key: 'task_response', name: 'Task Response', band: 6, comment_id: evil }],
        corrections: [{ original: 'x', improved: evil, reason_id: evil }],
      }),
      `${evil} x`,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText(evil, { exact: false }).length).toBeGreaterThan(0);
  });

  it('banner bendera: injeksi, kap panjang dengan min kata, bukan Inggris, band tinggi', () => {
    renderCard(
      makeEvaluation({
        flags: { ...FLAGS, injection_suspected: true, score_capped: true, cap_reason: 'word_count', non_english_suspected: true, high_band_capped: true },
      }),
      TEXT,
      'MINI_TASK_WRITING',
      250,
    );
    expect(screen.getByText('Tulisan mengandung pola instruksi ke penilai. Skor ini tidak dihitung ke radar dan prediksi band.')).toBeInTheDocument();
    expect(screen.getByText('Skor dibatasi karena tulisan kurang dari 250 kata.')).toBeInTheDocument();
    expect(screen.getByText('Tulisan terdeteksi bukan bahasa Inggris.')).toBeInTheDocument();
    expect(screen.getByText('Skor tertinggi yang dapat diberikan penilai lokal dibatasi 7.5.')).toBeInTheDocument();
  });

  it('penilaian sendiri: Badge, tanpa komentar, tanpa panel Band 7', () => {
    renderCard(
      makeEvaluation({
        method: 'SELF_ASSESSMENT',
        criteria: [{ key: 'task_response', name: 'Task Response', band: 6, comment_id: null }],
        strengths_id: [],
        improvements_id: [],
        corrections: [],
        band7_rewrite: null,
        task_requirement_met: null,
        model_name: null,
      }),
    );
    expect(screen.getByText('Penilaian sendiri')).toBeInTheDocument();
    expect(screen.getByText('Tanpa komentar (penilaian sendiri).')).toBeInTheDocument();
    expect(screen.queryByTestId('band7-diff')).not.toBeInTheDocument();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
  });

  it('Speaking: transkrip, Badge Pronunciation diperkirakan, banner kualitas audio', () => {
    renderCard(
      makeEvaluation({
        criteria: [
          { key: 'fluency', name: 'Fluency & Coherence', band: 6, comment_id: 'a' },
          { key: 'lexical', name: 'Lexical Resource', band: 6, comment_id: 'b' },
          { key: 'grammar', name: 'Grammatical Range & Accuracy', band: 6, comment_id: 'c' },
          { key: 'pronunciation', name: 'Pronunciation', band: 5.5, comment_id: 'd' },
        ],
        flags: { ...FLAGS, pronunciation_estimated: true, low_audio_quality: true },
      }),
      'I like to visit the park.',
      'SPEAKING_PART2',
    );
    expect(screen.getByTestId('pron-badge')).toHaveTextContent('Pronunciation diperkirakan');
    expect(screen.getByTestId('transcript')).toHaveTextContent('I like to visit the park.');
    expect(screen.getByText('Kualitas rekaman rendah; hasil kurang akurat.')).toBeInTheDocument();
    expect(screen.getAllByTestId('criterion-row')).toHaveLength(4);
    expect(screen.queryByTestId('annotated-text')).not.toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------- AiJobStatus */
describe('AiJobStatus', () => {
  it('Antre menampilkan posisi dan estimasi; live region polite', () => {
    render(<AiJobStatus submission={makeSubmission({ job: makeJob({ queue_position: 3 }) })} estimatedWaitSec={90} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Antre - posisi 3');
    expect(screen.getByText('Perkiraan tunggu sekitar 90 detik.')).toBeInTheDocument();
    expect(screen.getByTestId('ai-job-status')).toHaveAttribute('data-phase', 'queue');
  });

  it('Memproses menampilkan bar tak-terbatas dan teks perkiraan 10-60 detik', () => {
    render(
      <AiJobStatus
        submission={makeSubmission({ status: 'GRADING', job: makeJob({ status: 'RUNNING', stage: 'GRADING', queue_position: null }) })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Menilai jawaban');
    expect(screen.getByText('Biasanya 10-60 detik, bisa beberapa menit pada perangkat tanpa GPU.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });

  it('Speaking dua tahap: STT lalu penilaian', () => {
    const { rerender } = render(
      <AiJobStatus
        submission={makeSubmission({
          kind: 'SPEAKING_PART2',
          status: 'TRANSCRIBING',
          job: makeJob({ kind: 'STT_TRANSCRIBE', status: 'RUNNING', stage: 'TRANSCRIBING', queue_position: null }),
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Mengubah suara menjadi teks');
    expect(screen.getByText('Suara ke teks').closest('li')).toHaveAttribute('aria-current', 'step');
    rerender(
      <AiJobStatus
        submission={makeSubmission({
          kind: 'SPEAKING_PART2',
          status: 'GRADING',
          job: makeJob({ kind: 'GRADE_SPEAKING', status: 'RUNNING', stage: 'GRADING', queue_position: null }),
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Menilai jawaban');
    expect(screen.getByText('Menilai', { selector: 'li' })).toHaveAttribute('aria-current', 'step');
  });
});

/* ---------------------------------------------------------------- WritingTask */
describe('WritingTask (Mini-Task)', () => {
  // Sesi pengguna sudah di-cache (seperti di AuthGate) agar kunci draf terikat-user langsung tersedia.
  const renderMini = (onGraded?: () => void) => {
    const r = renderWithProviders(<WritingTask context={{ type: 'mini', subModuleId: SUBMODULE_ID }} prompt="Ubah 3 tahapan aktif menjadi pasif." onGraded={onGraded} />);
    act(() => {
      r.client.setQueryData(['me'], ME);
    });
    return r;
  };
  const area = () => screen.getByLabelText('Tulisan Anda dalam bahasa Inggris') as HTMLTextAreaElement;

  it('hitung kata live, tombol nonaktif sampai minimal 5 kata, spellcheck mati', async () => {
    serve(() => null);
    renderMini();
    expect(area()).toHaveAttribute('spellcheck', 'false');
    const send = screen.getByRole('button', { name: 'Kirim untuk Dinilai' });
    expect(send).toBeDisabled();
    fireEvent.change(area(), { target: { value: 'one two three' } });
    expect(screen.getByTestId('word-counter')).toHaveTextContent('3 kata');
    expect(screen.getByTestId('writing-send-note')).toHaveTextContent('Tulisan terlalu pendek. Minimal 5 kata.');
    expect(send).toBeDisabled();
    fireEvent.change(area(), { target: { value: FIVE } });
    expect(screen.getByTestId('word-counter')).toHaveTextContent('5 kata');
    expect(send).toBeEnabled();
  });

  it('kirim -> konfirmasi -> Antre -> hasil EvaluationCard; body persis kontrak; onGraded sekali', async () => {
    let polls = 0;
    const calls = serve((url, init) => {
      if (url.pathname === '/api/v1/submissions/writing' && init.method === 'POST') {
        return { status: 202, body: { data: { submission: makeSubmission(), quota: QUOTA } } };
      }
      if (url.pathname === `/api/v1/submissions/${SUB_ID}`) {
        polls += 1;
        return { body: { data: { submission: graded() } } };
      }
      return null;
    });
    const onGraded = vi.fn();
    renderMini(onGraded);
    fireEvent.change(area(), { target: { value: TEXT } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim untuk Dinilai' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText('Kirim tulisan ini?')).toBeInTheDocument();
    expect(within(dlg).getByText('Anda tidak dapat mengubahnya setelah dikirim.')).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Kirim' }));

    expect(await screen.findByTestId('evaluation-card')).toBeInTheDocument();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
    expect(screen.getAllByTestId('criterion-row')).toHaveLength(4);
    expect(screen.getByTestId('annotation')).toBeInTheDocument();

    const post = calls.find((c) => c.url.pathname === '/api/v1/submissions/writing');
    expect(post?.json).toEqual({ kind: 'MINI_TASK_WRITING', sub_module_id: SUBMODULE_ID, response_text: TEXT });
    expect(polls).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(onGraded).toHaveBeenCalledTimes(1));
    // Editor terkunci setelah kirim, draf dihapus.
    expect(area()).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Kirim untuk Dinilai' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('Ctrl+Enter membuka konfirmasi', () => {
    serve(() => null);
    renderMini();
    fireEvent.change(area(), { target: { value: FIVE } });
    fireEvent.keyDown(area(), { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('status Antre tampil bersama posisi sebelum selesai', async () => {
    serve((url, init) => {
      if (url.pathname === '/api/v1/submissions/writing' && init.method === 'POST') {
        return { status: 202, body: { data: { submission: makeSubmission({ job: makeJob({ queue_position: 2 }) }), quota: QUOTA } } };
      }
      if (url.pathname === `/api/v1/submissions/${SUB_ID}`) {
        return { body: { data: { submission: makeSubmission({ job: makeJob({ queue_position: 2 }) }) } } };
      }
      return null;
    });
    renderMini();
    fireEvent.change(area(), { target: { value: FIVE } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim untuk Dinilai' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kirim' }));
    expect(await screen.findByText('Antre - posisi 2')).toBeInTheDocument();
    expect(screen.queryByTestId('evaluation-card')).not.toBeInTheDocument();
  });

  it('AI mati: FALLBACK_SELF_ASSESSMENT menampilkan kartu fallback; form self-assessment mengirim 4 kriteria', async () => {
    const fallback = makeSubmission({ status: 'FALLBACK_SELF_ASSESSMENT', job: null });
    const selfEval = makeEvaluation({
      method: 'SELF_ASSESSMENT',
      overall_band: 6.0,
      criteria: ['task_response', 'coherence', 'lexical', 'grammar'].map((k) => ({ key: k, name: k, band: 6, comment_id: null })),
      strengths_id: [],
      improvements_id: [],
      corrections: [],
      band7_rewrite: null,
      model_name: null,
    });
    const calls = serve((url, init) => {
      if (url.pathname === '/api/v1/submissions/writing') {
        return { status: 202, body: { data: { submission: fallback, quota: { limit: 0, used: 0, remaining: 0, resets_at: null } } } };
      }
      if (url.pathname === `/api/v1/submissions/${SUB_ID}` && init.method !== 'POST') return { body: { data: { submission: fallback } } };
      if (url.pathname === `/api/v1/submissions/${SUB_ID}/self-assessment`) {
        return { status: 201, body: { data: { submission: graded({ evaluation: selfEval }), evaluation: selfEval } } };
      }
      return null;
    });
    renderMini();
    fireEvent.change(area(), { target: { value: FIVE } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim untuk Dinilai' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kirim' }));

    expect(await screen.findByText('Penilai AI sedang tidak tersedia. Anda tetap bisa menilai sendiri.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nilai sendiri' }));

    // Kirim tanpa memilih: galat validasi lokal.
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Penilaian' }));
    expect(screen.getByText('Pilih band untuk semua kriteria.')).toBeInTheDocument();

    for (const name of ['Task Response', 'Coherence & Cohesion', 'Lexical Resource', 'Grammatical Range & Accuracy']) {
      fireEvent.keyDown(screen.getByRole('combobox', { name: new RegExp(`Band untuk ${name}`) }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('option', { name: '6,0' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Penilaian' }));
    expect(await screen.findByTestId('evaluation-card')).toHaveAttribute('data-method', 'SELF_ASSESSMENT');
    expect(screen.getByText('Penilaian sendiri')).toBeInTheDocument();
    const post = calls.find((c) => c.url.pathname.endsWith('/self-assessment'));
    expect(post?.json).toEqual({ criteria_scores: { task_response: 6, coherence: 6, lexical: 6, grammar: 6 } });
  });

  it('FAILED: Coba lagi memanggil retry (tanpa kuota baru) lalu hasil; Nilai sendiri tersedia', async () => {
    const failed = makeSubmission({ status: 'FAILED', job: makeJob({ status: 'FAILED', queue_position: null, error_code: 'LLM_UNREACHABLE' }) });
    window.localStorage.setItem(SUB_KEY, SUB_ID);
    let retried = false;
    const calls = serve((url, init) => {
      if (url.pathname === `/api/v1/submissions/${SUB_ID}/retry`) {
        retried = true;
        return { status: 202, body: { data: { submission: makeSubmission(), quota: QUOTA } } };
      }
      if (url.pathname === `/api/v1/submissions/${SUB_ID}` && init.method !== 'POST') {
        return { body: { data: { submission: retried ? graded() : failed } } };
      }
      return null;
    });
    renderMini();
    expect(await screen.findByTestId('ai-fallback')).toHaveAttribute('data-status', 'FAILED');
    expect(screen.getByRole('button', { name: 'Nilai sendiri' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    // Polling berikutnya 2 detik setelah retry.
    expect(await screen.findByTestId('evaluation-card', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith('/retry') && c.init.method === 'POST')).toBe(true);
  });

  it('RETRY_LIMIT_REACHED menyembunyikan Coba lagi dan menyisakan Nilai sendiri', async () => {
    const failed = makeSubmission({ status: 'FAILED', job: makeJob({ status: 'FAILED', queue_position: null, error_code: 'LLM_TIMEOUT' }) });
    window.localStorage.setItem(SUB_KEY, SUB_ID);
    serve((url) => {
      if (url.pathname.endsWith('/retry')) return { status: 409, body: errorBody('RETRY_LIMIT_REACHED', 'x') };
      if (url.pathname === `/api/v1/submissions/${SUB_ID}`) return { body: { data: { submission: failed } } };
      return null;
    });
    renderMini();
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument());
    expect(toastError).toHaveBeenCalledWith('Batas percobaan ulang (3 kali) sudah tercapai. Anda dapat menilai sendiri.');
    expect(screen.getByRole('button', { name: 'Nilai sendiri' })).toBeInTheDocument();
  });

  it('kuota habis menonaktifkan Kirim dengan jam WIB', async () => {
    serve(() => null, { status: { ...AI_STATUS, quota: { limit: 10, used: 10, remaining: 0, resets_at: '2026-11-04T08:00:00.000Z' } } });
    renderMini();
    fireEvent.change(area(), { target: { value: FIVE } });
    await waitFor(() => expect(screen.getByTestId('writing-send-note')).toHaveTextContent('Batas harian tercapai. Coba lagi pukul 15:00 WIB.'));
    expect(screen.getByRole('button', { name: 'Kirim untuk Dinilai' })).toBeDisabled();
  });

  it('penilai tidak tersedia: banner info, pengiriman tetap diizinkan', async () => {
    serve(() => null, { status: { ...AI_STATUS, available: false } });
    renderMini();
    expect(await screen.findByTestId('ai-unavailable-banner')).toBeInTheDocument();
    fireEvent.change(area(), { target: { value: FIVE } });
    expect(screen.getByRole('button', { name: 'Kirim untuk Dinilai' })).toBeEnabled();
  });

  it('429 AI_DAILY_LIMIT_REACHED dengan Retry-After menampilkan pesan batas + jam; draf tetap', async () => {
    serve((url) => {
      if (url.pathname === '/api/v1/submissions/writing') {
        return { status: 429, body: errorBody('AI_DAILY_LIMIT_REACHED', 'x'), headers: { 'Retry-After': '3600' } };
      }
      return null;
    });
    renderMini();
    await waitFor(() => expect(screen.queryByTestId('quota-line')).toBeInTheDocument());
    fireEvent.change(area(), { target: { value: FIVE } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim untuk Dinilai' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kirim' }));
    const err = await screen.findByTestId('writing-error');
    expect(err).toHaveTextContent(/Batas penilaian AI hari ini \(10\) sudah tercapai\. Coba lagi setelah \d{2}:\d{2} WIB\./);
    expect(area()).not.toHaveAttribute('readonly');
    expect(area().value).toBe(FIVE);
  });

  it('VALIDATION_ERROR response_too_short dipetakan ke pesan Indonesia', async () => {
    serve((url) => {
      if (url.pathname === '/api/v1/submissions/writing') {
        return { status: 400, body: errorBody('VALIDATION_ERROR', 'x', [{ path: 'response_text', code: 'response_too_short', message: 'x' }]) };
      }
      return null;
    });
    renderMini();
    fireEvent.change(area(), { target: { value: FIVE } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim untuk Dinilai' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kirim' }));
    expect(await screen.findByTestId('writing-error')).toHaveTextContent('Tulisan terlalu pendek. Tambahkan beberapa kata lagi.');
  });

  it('drift kontrak ditolak: respons tidak sesuai tidak ditambal, pesan RESPONSE_INVALID', async () => {
    serve((url) => {
      if (url.pathname === '/api/v1/submissions/writing') {
        return { status: 202, body: { data: { submission: { ...makeSubmission(), raw_output: 'bocor' }, quota: QUOTA } } };
      }
      return null;
    });
    renderMini();
    fireEvent.change(area(), { target: { value: FIVE } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim untuk Dinilai' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kirim' }));
    expect(await screen.findByTestId('writing-error')).toHaveTextContent('Respons server tidak sesuai kontrak. Hubungi pengelola.');
    expect(screen.queryByTestId('evaluation-card')).not.toBeInTheDocument();
  });

  it('memulihkan submission aktif setelah muat ulang dan draf lokal', async () => {
    window.localStorage.setItem(SUB_KEY, SUB_ID);
    serve((url) => (url.pathname === `/api/v1/submissions/${SUB_ID}` ? { body: { data: { submission: graded() } } } : null));
    renderMini();
    expect(await screen.findByTestId('evaluation-card')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat riwayat penilaian' })).toHaveAttribute('href', `/riwayat/penilaian/${SUB_ID}`);
  });

  it('F-12-04: draf pengguna lain atau yang kedaluwarsa tidak dipulihkan; kunci terikat user', async () => {
    const other = `draft:v1:user-lain:${SUBMODULE_ID}:mini`;
    window.localStorage.setItem(other, JSON.stringify({ t: Date.now(), v: 'esai orang lain' }));
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ t: Date.now() - 8 * 24 * 3600 * 1000, v: 'draf basi' }));
    serve(() => null);
    renderMini();
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull());
    expect(area().value).toBe('');
  });

  it('F-12-04: draf segar milik user dipulihkan; logout/401 (clearExamStorage) menghapus draft:v1: dan ai-sub:v1:', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ t: Date.now(), v: 'draf saya' }));
    serve(() => null);
    renderMini();
    await waitFor(() => expect(area().value).toBe('draf saya'));
    window.localStorage.setItem(SUB_KEY, SUB_ID);
    window.localStorage.setItem('lain', '1');
    clearExamStorage();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(SUB_KEY)).toBeNull();
    expect(window.localStorage.getItem('lain')).toBe('1');
  });

  it('draf tersimpan otomatis setiap 10 detik dan dipulihkan', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serve(() => null);
      const { unmount } = renderMini();
      fireEvent.change(area(), { target: { value: 'draft text here now' } });
      expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
      await vi.advanceTimersByTimeAsync(10_100);
      expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null')).toMatchObject({ v: 'draft text here now' });
      expect(screen.getByText('Draf tersimpan')).toBeInTheDocument();
      unmount();
      renderMini();
      await waitFor(() => expect(area().value).toBe('draft text here now'));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('WritingTask (attempt)', () => {
  it('Task 2: counter "n / min. m kata", timer, body memakai attempt_id + question_id + kind', async () => {
    const calls = serve((url, init) => {
      if (url.pathname === '/api/v1/submissions/writing' && init.method === 'POST') {
        return { status: 202, body: { data: { submission: makeSubmission({ kind: 'WRITING_TASK2', attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a', sub_module_id: null, question_id: 'Q-W2' }), quota: QUOTA } } };
      }
      return null;
    });
    const words = Array.from({ length: 22 }, (_, i) => `w${i}`).join(' ');
    renderWithProviders(
      <WritingTask
        context={{ type: 'attempt', attemptId: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a', questionId: 'Q-W2', taskKind: 'TASK2' }}
        prompt="Some people believe..."
        minWords={250}
        remainingSec={240}
      />,
    );
    const ta = screen.getByLabelText('Tulisan Anda dalam bahasa Inggris');
    fireEvent.change(ta, { target: { value: words } });
    expect(screen.getByTestId('word-counter')).toHaveTextContent('22 / min. 250 kata');
    expect(screen.getByTestId('word-counter')).toHaveTextContent('Di bawah batas minimum');
    expect(screen.getByTestId('writing-timer')).toHaveTextContent('04:00');
    expect(screen.getByTestId('timer-announce')).toHaveTextContent('Sisa waktu 5 menit.');
    expect(screen.getByTestId('writing-prompt')).toHaveTextContent('Some people believe...');
    fireEvent.click(screen.getByRole('button', { name: 'Kirim untuk Dinilai' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kirim' }));
    await waitFor(() => expect(calls.some((c) => c.url.pathname === '/api/v1/submissions/writing')).toBe(true));
    const post = calls.find((c) => c.url.pathname === '/api/v1/submissions/writing');
    expect(post?.json).toEqual({
      kind: 'WRITING_TASK2',
      attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
      question_id: 'Q-W2',
      response_text: words,
    });
  });
});

/* ---------------------------------------------------------------- Speaking */
type FakeRecorderCtor = typeof MediaRecorder;

function installMedia(opts: { deny?: boolean } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => {
    if (opts.deny) throw new DOMException('denied', 'NotAllowedError');
    return stream;
  });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  class FakeRecorder {
    static isTypeSupported = (m: string) => m === 'audio/webm;codecs=opus';
    state: 'inactive' | 'recording' = 'inactive';
    mimeType = 'audio/webm;codecs=opus';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public stream: MediaStream) {}
    start() {
      this.state = 'recording';
      this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: 'audio/webm' }) });
    }
    stop() {
      this.state = 'inactive';
      this.onstop?.();
    }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder as unknown as FakeRecorderCtor);
  return { getUserMedia, track };
}

function setSecure(v: boolean) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: v });
}

describe('SpeakingTask', () => {
  beforeEach(() => {
    setSecure(true);
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:test';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setSecure(true);
  });

  const renderSpeaking = () =>
    renderWithProviders(
      <SpeakingTask context={{ type: 'mini', subModuleId: SUBMODULE_ID }} prompt="Describe a place you like to visit." prepSeconds={0} recordSeconds={60} />,
    );

  it('bukan secure context: kartu HTTPS tampil dan tombol Rekam tidak ada', async () => {
    setSecure(false);
    installMedia();
    serve(() => null);
    renderSpeaking();
    expect(await screen.findByText('Perekaman suara membutuhkan koneksi aman (HTTPS atau localhost)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Izinkan Mikrofon/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mulai Rekam/ })).not.toBeInTheDocument();
  });

  it('belum setuju: Dialog persetujuan dengan retensi dari /ai/status; tombol nonaktif sampai dicentang; POST consent', async () => {
    installMedia();
    const calls = serve(
      (url, init) => {
        if (url.pathname === '/api/v1/me/recording-consent' && init.method === 'POST') {
          return { body: { data: { user: { ...USER, consent_recording_at: '2026-11-03T10:00:00.000Z' } } } };
        }
        return null;
      },
      { me: { ...USER, consent_recording_at: null } },
    );
    renderSpeaking();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mulai Rekam' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Izinkan Mikrofon' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Rekam' }));
    const dlg = await screen.findByRole('dialog');
    await waitFor(() => expect(dlg).toHaveTextContent('Rekaman disimpan 90 hari lalu dihapus otomatis.'));
    expect(dlg).toHaveTextContent('tidak dikirim ke layanan pihak ketiga');
    const accept = within(dlg).getByRole('button', { name: 'Setuju dan Lanjutkan' });
    expect(accept).toBeDisabled();
    expect(within(dlg).getByRole('link', { name: 'Pengaturan rekaman' })).toHaveAttribute('href', '/profil');
    fireEvent.click(within(dlg).getByRole('checkbox', { name: 'Saya mengerti' }));
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    await waitFor(() => expect(calls.some((c) => c.url.pathname === '/api/v1/me/recording-consent')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Izinkan Mikrofon' })).toBeInTheDocument();
  });

  it('izin mikrofon ditolak: kartu dengan cara mengaktifkan, tanpa tombol Rekam', async () => {
    installMedia({ deny: true });
    serve(() => null);
    renderSpeaking();
    fireEvent.click(await screen.findByRole('button', { name: 'Izinkan Mikrofon' }));
    expect(await screen.findByText('Izin mikrofon ditolak')).toBeInTheDocument();
    expect(screen.getByText(/pengaturan situs peramban/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mulai Rekam/ })).not.toBeInTheDocument();
  });

  it('alur rekam: pra-cek -> persiapan -> 3-2-1 -> rekam -> tinjau -> kirim -> hasil + transkrip + hapus rekaman', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      installMedia();
      const sub = makeSubmission({
        kind: 'MINI_TASK_SPEAKING',
        job: makeJob({ kind: 'STT_TRANSCRIBE' }),
        response_text: null,
        recording: makeRecording({ transcript: null, available: true }),
      });
      const done = graded({
        kind: 'MINI_TASK_SPEAKING',
        response_text: 'I like to visit the old town because it is quiet.',
        recording: makeRecording(),
        evaluation: makeEvaluation({
          criteria: [
            { key: 'fluency', name: 'Fluency & Coherence', band: 6, comment_id: 'a' },
            { key: 'lexical', name: 'Lexical Resource', band: 6, comment_id: 'b' },
            { key: 'grammar', name: 'Grammatical Range & Accuracy', band: 6, comment_id: 'c' },
            { key: 'pronunciation', name: 'Pronunciation', band: 5.5, comment_id: 'd' },
          ],
          corrections: [],
          flags: { ...FLAGS, pronunciation_estimated: true },
        }),
      });
      let deleted = false;
      const calls = serve((url, init) => {
        if (url.pathname === `/api/v1/submissions/${SUB_ID}/recording` && init.method === 'DELETE') {
          deleted = true;
          return { status: 204 };
        }
        if (url.pathname === `/api/v1/submissions/${SUB_ID}`) {
          return { body: { data: { submission: deleted ? { ...done, recording: makeRecording({ available: false, purged_at: '2026-11-03T11:00:00.000Z' }) } : done } } };
        }
        return null;
      });
      const spy = vi.spyOn(aiApi, 'createSpeaking').mockResolvedValue({ submission: sub, quota: QUOTA });
      renderSpeaking();

      fireEvent.click(await screen.findByRole('button', { name: 'Izinkan Mikrofon' }));
      const meter = await screen.findByRole('meter', { name: 'Level suara' });
      expect(meter).toHaveAttribute('aria-valuenow');
      fireEvent.click(screen.getByRole('button', { name: 'Lanjut ke Persiapan' }));

      // Persiapan (0 detik): kartu topik + catatan; stepper tahap 1.
      expect(screen.getByTestId('cue-card')).toHaveTextContent('Describe a place you like to visit.');
      expect(screen.getByTestId('speaking-stepper').querySelector('[aria-current="step"]')).toHaveTextContent('Persiapan');
      fireEvent.click(screen.getByRole('button', { name: 'Mulai Rekam' }));
      expect(screen.getByTestId('countdown')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(3300);

      const stop = await screen.findByRole('button', { name: 'Berhenti merekam' });
      expect(screen.getByTestId('recording-label')).toHaveTextContent('Merekam');
      await vi.advanceTimersByTimeAsync(5000);
      fireEvent.click(stop);

      // Tinjau.
      const send = await screen.findByRole('button', { name: 'Kirim untuk Dinilai' });
      expect(screen.getByTestId('review-audio')).toBeInTheDocument();
      expect(screen.getByTestId('rerecord-left')).toHaveTextContent('Sisa kesempatan: 3 dari 3');
      fireEvent.click(send);
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      const arg = spy.mock.calls[0]![0];
      expect(arg.kind).toBe('MINI_TASK_SPEAKING');
      expect(arg.sub_module_id).toBe(SUBMODULE_ID);
      expect(arg.audio.size).toBeGreaterThan(1024);
      expect(arg.duration_sec).toBeGreaterThanOrEqual(5);

      // Hasil.
      expect(await screen.findByTestId('evaluation-card')).toBeInTheDocument();
      expect(screen.getByTestId('transcript')).toHaveTextContent('old town');
      expect(screen.getByTestId('pron-badge')).toBeInTheDocument();
      expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
      const controls = screen.getByTestId('recording-controls');
      expect(controls).toHaveTextContent('Rekaman dihapus otomatis pada');

      fireEvent.click(within(controls).getByRole('button', { name: 'Hapus rekaman' }));
      const dlg = await screen.findByRole('dialog');
      expect(dlg).toHaveTextContent('Rekaman akan dihapus permanen. Transkrip dan skor tetap tersimpan.');
      fireEvent.click(within(dlg).getByRole('button', { name: 'Hapus Permanen' }));
      expect(await screen.findByTestId('recording-gone')).toHaveTextContent('Rekaman sudah dihapus.');
      expect(calls.some((c) => c.init.method === 'DELETE')).toBe(true);
      expect(screen.getByTestId('transcript')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rekaman < 3 detik: pesan terlalu pendek dan Kirim nonaktif; rekam ulang mengurangi kesempatan', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      installMedia();
      serve(() => null);
      renderSpeaking();
      fireEvent.click(await screen.findByRole('button', { name: 'Izinkan Mikrofon' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Lanjut ke Persiapan' }));
      fireEvent.click(screen.getByRole('button', { name: 'Mulai Rekam' }));
      await vi.advanceTimersByTimeAsync(3300);
      const stop = await screen.findByRole('button', { name: 'Berhenti merekam' });
      await vi.advanceTimersByTimeAsync(1000);
      fireEvent.click(stop);
      expect(await screen.findByText('Rekaman terlalu pendek, minimal 3 detik.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Kirim untuk Dinilai' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Rekam ulang' }));
      await screen.findByTestId('cue-card');
      expect(screen.getByTestId('speaking-recorder')).toHaveAttribute('data-phase', 'prep');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gagal STT_EMPTY: pesan khusus, tanpa Coba lagi, ada Rekam ulang dan Nilai sendiri', async () => {
    installMedia();
    window.localStorage.setItem(SUB_KEY_SPEAKING, SUB_ID);
    const failed = makeSubmission({
      kind: 'MINI_TASK_SPEAKING',
      status: 'FAILED',
      response_text: null,
      job: makeJob({ kind: 'STT_TRANSCRIBE', status: 'FAILED', queue_position: null, error_code: 'STT_EMPTY' }),
    });
    serve((url) => (url.pathname === `/api/v1/submissions/${SUB_ID}` ? { body: { data: { submission: failed } } } : null));
    renderSpeaking();
    expect(await screen.findByText('Suara tidak terdeteksi. Rekam ulang dengan mikrofon lebih dekat.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rekam ulang' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nilai sendiri' }));
    expect(screen.getByRole('combobox', { name: /Band untuk Fluency & Coherence/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Band untuk Pronunciation/ })).toBeInTheDocument();
  });
});

describe('RecordingControls', () => {
  it('rekaman tidak tersedia: keterangan sudah dihapus tanpa pemutar', () => {
    serve(() => null);
    renderWithProviders(<RecordingControls submission={graded({ recording: makeRecording({ available: false, purged_at: '2026-11-03T11:00:00.000Z' }) })} />);
    expect(screen.getByTestId('recording-gone')).toHaveTextContent('Rekaman sudah dihapus.');
    expect(screen.queryByRole('button', { name: 'Hapus rekaman' })).not.toBeInTheDocument();
  });

  it('tanpa rekaman (Writing): tidak merender apa pun', () => {
    serve(() => null);
    const { container } = renderWithProviders(<RecordingControls submission={graded()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pemutar memakai endpoint rekaman milik user (tanpa URL pihak ketiga)', () => {
    serve(() => null);
    const { container } = renderWithProviders(<RecordingControls submission={graded({ recording: makeRecording() })} />);
    expect(container.querySelector('audio')).toHaveAttribute('src', `/api/v1/submissions/${SUB_ID}/recording`);
  });
});

/* ---------------------------------------------------------------- Profil & riwayat */
describe('RecordingPrefsCard', () => {
  it('Switch Simpan rekaman memanggil PATCH keep_recordings dan menampilkan retensi', async () => {
    const calls = serve((url, init) => {
      if (url.pathname === '/api/v1/me/recording-preferences' && init.method === 'PATCH') {
        return { body: { data: { user: { ...ME, keep_recordings: false } } } };
      }
      return null;
    });
    renderWithProviders(<RecordingPrefsCard user={{ ...ME, keep_recordings: true }} />);
    expect(await screen.findByText('Rekaman disimpan 90 hari lalu dihapus otomatis.')).toBeInTheDocument();
    expect(screen.getByTestId('consent-status')).toHaveTextContent('Persetujuan rekaman: diberikan pada');
    const sw = screen.getByRole('switch', { name: 'Simpan rekaman saya' });
    expect(sw).toBeChecked();
    fireEvent.click(sw);
    await waitFor(() => expect(calls.find((c) => c.init.method === 'PATCH')?.json).toEqual({ keep_recordings: false }));
  });

  it('belum ada persetujuan: status menyatakan belum diberikan', () => {
    serve(() => null);
    renderWithProviders(<RecordingPrefsCard user={{ ...ME, consent_recording_at: null }} />);
    expect(screen.getByTestId('consent-status')).toHaveTextContent('belum diberikan');
  });
});

describe('SubmissionHistory', () => {
  const item = { id: SUB_ID, kind: 'MINI_TASK_WRITING', status: 'GRADED', overall_band: 6.0, method: 'AI_LOCAL', word_count: 24, prompt_excerpt: 'Ubah 3 tahapan', created_at: '2026-11-03T10:40:00.000Z' };

  it('daftar berisi jenis (tautan detail), band, kata, tanggal, status; filter mengirim kind', async () => {
    const calls = serve((url) => (url.pathname === '/api/v1/submissions' ? { body: { data: [item], meta: { page: 1, page_size: 20, total: 1 } } } : null));
    renderWithProviders(<SubmissionHistory />);
    const links = await screen.findAllByRole('link', { name: 'Mini-Task Writing' });
    expect(links[0]).toHaveAttribute('href', `/riwayat/penilaian/${SUB_ID}`);
    expect(screen.getAllByText('6,0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Selesai').length).toBeGreaterThan(0);
    expect(calls[0]?.url.searchParams.get('kind')).toBeNull();
    expect(calls[0]?.url.searchParams.get('page_size')).toBe('20');
  });

  it('kosong: "Belum ada penilaian."', async () => {
    serve((url) => (url.pathname === '/api/v1/submissions' ? { body: { data: [], meta: { page: 1, page_size: 20, total: 0 } } } : null));
    renderWithProviders(<SubmissionHistory />);
    expect(await screen.findByText('Belum ada penilaian.')).toBeInTheDocument();
  });

  it('galat memuat: ErrorState dengan Coba lagi', async () => {
    serve((url) => (url.pathname === '/api/v1/submissions' ? { status: 500, body: errorBody('INTERNAL_ERROR', 'x') } : null));
    renderWithProviders(<SubmissionHistory />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat');
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});
