import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamSession } from '@/components/exam/exam-runner';
import { makeAttempt, Q } from '@/components/quiz/fixtures';
import { mockFetch, renderWithProviders } from '@/components/test-utils';
import type { Attempt, QuestionPublic } from '@/contracts/attempts';
import { parsePassages } from '@/lib/reading/parsePassages';
import { resetPassageSessionFlags } from './passage-panel';
import { ReadingWorkspace } from './reading-workspace';
import { toast } from 'sonner';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => '/ujian',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }));

const ATTEMPT_ID = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
const MD = '# Cave Dwellers\n\n[A] The cave was dark and deep.\n\n[B] Water dripped from the ceiling.\n===PASSAGE===\n# Second Text\n\n[A] Another text begins here.';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function qs(n: number, passageOf: (i: number) => number | null): QuestionPublic[] {
  return Array.from({ length: n }, (_, i) => ({
    ...Q.tfng,
    question_id: `R-${String(i + 1).padStart(2, '0')}`,
    prompt: `Pernyataan nomor ${i + 1}`,
    skill: 'READING' as const,
    passage_no: passageOf(i),
  }));
}

function examAttempt(over: Partial<Attempt> = {}, questions: QuestionPublic[] = qs(4, (i) => (i < 2 ? 1 : 2))): Attempt {
  const now = Date.now();
  return makeAttempt(questions, {
    id: ATTEMPT_ID,
    mode: 'EXAM',
    assessment_type: 'SKIP_MODULE_TEST',
    title: 'Reading Ujian',
    passage_markdown: MD,
    started_at: new Date(now).toISOString(),
    server_now: new Date(now).toISOString(),
    deadline_at: new Date(now + 3_600_000).toISOString(),
    remaining_seconds: 3600,
    ...over,
  });
}

