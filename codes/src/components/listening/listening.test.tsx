import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPrecheck } from '@/components/exam/audio-precheck';
import { ExamIntroView } from '@/components/exam/exam-intro';
import { ExamSession } from '@/components/exam/exam-runner';
import { makeAttempt, Q } from '@/components/quiz/fixtures';
import { mockFetch, renderWithProviders } from '@/components/test-utils';
import type { Attempt, QuestionPublic } from '@/contracts/attempts';
import type { ExamIntroData as ExamIntro } from '@/lib/api/exams';
import { ListeningPlayer } from './listening-player';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => '/ujian',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }));

const ATTEMPT_ID = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
const URL_AUDIO = `/api/v1/attempts/${ATTEMPT_ID}/audio`;

let play: ReturnType<typeof vi.fn>;
let load: ReturnType<typeof vi.fn>;
const times = new WeakMap<object, number>();
const rates = new WeakMap<object, number>();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  play = vi.fn(() => Promise.resolve());
  load = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: object) {
      return times.get(this) ?? 0;
    },
    set(this: object, v: number) {
      times.set(this, v);
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
    configurable: true,
    get(this: object) {
      return rates.get(this) ?? 1;
    },
    set(this: object, v: number) {
      rates.set(this, v);
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 284 });
});
afterEach(() => vi.useRealTimers());

const audioEl = () => screen.getByTestId('listening-audio') as HTMLAudioElement;
const loaded = () => fireEvent.loadedMetadata(audioEl());

function renderPlayer(mode: 'EXAM' | 'PRACTICE', attemptId: string | undefined = ATTEMPT_ID) {
  const r = renderWithProviders(<ListeningPlayer mode={mode} audioUrl={URL_AUDIO} durationSec={284} attemptId={attemptId} />);
  loaded();
  return r;
}

describe('ListeningPlayer mode EXAM (terkunci)', () => {
  it('tanpa controls, tanpa autoplay, progress read-only, tanpa kontrol jeda/mundur/ulang/kecepatan', () => {
    renderPlayer('EXAM');
    const audio = audioEl();
    expect(audio).not.toHaveAttribute('controls');
    expect(audio).toHaveAttribute('preload', 'metadata');
    expect(audio).toHaveAttribute('src', URL_AUDIO);
    expect(play).not.toHaveBeenCalled();
    const bar = screen.getByRole('progressbar', { name: 'Kemajuan audio' });
    // aria-readonly tidak valid pada progressbar (axe critical): baca-saja = tanpa tabindex/handler, bukan atribut ARIA.
    expect(bar).toHaveAttribute('data-readonly', 'true');
    expect(bar).not.toHaveAttribute('tabindex');
    expect(bar).not.toHaveAttribute('aria-readonly');
    for (const bad of [/jeda/i, /mundur/i, /ulang/i, /kecepatan/i]) {
      expect(screen.queryByRole('button', { name: bad })).toBeNull();
      expect(screen.queryByRole('slider', { name: bad })).toBeNull();
      expect(screen.queryByRole('group', { name: bad })).toBeNull();
    }
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
    expect(screen.getByText('Audio hanya diputar satu kali seperti di ujian sebenarnya.')).toBeInTheDocument();
    expect(screen.getByText('Belum diputar')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Putar audio' });
    expect(btn.className).toContain('h-14');
    expect(screen.getByText('00:00 / 04:44')).toBeInTheDocument();
  });

  it('klik pada bar progress tidak mengubah posisi', () => {
    renderPlayer('EXAM');
    const bar = screen.getByRole('progressbar');
    fireEvent.click(bar, { clientX: 150 });
    fireEvent.mouseDown(bar);
    expect(audioEl().currentTime).toBe(0);
  });

  it('Putar -> "Sedang diputar" (aria-live) dan tombol Putar nonaktif', () => {
    renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Putar audio' }));
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.playing(audioEl());
    const status = screen.getByText('Sedang diputar');
    expect(status.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Putar audio' })).toBeDisabled();
  });

  it('seeking yang melompat > 1,5 detik dikembalikan ke lastPosition dan pemutaran berlanjut', () => {
    window.localStorage.setItem(`audio:v1:${ATTEMPT_ID}`, JSON.stringify({ position_sec: 30 }));
    renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan Audio' }));
    fireEvent.playing(audioEl());
    expect(audioEl().currentTime).toBe(30);
    audioEl().currentTime = 5;
    fireEvent.seeking(audioEl());
    expect(Math.abs(audioEl().currentTime - 30)).toBeLessThanOrEqual(1.5);
    // lompatan kecil (<= 1,5 detik) wajar dan dibiarkan
    audioEl().currentTime = 30.8;
    fireEvent.seeking(audioEl());
    expect(audioEl().currentTime).toBe(30.8);
  });

  it('pause bukan dari learner: Banner alert; "Lanjutkan Audio" melanjutkan dari lastPosition, bukan dari awal', () => {
    window.localStorage.setItem(`audio:v1:${ATTEMPT_ID}`, JSON.stringify({ position_sec: 40 }));
    renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan Audio' }));
    fireEvent.playing(audioEl());
    fireEvent.pause(audioEl());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Audio terhenti.');
    audioEl().currentTime = 0; // peramban mengembalikan ke awal
    play.mockClear();
    fireEvent.click(within(alert).getByRole('button', { name: 'Lanjutkan Audio' }));
    expect(audioEl().currentTime).toBe(40);
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.playing(audioEl());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('galat jaringan saat diputar: "Muat ulang audio" memuat ulang src lalu melanjutkan dari lastPosition', () => {
    window.localStorage.setItem(`audio:v1:${ATTEMPT_ID}`, JSON.stringify({ position_sec: 50 }));
    renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan Audio' }));
    fireEvent.playing(audioEl());
    fireEvent.error(audioEl());
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang audio' }));
    expect(load).toHaveBeenCalled();
    play.mockClear();
    audioEl().currentTime = 0;
    fireEvent.loadedMetadata(audioEl());
    expect(audioEl().currentTime).toBe(50);
    expect(play).toHaveBeenCalled();
  });

  it('muat ulang halaman: posisi tersimpan 61 detik -> "Lanjutkan Audio" mulai di 61', () => {
    window.localStorage.setItem(`audio:v1:${ATTEMPT_ID}`, JSON.stringify({ position_sec: 61 }));
    renderPlayer('EXAM');
    expect(screen.getByRole('button', { name: 'Lanjutkan Audio' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan Audio' }));
    expect(audioEl().currentTime).toBe(61);
    expect(play).toHaveBeenCalled();
  });

  it('tanpa posisi tersimpan mulai dari 0 dengan label "Putar audio"', () => {
    renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Putar audio' }));
    expect(audioEl().currentTime).toBe(0);
  });

  it('posisi disimpan ke audio:v1 saat diputar (interval 500 ms)', () => {
    vi.useFakeTimers();
    renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Putar audio' }));
    fireEvent.playing(audioEl());
    audioEl().currentTime = 1;
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(JSON.parse(window.localStorage.getItem(`audio:v1:${ATTEMPT_ID}`)!)).toEqual({ position_sec: 1 });
  });

  it('F-11-01: lastPosition mengikuti kemajuan alami 30 detik tanpa seeking; seeking ke 5 kembali ke ~30', () => {
    vi.useFakeTimers();
    renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Putar audio' }));
    fireEvent.playing(audioEl());
    audioEl().currentTime = 1;
    act(() => {
      vi.advanceTimersByTime(600);
    });
    // tab/pelacak tertunda: audio maju 30 detik tanpa peristiwa seeking
    audioEl().currentTime = 31;
    act(() => {
      vi.advanceTimersByTime(600);
    });
    audioEl().currentTime = 5;
    fireEvent.seeking(audioEl());
    expect(Math.abs(audioEl().currentTime - 31)).toBeLessThanOrEqual(1.5);
  });

  it('audio berakhir: "Audio selesai", Putar disabled, Banner info; tetap selesai setelah muat ulang', () => {
    const { unmount } = renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Putar audio' }));
    fireEvent.playing(audioEl());
    fireEvent.ended(audioEl());
    expect(screen.getByText('Audio selesai')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Putar audio' })).toBeDisabled();
    expect(screen.getByText('Audio selesai. Periksa jawaban Anda sebelum waktu habis.')).toBeInTheDocument();
    unmount();
    renderPlayer('EXAM');
    expect(screen.getByRole('button', { name: 'Putar audio' })).toBeDisabled();
  });

  it('playbackRate yang diubah lewat konsol dikembalikan ke 1', () => {
    renderPlayer('EXAM');
    audioEl().playbackRate = 2;
    fireEvent.rateChange(audioEl());
    expect(audioEl().playbackRate).toBe(1);
  });

  it('metadata belum termuat = Skeleton; galat sebelum termuat = "Audio tidak tersedia" + Coba lagi', () => {
    renderWithProviders(<ListeningPlayer mode="EXAM" audioUrl={URL_AUDIO} durationSec={284} attemptId={ATTEMPT_ID} />);
    expect(screen.getByRole('status', { name: 'Memuat...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Putar audio' })).toBeNull();
    fireEvent.error(audioEl());
    expect(screen.getByText('Audio tidak tersedia')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(screen.queryByText('Audio tidak tersedia')).toBeNull();
    expect(audioEl()).toHaveAttribute('src', URL_AUDIO);
  });

  it('pemutaran ditolak (play reject) sebelum termuat tidak memicu galat tak tertangani', async () => {
    play.mockImplementation(() => Promise.reject(new Error('NotAllowed')));
    renderPlayer('EXAM');
    fireEvent.click(screen.getByRole('button', { name: 'Putar audio' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Audio terhenti.'));
  });
});

describe('ListeningPlayer mode PRACTICE', () => {
  it('kontrol penuh: Putar/Jeda, slider posisi, Mundur 5 detik (min 0), kecepatan 0.75x/1x, volume', () => {
    renderPlayer('PRACTICE');
    expect(screen.queryByText('Audio hanya diputar satu kali seperti di ujian sebenarnya.')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Posisi audio' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Putar audio' }));
    fireEvent.playing(audioEl());
    expect(screen.getByRole('button', { name: 'Jeda' })).toBeInTheDocument();
    audioEl().currentTime = 20;
    fireEvent.click(screen.getByRole('button', { name: 'Mundur 5 detik' }));
    expect(audioEl().currentTime).toBe(15);
    audioEl().currentTime = 3;
    fireEvent.click(screen.getByRole('button', { name: 'Mundur 5 detik' }));
    expect(audioEl().currentTime).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '0.75x' }));
    expect(audioEl().playbackRate).toBe(0.75);
    expect(screen.getByRole('button', { name: '0.75x' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('slider', { name: 'Posisi audio' }), { target: { value: '100' } });
    expect(audioEl().currentTime).toBe(100);
    audioEl().currentTime = 7;
    fireEvent.seeking(audioEl());
    expect(audioEl().currentTime).toBe(7);
    fireEvent.pause(audioEl());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(window.localStorage.getItem(`audio:v1:${ATTEMPT_ID}`)).toBeNull();
  });
});

describe('Pra-cek audio ExamIntro', () => {
  const intro: ExamIntro = {
    assessment_set_id: 'f0a1b2c3-0001-4000-8000-0000000000e1',
    assessment_type: 'SKIP_MODULE_TEST',
    title: 'Uji Listening',
    scope: null,
    time_limit_seconds: 1800,
    question_count: 4,
    threshold: null,
    rules: ['Audio diputar satu kali.'],
    available: true,
    blocked_reason: null,
    cooldown: { next_allowed_at: null, attempts_in_window: 0, max_attempts: 3 },
    active_attempt_id: null,
    requires_audio: true,
    requires_microphone: false,
    boss: null,
    placement: null,
  };

  it('Mulai Ujian disabled sampai nada diputar dan konfirmasi dicentang; ada teks petunjuk', () => {
    const start = vi.fn();
    mockFetch(() => ({ status: 404, body: {} }));
    renderWithProviders(<ExamIntroView intro={intro} />);
    const btn = screen.getByRole('button', { name: 'Mulai Ujian' });
    expect(btn).toBeDisabled();
    expect(screen.getByText('Lakukan pengecekan audio terlebih dahulu.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Saya dapat mendengar nada dan volume sudah sesuai' }));
    expect(screen.getByRole('button', { name: 'Mulai Ujian' })).toBeEnabled();
    expect(screen.queryByText('Lakukan pengecekan audio terlebih dahulu.')).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it('attempt berjalan (Lanjutkan Ujian) tidak mewajibkan pra-cek; tanpa requires_audio tidak ada kartu pra-cek', () => {
    mockFetch(() => ({ status: 404, body: {} }));
    const { unmount } = renderWithProviders(<ExamIntroView intro={{ ...intro, active_attempt_id: ATTEMPT_ID }} />);
    expect(screen.getByRole('button', { name: 'Lanjutkan Ujian' })).toBeEnabled();
    unmount();
    renderWithProviders(<ExamIntroView intro={{ ...intro, requires_audio: false }} />);
    expect(screen.queryByText('Pengecekan audio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mulai Ujian' })).toBeEnabled();
  });

  it('nada uji memakai WebAudio 440 Hz selama 1 detik tanpa berkas; tanpa WebAudio ada pesan', () => {
    const osc = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) };
    const ctx = { createOscillator: () => osc, createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }), destination: {}, currentTime: 10, close: vi.fn() };
    // Konstruktor biasa (bukan arrow) agar dapat dipanggil dengan `new`.
    (window as unknown as { AudioContext: unknown }).AudioContext = function AudioContext() {
      return ctx;
    };
    const onChange = vi.fn();
    const { unmount } = renderWithProviders(<AudioPrecheck confirmed={false} onConfirmedChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Putar nada uji' }));
    expect(osc.frequency.value).toBe(440);
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalledWith(11);
    unmount();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    renderWithProviders(<AudioPrecheck confirmed={false} onConfirmedChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Putar nada uji' }));
    expect(screen.getByRole('alert')).toHaveTextContent('tidak dapat memutar nada uji');
  });
});

describe('ExamSession Listening', () => {
  const lq = (n: number, section: (i: number) => number | null): QuestionPublic[] =>
    Array.from({ length: n }, (_, i) => ({
      ...Q.tfng,
      question_id: `L-${i + 1}`,
      prompt: `Soal listening ${i + 1}`,
      skill: 'LISTENING' as const,
      section_no: section(i),
    }));
  const attemptOf = (questions: QuestionPublic[], over: Partial<Attempt> = {}): Attempt => {
    const now = Date.now();
    return makeAttempt(questions, {
      id: ATTEMPT_ID,
      mode: 'EXAM',
      assessment_type: 'SKIP_MODULE_TEST',
      title: 'Listening Ujian',
      listening: { audio_url: URL_AUDIO, mime_type: 'audio/mpeg', duration_sec: 284 },
      started_at: new Date(now).toISOString(),
      server_now: new Date(now).toISOString(),
      deadline_at: new Date(now + 1_800_000).toISOString(),
      remaining_seconds: 1800,
      ...over,
    });
  };
  const ok = { status: 200, body: { data: { question_id: 'L-1', saved: true, answered_count: 1, feedback: null, next_question: null } } };

  it('soal ber-section 1-3: Tabs Section 1..3; berpindah tidak mereset jawaban; hanya soal section aktif tampil', async () => {
    const calls = mockFetch((_u, init) => (init.method === 'PUT' ? ok : { status: 404, body: {} }));
    renderWithProviders(<ExamSession attempt={attemptOf(lq(6, (i) => 1 + Math.floor(i / 2)))} />);
    loaded();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Section 1', 'Section 2', 'Section 3']);
    expect(screen.getByText('Soal listening 1')).toBeInTheDocument();
    expect(screen.queryByText('Soal listening 3')).toBeNull();
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Section 2' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'Section 2' }));
    expect(await screen.findByText('Soal listening 3')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Section 1' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'Section 1' }));
    expect((await screen.findAllByRole('radio'))[0]).toBeChecked();
  });

  it('tanpa section_no (atau satu section): satu daftar tanpa Tabs, pemutar EXAM terkunci tampil', () => {
    mockFetch(() => ok);
    renderWithProviders(<ExamSession attempt={attemptOf(lq(3, () => null))} />);
    loaded();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('Soal listening 3')).toBeInTheDocument();
    expect(screen.getByTestId('listening-player')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Kemajuan audio' })).toHaveAttribute('data-readonly', 'true');
  });

  it('timer tetap berjalan setelah audio berakhir dan Kirim memakai Dialog konfirmasi lalu submit', async () => {
    const calls = mockFetch((u, init) =>
      u.pathname.endsWith('/submit') && init.method === 'POST' ? { body: { data: { attempt: {}, per_skill: [], review: null, progress: null } } } : ok,
    );
    renderWithProviders(<ExamSession attempt={attemptOf(lq(2, () => 1))} />);
    loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Putar audio' }));
    fireEvent.playing(audioEl());
    fireEvent.ended(audioEl());
    expect(screen.getByRole('timer', { name: 'Sisa waktu' })).toHaveTextContent('30:00');
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
    expect(screen.getByText('Akhiri ujian?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, akhiri' }));
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/submit'))).toBe(true));
  });
});