function selectText(container: HTMLElement, para: string, from: number, to: number) {
  const span = container.querySelector(`[data-para="${para}"] [data-start]`)!;
  const text = span.firstChild as Text;
  const r = document.createRange();
  r.setStart(text, from);
  r.setEnd(text, to);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

const answerOk = { status: 200, body: { data: { question_id: 'R-01', saved: true, answered_count: 1, feedback: null, next_question: null } } };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.getSelection()?.removeAllRanges();
  resetPassageSessionFlags();
  mockMatchMedia(true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReadingWorkspace (split desktop)', () => {
  it('label paragraf di margin (A, B) dan tidak muncul di teks; hanya dua panel scroll', () => {
    mockFetch(() => answerOk);
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    expect(screen.getByLabelText('Paragraf A')).toHaveTextContent('A');
    expect(screen.getByLabelText('Paragraf B')).toHaveTextContent('B');
    expect(container.querySelector('[data-para="1:0"]')!.textContent).toBe('The cave was dark and deep.');
    const scrollers = container.querySelectorAll('.overflow-y-auto');
    expect(scrollers).toHaveLength(2);
    expect(screen.getByTestId('splitter')).toHaveAttribute('aria-valuenow', '50');
  });

  it('pembagi: ArrowRight 50->55->60->65 dan berhenti di 65; ArrowLeft sampai minimum 35', () => {
    mockFetch(() => answerOk);
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const sep = screen.getByRole('separator');
    expect(sep).toHaveAttribute('aria-valuemin', '35');
    expect(sep).toHaveAttribute('aria-valuemax', '65');
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('tabindex', '0');
    for (const expected of ['55', '60', '65', '65']) {
      fireEvent.keyDown(sep, { key: 'ArrowRight' });
      expect(sep).toHaveAttribute('aria-valuenow', expected);
    }
    for (let i = 0; i < 8; i++) fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(sep).toHaveAttribute('aria-valuenow', '35');
  });

  it('rasio tersimpan di split:v1 dan dipulihkan saat dimuat ulang', () => {
    mockFetch(() => answerOk);
    const first = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const sep = screen.getByRole('separator');
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(JSON.parse(window.localStorage.getItem('split:v1')!)).toEqual({ ratio: 40 });
    first.unmount();
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '40');
  });

  it('memilih "Teks 2" menampilkan hanya soal passage_no=2 dengan judul bernomor global', () => {
    mockFetch(() => answerOk);
    const questions = qs(26, (i) => (i < 13 ? 1 : 2));
    renderWithProviders(<ExamSession attempt={examAttempt({}, questions)} />);
    expect(screen.getByRole('heading', { name: 'Teks 1: Soal 1-13' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Teks 2' }));
    expect(screen.getByRole('heading', { name: 'Teks 2: Soal 14-26' })).toBeInTheDocument();
    expect(screen.getByText('Pernyataan nomor 14')).toBeInTheDocument();
    expect(screen.queryByText('Pernyataan nomor 13')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Second Text' })).toBeInTheDocument();
  });

  it('passage_no null dan di luar jumlah teks dikelompokkan ke Teks 1 (dengan warn)', () => {
    mockFetch(() => answerOk);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderWithProviders(<ExamSession attempt={examAttempt({}, qs(3, (i) => (i === 0 ? null : i === 1 ? 3 : 2)))} />);
    expect(screen.getByRole('heading', { name: 'Teks 1: Soal 1-2' })).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
  });

  it('passage tidak dapat diuraikan: kartu galat + Laporkan, soal tetap dapat dijawab', async () => {
    const calls = mockFetch((_u, init) => (init.method === 'PUT' ? answerOk : { status: 404, body: {} }));
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    renderWithProviders(<ExamSession attempt={examAttempt({ passage_markdown: 'a\n===PASSAGE===\nb\n===PASSAGE===\nc\n===PASSAGE===\nd' })} />);
    expect(screen.getByText('Teks bacaan tidak dapat ditampilkan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Laporkan' }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('too_many_passages'));
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true));
  });
});

describe('Highlighter', () => {
  it('menyorot kuning: <mark> terbungkus, localStorage berisi 1 sorotan dengan start/end benar, pulih setelah refresh', () => {
    mockFetch(() => answerOk);
    const { container, unmount } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    selectText(container, '1:0', 4, 8); // "cave"
    expect(screen.getByRole('toolbar', { name: 'Penyorot teks' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sorot kuning' }));
    const mark = container.querySelector('mark')!;
    expect(mark.textContent).toBe('cave');
    expect(mark).toHaveAttribute('data-color', 'yellow');
    expect(mark.className).toContain('--color-highlight-yellow');
    const stored = JSON.parse(window.localStorage.getItem(`hl:v1:${ATTEMPT_ID}`)!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ passage_no: 1, paragraph_index: 0, start: 4, end: 8, color: 'yellow' });
    expect(container.querySelector('[data-para="1:0"]')!.textContent).toBe('The cave was dark and deep.');
    unmount();
    const again = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    expect(again.container.querySelector('mark')!.textContent).toBe('cave');
  });

  it('H = kuning, Shift+H = hijau; hapus sorotan lewat Delete pada sorotan terfokus', () => {
    mockFetch(() => answerOk);
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    selectText(container, '1:0', 0, 3);
    fireEvent.keyDown(document.body, { key: 'h' });
    selectText(container, '1:1', 0, 5);
    fireEvent.keyDown(document.body, { key: 'H', shiftKey: true });
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveAttribute('data-color', 'yellow');
    expect(marks[1]).toHaveAttribute('data-color', 'green');
    marks[0]!.focus();
    fireEvent.keyDown(marks[0]!, { key: 'Delete' });
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(`hl:v1:${ATTEMPT_ID}`)!)).toHaveLength(1);
  });

  it('Hapus sorotan pada seleksi dan Hapus semua sorotan (dengan dialog konfirmasi)', () => {
    mockFetch(() => answerOk);
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    selectText(container, '1:0', 0, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Sorot kuning' }));
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus semua sorotan' }));
    expect(screen.getByText('Hapus semua sorotan?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, hapus semua' }));
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('seleksi lintas dua paragraf: toolbar tidak muncul; Toast "Sorot dalam satu paragraf." sekali per sesi', () => {
    mockFetch(() => answerOk);
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const a = container.querySelector('[data-para="1:0"] [data-start]')!.firstChild as Text;
    const b = container.querySelector('[data-para="1:1"] [data-start]')!.firstChild as Text;
    const doSelect = () => {
      const r = document.createRange();
      r.setStart(a, 2);
      r.setEnd(b, 4);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(r);
      fireEvent.mouseDown(container.querySelector('[data-para="1:0"]')!);
      fireEvent.mouseUp(document);
    };
    doSelect();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(toast.info).toHaveBeenCalledWith('Sorot dalam satu paragraf.');
    doSelect();
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('batas 200: sorotan ke-201 ditolak dengan Toast dan jumlah tetap 200', () => {
    mockFetch(() => answerOk);
    const seed = Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, passage_no: 1, paragraph_index: 0, start: 0, end: 3, color: 'yellow' }));
    window.localStorage.setItem(`hl:v1:${ATTEMPT_ID}`, JSON.stringify(seed));
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    selectText(container, '1:1', 0, 5);
    fireEvent.click(screen.getByRole('button', { name: 'Sorot hijau' }));
    expect(toast.error).toHaveBeenCalledWith('Batas sorotan tercapai.');
    expect(JSON.parse(window.localStorage.getItem(`hl:v1:${ATTEMPT_ID}`)!)).toHaveLength(200);
  });

  it('localStorage diblokir: sorotan tetap tampil selama sesi tanpa galat', () => {
    mockFetch(() => answerOk);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    selectText(container, '1:0', 4, 8);
    fireEvent.click(screen.getByRole('button', { name: 'Sorot kuning' }));
    expect(container.querySelector('mark')!.textContent).toBe('cave');
  });

  it('sorotan tersimpan dengan rentang melebihi panjang paragraf dibuang tanpa galat', () => {
    mockFetch(() => answerOk);
    window.localStorage.setItem(
      `hl:v1:${ATTEMPT_ID}`,
      JSON.stringify([
        { id: 'ok', passage_no: 1, paragraph_index: 0, start: 0, end: 3, color: 'green' },
        { id: 'bad', passage_no: 1, paragraph_index: 0, start: 5, end: 999, color: 'yellow' },
        { id: 'junk', foo: 1 },
      ]),
    );
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    expect(container.querySelectorAll('mark')).toHaveLength(1);
  });

  it('paragraf dengan penekanan dan daftar dirender sebagai segmen (tanpa tanda Markdown) dengan offset mentah', () => {
    mockFetch(() => answerOk);
    const md = 'Ada **tebal** dan *miring* di sini.\n\n- butir satu\n- butir dua';
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt({ passage_markdown: md })} />);
    const p = container.querySelector('[data-para="1:0"]')!;
    expect(p.textContent).toBe('Ada tebal dan miring di sini.');
    expect(p.querySelector('.font-semibold')!.textContent).toBe('tebal');
    expect(container.querySelectorAll('[data-para="1:1"] li')).toHaveLength(2);
    // "tebal" berada pada offset mentah 6..11 (setelah "**").
    selectText(container, '1:0', 0, 3); // span pertama "Ada "
    fireEvent.click(screen.getByRole('button', { name: 'Sorot kuning' }));
    expect(JSON.parse(window.localStorage.getItem(`hl:v1:${ATTEMPT_ID}`)!)[0]).toMatchObject({ start: 0, end: 3 });
    const bold = p.querySelector('.font-semibold')!;
    const r = document.createRange();
    r.setStart(bold.firstChild!, 1);
    r.setEnd(bold.firstChild!, 4);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(r);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sorot hijau' }));
    const stored = JSON.parse(window.localStorage.getItem(`hl:v1:${ATTEMPT_ID}`)!);
    expect(stored[1]).toMatchObject({ start: 7, end: 10 });
  });

  it('tabel tidak dapat disorot (tanpa data-start)', () => {
    mockFetch(() => answerOk);
    const { container } = renderWithProviders(<ExamSession attempt={examAttempt({ passage_markdown: '| a | b |\n| - | - |\n| 1 | 2 |' })} />);
    expect(container.querySelector('[data-para="1:0"] [data-start]')).toBeNull();
  });

  it('kode sumber komponen tidak memakai innerHTML/dangerouslySetInnerHTML', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const f of ['passage-panel.tsx', 'reading-workspace.tsx', 'paragraph-runs.ts', 'selection.ts']) {
      const src = fs.readFileSync(path.join(process.cwd(), 'src/components/reading', f), 'utf8');
      expect(src).not.toMatch(/innerHTML|dangerouslySetInnerHTML/);
    }
  });
});

describe('Penyimpanan jawaban Reading (mode ujian)', () => {
  it('satu PUT setelah 400 ms tanpa panel umpan balik; bendera tersimpan di flag:v1 dan tampil di navigator', async () => {
    const calls = mockFetch((_u, init) => (init.method === 'PUT' ? answerOk : { status: 404, body: {} }));
    const { unmount } = renderWithProviders(<ExamSession attempt={examAttempt()} />);
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    await waitFor(() => expect(calls.filter((c) => c.init.method === 'PUT')).toHaveLength(1));
    expect(screen.queryByText('Benar!')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /Tandai soal/ })[0]!);
    expect(JSON.parse(window.localStorage.getItem(`flag:v1:${ATTEMPT_ID}`)!)).toEqual(['R-01']);
    fireEvent.click(screen.getByRole('button', { name: /Daftar soal/ }));
    expect(await screen.findByRole('button', { name: /Ke soal 1, Terjawab, Ditandai/ })).toBeInTheDocument();
    unmount();
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    expect(screen.getAllByRole('button', { name: /Hapus tanda/ })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('gagal simpan: "Belum tersimpan" + 3 percobaan ulang (2, 4, 8 detik) lalu Toast dengan Coba lagi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = mockFetch((_u, init) => (init.method === 'PUT' ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'x', request_id: 'r' } } } : { status: 404, body: {} }));
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const puts = () => calls.filter((c) => c.init.method === 'PUT').length;
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    await vi.advanceTimersByTimeAsync(450);
    await waitFor(() => expect(puts()).toBe(1));
    expect(await screen.findByText('Belum tersimpan')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2100);
    await waitFor(() => expect(puts()).toBe(2));
    await vi.advanceTimersByTimeAsync(4100);
    await waitFor(() => expect(puts()).toBe(3));
    await vi.advanceTimersByTimeAsync(8100);
    await waitFor(() => expect(puts()).toBe(4));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0]![1]).toMatchObject({ action: { label: 'Coba lagi' } });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(puts()).toBe(4);
    vi.useRealTimers();
  });

  it('sinkronisasi jam server tiap 60 detik tidak mengubah jawaban lokal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const attempt = examAttempt();
    const calls = mockFetch((u) => (u.pathname === `/api/v1/attempts/${ATTEMPT_ID}` ? { body: { data: attempt } } : answerOk));
    renderWithProviders(<ExamSession attempt={attempt} />);
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    await vi.advanceTimersByTimeAsync(60_500);
    expect(calls.some((c) => c.init.method !== 'PUT' && c.url.pathname === `/api/v1/attempts/${ATTEMPT_ID}`)).toBe(true);
    expect(screen.getAllByRole('radio')[1]).toBeChecked();
    vi.useRealTimers();
  });
});

describe('Navigasi soal', () => {
  it('F-10-04: Alt+Panah selalu preventDefault, juga di soal pertama dan terakhir', () => {
    mockFetch(() => answerOk);
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const left = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(left);
    expect(left.defaultPrevented).toBe(true);
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
  });

  it('footer Soal berikutnya/sebelumnya dan Alt+Panah berpindah soal aktif (aria-current di navigator)', async () => {
    mockFetch(() => answerOk);
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const openList = () => fireEvent.click(screen.getByRole('button', { name: /Daftar soal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Soal berikutnya' }));
    fireEvent.keyDown(document, { key: 'ArrowRight', altKey: true });
    // soal 3 berada di Teks 2: panel kanan berganti
    expect(await screen.findByRole('heading', { name: 'Teks 2: Soal 3-4' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowLeft', altKey: true });
    expect(await screen.findByRole('heading', { name: 'Teks 1: Soal 1-2' })).toBeInTheDocument();
    openList();
    expect(await screen.findByRole('button', { name: /Ke soal 2,/ })).toHaveAttribute('aria-current', 'step');
  });
});

describe('ReadingWorkspace (mobile tab)', () => {
  beforeEach(() => mockMatchMedia(false));

  it('tab Teks | Soal tampil, tablist dapat dinavigasi panah, soal dikelompokkan "Soal Teks n"', async () => {
    mockFetch(() => answerOk);
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const tablist = screen.getByRole('tablist', { name: 'Teks dan soal' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Teks', 'Soal']);
    expect(screen.getByRole('heading', { name: 'Soal Teks 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Soal Teks 2' })).toBeInTheDocument();
    expect(screen.queryByRole('separator')).toBeNull();
    tabs[1]!.focus();
    fireEvent.keyDown(tabs[1]!, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Teks' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText('The cave was dark and deep.')).toBeInTheDocument();
  });

  it('posisi scroll tab dipertahankan: "Lihat teks" lalu "Kembali ke soal"', async () => {
    mockFetch(() => answerOk);
    renderWithProviders(<ExamSession attempt={examAttempt()} />);
    const questions = screen.getByTestId('panel-questions');
    questions.scrollTop = 321;
    fireEvent.click(screen.getByRole('button', { name: 'Lihat teks' }));
    expect(screen.getByTestId('panel-passage')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kembali ke soal' }));
    expect(screen.getByTestId('panel-questions').scrollTop).toBe(321);
  });
});

describe('ReadingWorkspace langsung', () => {
  it('memanggil renderQuestions dengan layout sesuai viewport', () => {
    const spy = vi.fn(() => <p>isi soal</p>);
    mockMatchMedia(true);
    render(
      <ReadingWorkspace attemptId={ATTEMPT_ID} passages={parsePassages(MD)} passageNo={1} onPassageNo={() => undefined} renderQuestions={spy} />,
    );
    expect(spy).toHaveBeenCalledWith('split');
  });
});
