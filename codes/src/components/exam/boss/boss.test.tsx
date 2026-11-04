import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeResult } from '@/components/quiz/fixtures';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import type { AttemptResult } from '@/contracts/attempts';
import type { ExamIntroData } from '@/lib/api/exams';
import { AI_STATUS } from '@/components/ai/fixtures';
import { ExamIntroView } from '../exam-intro';
import { ExamResult, ExamResultView } from '../exam-result';
import { BossRunner } from './boss-runner';
import {
  activeBandTables,
  activeSection,
  doneSection,
  ATTEMPT_ID,
  bossIntro,
  makeBossAttempt,
  makeBossResult,
  makeSection,
  PARENT_SET,
  startPayload,
  SUB_ID,
} from './fixtures';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/ujian',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => vi.useRealTimers());

const intro = (over: Partial<ExamIntroData> = {}): ExamIntroData => ({
  assessment_set_id: PARENT_SET,
  assessment_type: 'TIER_BOSS_EXAM',
  title: 'Boss Stage Tier 1',
  scope: { kind: 'TIER', id: '7a1b2c3d-0001-4000-8000-000000000001', label: 'Tier 1 Foundation' },
  time_limit_seconds: 4500,
  question_count: 16,
  threshold: { kind: 'PERCENT', value: 80 },
  rules: ['Setiap section punya waktu sendiri.'],
  available: true,
  blocked_reason: null,
  cooldown: { next_allowed_at: null, attempts_in_window: 0, max_attempts: 3 },
  active_attempt_id: null,
  requires_audio: true,
  requires_microphone: true,
  boss: bossIntro,
  placement: null,
  ...over,
});

const json = (body: unknown, status = 200) => ({ status, body });

describe('Intro Boss Stage', () => {
  it('menampilkan gerbang persen, urutan section, total waktu, catatan, dan percobaan terakhir', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamIntroView intro={intro()} />);
    expect(screen.getByText('Lulus bila akurasi Listening + Reading >= 80%')).toBeInTheDocument();
    const items = within(screen.getByRole('region', { name: 'Urutan section' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('1. Listening'),
      expect.stringContaining('2. Reading'),
      expect.stringContaining('3. Writing'),
      expect.stringContaining('4. Speaking'),
    ]);
    expect(within(items[0]!).getByText('Menentukan kelulusan')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Masukan')).toBeInTheDocument();
    expect(screen.getByText('Total waktu section: 75 menit')).toBeInTheDocument();
    expect(screen.getByText(/Kelulusan ditentukan oleh Listening dan Reading/)).toBeInTheDocument();
    expect(screen.getByTestId('boss-last-result')).toHaveTextContent('Percobaan terakhir: Belum lulus, akurasi 75%, band 5,5');
    // Checklist perangkat: audio dan mikrofon; Mulai Ujian menunggu pra-cek audio.
    expect(screen.getByText('Pastikan speaker atau headphone berfungsi.')).toBeInTheDocument();
    expect(screen.getByText(/mikrofon berfungsi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
  });

  it('gerbang band: "Lulus bila band Listening + Reading >= 5,0"', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamIntroView intro={intro({ boss: { ...bossIntro, gate: { type: 'BAND', value: 5 } }, requires_audio: false })} />);
    expect(screen.getByText('Lulus bila band Listening + Reading >= 5,0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mulai Ujian' })).toBeEnabled();
  });

  it('BOSS_ALREADY_PASSED: "Sudah lulus" tanpa tombol mulai dan tanpa pra-cek audio', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamIntroView intro={intro({ available: false, blocked_reason: 'BOSS_ALREADY_PASSED' })} />);
    expect(screen.getByText('Sudah lulus')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mulai Ujian' })).toBeNull();
    expect(screen.queryByText('Pengecekan audio')).toBeNull();
    expect(screen.getByText('Boss Stage Tier ini sudah Anda lulusi.')).toBeInTheDocument();
  });

  it('MODULES_INCOMPLETE: tombol disabled dengan alasan', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamIntroView intro={intro({ available: false, blocked_reason: 'MODULES_INCOMPLETE', requires_audio: false })} />);
    expect(screen.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
    expect(screen.getByText('Selesaikan semua modul Tier ini terlebih dahulu.')).toBeInTheDocument();
  });

  it('409 BOSS_NOT_AVAILABLE saat mulai memunculkan Dialog berpesan server-kontrak', async () => {
    mockFetch(() => json(errorBody('BOSS_NOT_AVAILABLE', 'x', [{ path: '', code: 'MODULES_INCOMPLETE', message: 'x' }]), 409));
    renderWithProviders(<ExamIntroView intro={intro({ requires_audio: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Ujian' }));
    expect(await screen.findByText('Boss Stage belum tersedia. Selesaikan semua modul Tier ini terlebih dahulu.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('Mulai Ujian memanggil POST /attempts dengan set induk lalu membuka attempt', async () => {
    const attempt = makeBossAttempt([makeSection('LISTENING')]);
    const calls = mockFetch((url, init) => (url.pathname === '/api/v1/attempts' && init.method === 'POST' ? json({ data: attempt }, 201) : json({}, 404)));
    renderWithProviders(<ExamIntroView intro={intro({ requires_audio: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Ujian' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/ujian/${ATTEMPT_ID}`));
    expect(calls[0]!.json).toEqual({ assessment_set_id: PARENT_SET });
  });
});

describe('BossRunner', () => {
  const attemptPath = `/api/v1/attempts/${ATTEMPT_ID}`;

  it('transisi -> Mulai Section -> Listening (audio ?section=) -> Selesai Section -> layar selesai -> Lanjut ke section berikut', async () => {
    const L = makeSection('LISTENING');
    const R = makeSection('READING');
    const calls = mockFetch((url, init) => {
      if (url.pathname === `${attemptPath}/sections/${L.assessment_set_id}/start` && init.method === 'POST') {
        return json({ data: startPayload(activeSection('LISTENING')) });
      }
      if (url.pathname === `${attemptPath}/sections/${L.assessment_set_id}/submit` && init.method === 'POST') {
        return json({ data: { section: doneSection(L), next_section: R } });
      }
      return json({}, 404);
    });
    renderWithProviders(<BossRunner attempt={makeBossAttempt([L, R])} />);

    expect(screen.getByText('Section 1 dari 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Listening Tier 1' })).toHaveFocus();
    expect(screen.getByText('Audio hanya diputar satu kali dan tidak dapat dijeda atau diulang.')).toBeInTheDocument();
    expect(screen.getByText('Section ini menentukan kelulusan.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /kembali/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mulai Section' }));
    const audio = (await screen.findByTestId('listening-audio')) as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe(`/api/v1/attempts/${ATTEMPT_ID}/audio?section=${L.assessment_set_id}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Listening Tier 1' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
    // Tombol akhir berlabel section, bukan "Akhiri".
    expect(screen.queryByRole('button', { name: 'Akhiri' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Selesai Section' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Selesai Section' })[0]!);
    expect(screen.getByText('Selesaikan section ini?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, selesaikan' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Section Listening Tier 1 selesai' })).toBeInTheDocument();
    expect(screen.getByText('Berikutnya: Reading Tier 1')).toBeInTheDocument();
    expect(screen.queryByText('Waktu section habis')).toBeNull();
    // Section yang sudah selesai tidak dapat dibuka lagi: tidak ada tombol selain Lanjut.
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(await screen.findByText('Section 2 dari 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Reading Tier 1' })).toBeInTheDocument();
    expect(calls.filter((c) => c.url.pathname.endsWith('/start'))).toHaveLength(1);
    // Attempt belum dikirim sebelum section terakhir selesai.
    expect(calls.some((c) => c.url.pathname === `${attemptPath}/submit`)).toBe(false);
  });

  it('section Reading memakai ReadingWorkspace dengan teks dari start', async () => {
    const R = makeSection('READING');
    mockFetch((url, init) =>
      url.pathname.endsWith('/start') && init.method === 'POST' ? json({ data: startPayload(activeSection('READING')) }) : json({}, 404),
    );
    renderWithProviders(<BossRunner attempt={makeBossAttempt([R])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Section' }));
    expect(await screen.findByText('Penulis mendukung rencana.')).toBeInTheDocument();
    expect(screen.getByText(/The cave was dark and deep/)).toBeInTheDocument();
  });

  it('section ACTIVE dilanjutkan otomatis lewat start idempoten (jawaban tersimpan kembali)', async () => {
    const L = activeSection('LISTENING');
    const calls = mockFetch((url, init) =>
      url.pathname.endsWith('/start') && init.method === 'POST'
        ? json({ data: startPayload(L, { answers: [{ question_id: 'Q-T1-L-01', response: { text: 'Budi' }, feedback: null }] }) })
        : json({}, 404),
    );
    renderWithProviders(<BossRunner attempt={makeBossAttempt([L, makeSection('READING')])} />);
    expect(await screen.findByTestId('listening-audio')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Budi')).toBeInTheDocument();
    expect(calls.filter((c) => c.url.pathname.endsWith('/start'))).toHaveLength(1);
    expect(screen.queryByText('Section 1 dari 2')).toBeNull();
  });

  it('section terakhir selesai -> "Lihat Hasil" mengirim attempt lalu membuka hasil', async () => {
    const W = activeSection('SPEAKING');
    const calls = mockFetch((url, init) => {
      if (url.pathname.endsWith('/submit') && url.pathname.includes('/sections/') && init.method === 'POST') {
        return json({ data: { section: doneSection(W), next_section: null } });
      }
      if (url.pathname === `${attemptPath}/submit` && init.method === 'POST') return json({ data: makeResult() });
      if (url.pathname.endsWith('/start')) return json({ data: startPayload(W) });
      if (url.pathname === '/api/v1/ai/status') return json({ data: AI_STATUS });
      if (url.pathname === '/api/v1/auth/me') return json({ data: { user: USER } });
      return json({}, 404);
    });
    renderWithProviders(<BossRunner attempt={makeBossAttempt([doneSection(makeSection('LISTENING')), W])} />);
    expect(await screen.findByTestId('speaking-task')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Selesai Section' })[0]!);
    // Section AI: peringatan tugas yang belum dikirim tidak dinilai.
    expect(screen.getByText(/belum dikirim tidak akan dinilai/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, selesaikan' }));
    expect(await screen.findByText('Semua section selesai. Kirim ujian untuk melihat hasil.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lihat Hasil' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/ujian/${ATTEMPT_ID}/hasil`));
    expect(calls.some((c) => c.url.pathname === `${attemptPath}/submit`)).toBe(true);
  });

  it('section Writing memuat editor dengan attempt_id dan question_id section', async () => {
    const W = activeSection('WRITING');
    mockFetch((url) => {
      if (url.pathname.endsWith('/start')) return json({ data: startPayload(W) });
      if (url.pathname === '/api/v1/ai/status') return json({ data: AI_STATUS });
      if (url.pathname === '/api/v1/auth/me') return json({ data: { user: USER } });
      return json({}, 404);
    });
    renderWithProviders(<BossRunner attempt={makeBossAttempt([doneSection(makeSection('LISTENING')), W])} />);
    expect(await screen.findByLabelText('Tulisan Anda dalam bahasa Inggris')).toBeInTheDocument();
    expect(screen.getByTestId('writing-task')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Writing Tier 1' })).toBeInTheDocument();
  });

  it('F-14-07: beforeunload aktif di layar transisi, layar selesai, dan section Writing; dilepas saat unmount', async () => {
    const W = activeSection('WRITING');
    const L = makeSection('LISTENING');
    mockFetch((url) => {
      if (url.pathname.endsWith('/start')) return json({ data: startPayload(W) });
      if (url.pathname === '/api/v1/ai/status') return json({ data: AI_STATUS });
      if (url.pathname === '/api/v1/auth/me') return json({ data: { user: USER } });
      return json({}, 404);
    });
    const blocked = () => {
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    // Layar transisi (gate).
    const gate = renderWithProviders(<BossRunner attempt={makeBossAttempt([L])} />);
    expect(screen.getByTestId('section-gate')).toBeInTheDocument();
    expect(blocked()).toBe(true);
    gate.unmount();
    expect(blocked()).toBe(false);
    // Layar selesai (semua section DONE).
    const fin = renderWithProviders(<BossRunner attempt={makeBossAttempt([doneSection(L)])} />);
    expect(blocked()).toBe(true);
    fin.unmount();
    // Section Writing.
    const w = renderWithProviders(<BossRunner attempt={makeBossAttempt([doneSection(L), W])} />);
    expect(await screen.findByTestId('writing-task')).toBeInTheDocument();
    expect(blocked()).toBe(true);
    w.unmount();
    expect(blocked()).toBe(false);
  });

  it.each([['WRITING'], ['SPEAKING']] as const)(
    'waktu section %s habis: terkirim otomatis ke sections/submit lalu layar selesai (waktu habis)',
    async (skill) => {
      const A = activeSection(skill, { deadline_at: new Date(Date.now() + 1200).toISOString(), remaining_seconds: 1 });
      const next = makeSection(skill === 'WRITING' ? 'SPEAKING' : 'WRITING');
      const calls = mockFetch((url, init) => {
        if (url.pathname.endsWith('/start')) return json({ data: startPayload(A) });
        if (url.pathname === `${attemptPath}/sections/${A.assessment_set_id}/submit` && init.method === 'POST') {
          return json({ data: { section: doneSection(A), next_section: next } });
        }
        if (url.pathname === '/api/v1/ai/status') return json({ data: AI_STATUS });
        if (url.pathname === '/api/v1/auth/me') return json({ data: { user: USER } });
        return json({}, 404);
      });
      renderWithProviders(<BossRunner attempt={makeBossAttempt([A])} />);
      expect(await screen.findByTestId('section-done', {}, { timeout: 6000 })).toBeInTheDocument();
      expect(calls.filter((c) => c.url.pathname.endsWith('/submit') && c.init.method === 'POST')).toHaveLength(1);
    },
  );

  it('SECTION_ORDER_VIOLATION saat mulai: pesan dari kamus dan daftar section dimuat ulang dari server', async () => {
    const L = makeSection('LISTENING');
    const R = makeSection('READING');
    const calls = mockFetch((url, init) => {
      if (url.pathname.endsWith('/start') && init.method === 'POST') return json(errorBody('SECTION_ORDER_VIOLATION', 'x'), 409);
      if (url.pathname === attemptPath) return json({ data: makeBossAttempt([doneSection(L), R]) });
      return json({}, 404);
    });
    const { toast } = await import('sonner');
    renderWithProviders(<BossRunner attempt={makeBossAttempt([R])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Section' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Selesaikan section sebelumnya terlebih dahulu.'));
    await waitFor(() => expect(calls.some((c) => c.url.pathname === attemptPath)).toBe(true));
  });

  it('gagal jaringan saat mulai: pesan tampil dan tombol dapat dicoba lagi', async () => {
    const L = makeSection('LISTENING');
    let n = 0;
    globalThis.fetch = (async () => {
      n += 1;
      if (n === 1) throw new TypeError('offline');
      return new Response(JSON.stringify({ data: startPayload(activeSection('LISTENING')) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    renderWithProviders(<BossRunner attempt={makeBossAttempt([L])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Section' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Section gagal dimulai. Coba lagi.');
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Section' }));
    expect(await screen.findByTestId('listening-audio')).toBeInTheDocument();
  });

  it('SECTION_EXPIRED pada simpan jawaban: section ditutup server, tampil layar selesai dengan Dialog "Waktu section habis"', async () => {
    const L = activeSection('LISTENING');
    const R = makeSection('READING');
    mockFetch((url, init) => {
      if (url.pathname.endsWith('/start')) return json({ data: startPayload(L) });
      if (init.method === 'PUT') return json(errorBody('SECTION_EXPIRED', 'x'), 409);
      if (url.pathname.endsWith('/submit') && url.pathname.includes('/sections/')) return json({ data: { section: doneSection(L), next_section: R } });
      return json({}, 404);
    });
    renderWithProviders(<BossRunner attempt={makeBossAttempt([L, R])} />);
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Budi' } });
    expect(await screen.findByRole('dialog', {}, { timeout: 4000 })).toHaveTextContent('Waktu section habis');
    expect(screen.getByTestId('section-done')).toHaveTextContent('Section Listening Tier 1 selesai');
    fireEvent.click(screen.getByRole('button', { name: 'Mengerti' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Section Listening Tier 1 selesai' })).toBeInTheDocument();
  });

  it('daftar section tidak sesuai kontrak ditampilkan sebagai galat, tidak ditambal', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<BossRunner attempt={makeBossAttempt([], { sections: [{ foo: 'bar' }] })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('tidak sesuai kontrak');
  });

  it('semua section DONE tetapi attempt belum dikirim: langsung menawarkan Lihat Hasil', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<BossRunner attempt={makeBossAttempt([doneSection(makeSection('LISTENING'))])} />);
    expect(screen.getByRole('button', { name: 'Lihat Hasil' })).toBeInTheDocument();
  });
});

function withBoss(boss: unknown, over: Partial<AttemptResult['attempt']> = {}): AttemptResult {
  const base = makeResult({ passed: true });
  return { ...base, attempt: { ...base.attempt, assessment_type: 'TIER_BOSS_EXAM', mode: 'EXAM', band_score: 6, ...over }, per_skill: [], review: null, boss };
}

describe('Hasil Boss Stage', () => {
  const serveTables = () =>
    mockFetch((url) => (url.pathname === '/api/v1/band-tables/active' ? json({ data: activeBandTables }) : json({}, 404)));

  it('lulus: band besar, status, gerbang, kartu L/R menentukan, W/S masukan, tombol Buka Tier berikutnya', async () => {
    serveTables();
    renderWithProviders(<ExamResultView result={withBoss(makeBossResult())} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hasil Boss Stage' })).toHaveFocus();
    expect(screen.getByText('Boss Stage Tier 2')).toBeInTheDocument();
    expect(screen.getAllByText('Band').length).toBeGreaterThan(0);
    expect(screen.getByText('Lulus')).toBeInTheDocument();
    expect(screen.getByText('Target Band 5,0, hasil Anda 6,0')).toBeInTheDocument();
    expect(screen.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeInTheDocument();
    const listening = screen.getByTestId('boss-skill-LISTENING');
    expect(within(listening).getByText('Menentukan kelulusan')).toBeInTheDocument();
    expect(within(listening).getByText('Skor mentah 16/20 → setara 32/40 → Band 7,5')).toBeInTheDocument();
    const reading = screen.getByTestId('boss-skill-READING');
    expect(within(reading).getByText('Skor mentah 7/20 → setara 14/40 → Band 4,5')).toBeInTheDocument();
    // Tabel konversi (BandConversionTable) dari GET /band-tables/active, dengan baris yang dicapai.
    expect(await within(listening).findByText('Lihat tabel konversi')).toBeInTheDocument();
    const writing = screen.getByTestId('boss-skill-WRITING');
    expect(within(writing).getByText('Masukan (tidak menentukan kelulusan)')).toBeInTheDocument();
    expect(within(writing).getByText('Menunggu penilaian AI')).toBeInTheDocument();
    expect(within(writing).getByRole('link', { name: 'Lihat umpan balik' })).toHaveAttribute('href', `/riwayat/penilaian/${SUB_ID}`);
    expect(within(screen.getByTestId('boss-skill-SPEAKING')).getByText('Tidak dikerjakan')).toBeInTheDocument();
    expect(screen.getByText('Terbuka: Tier 3 Operational IELTS')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buka Tier 3' })).toHaveAttribute('href', '/peta');
    expect(screen.getByTestId('overall-empty')).toHaveTextContent('Estimasi Overall Band muncul setelah Writing dan Speaking dinilai AI.');
  });

  it('tabel band aktif berbeda dari yang dipakai ujian: tabel tidak ditampilkan, ada catatan', async () => {
    mockFetch((url) =>
      url.pathname === '/api/v1/band-tables/active'
        ? json({ data: { ...activeBandTables, listening: { ...activeBandTables.listening, table_id: 'aa11bb22-0009-4000-8000-000000000009' } } })
        : json({}, 404),
    );
    renderWithProviders(<ExamResultView result={withBoss(makeBossResult())} />);
    const listening = screen.getByTestId('boss-skill-LISTENING');
    expect(await within(listening).findByText('Tabel konversi yang dipakai ujian ini sudah tidak aktif.')).toBeInTheDocument();
    expect(within(listening).queryByText('Lihat tabel konversi')).toBeNull();
  });

  it('gagal (gerbang persen): pesan suportif, keterampilan terlemah, jam coba lagi, kembali ke Peta', () => {
    serveTables();
    renderWithProviders(
      <ExamResultView
        result={withBoss(
          makeBossResult({
            passed: false,
            gate: { type: 'PERCENT', value: 80 },
            percent: 57.5,
            boss_band: 4.5,
            next_tier_unlocked: false,
            unlocked: [],
            retry: { next_allowed_at: '2026-11-03T11:30:00.000Z', attempts_remaining_today: 2 },
          }),
          { passed: false },
        )}
      />,
    );
    expect(screen.getByText('Belum lulus')).toBeInTheDocument();
    expect(screen.getByText('Target 80%, hasil Anda 57,50%')).toBeInTheDocument();
    expect(screen.getByText(/tidak ada penalti/)).toBeInTheDocument();
    expect(screen.getByText('Keterampilan terlemah: Reading (Band 4,5)')).toBeInTheDocument();
    expect(screen.getByText('Coba lagi setelah 18:30 WIB')).toBeInTheDocument();
    expect(screen.getByText('Sisa percobaan hari ini: 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kembali ke Peta' })).toHaveAttribute('href', '/peta');
    expect(screen.queryByText(/Buka Tier/)).toBeNull();
  });

  it('W/S dinilai: band + Badge Masukan + estimasi Overall Band dengan disclaimer; tanpa spinner', () => {
    serveTables();
    const base = makeBossResult();
    renderWithProviders(
      <ExamResultView
        result={withBoss({
          ...base,
          pending_ai: 0,
          overall_band_estimate: 6.0,
          sections: base.sections.map((s) => (s.skill === 'WRITING' ? { ...s, band: 6.5 } : s.skill === 'SPEAKING' ? { ...s, band: 5.5, submission_ids: [SUB_ID], status: 'SUBMITTED' as const } : s)),
        })}
      />,
    );
    const w = screen.getByTestId('boss-skill-WRITING');
    expect(within(w).getByText('6,5')).toBeInTheDocument();
    expect(within(w).getByText('Masukan (tidak menentukan kelulusan)')).toBeInTheDocument();
    expect(screen.queryByText('Menunggu penilaian AI')).toBeNull();
    expect(within(screen.getByTestId('overall-estimate')).getByText('6,0')).toBeInTheDocument();
  });

  it('F-14-08: tautan umpan balik memakai submission terbaru (elemen terakhir), bukan yang tertua', () => {
    serveTables();
    const base = makeBossResult();
    const OLD = 'd4c3b2a1-1111-4000-8000-0000000000a1';
    const NEW = 'd4c3b2a1-1111-4000-8000-0000000000a2';
    renderWithProviders(
      <ExamResultView
        result={withBoss({ ...base, sections: base.sections.map((s) => (s.skill === 'WRITING' ? { ...s, band: 6.0, submission_ids: [OLD, NEW] } : s)) })}
      />,
    );
    const link = within(screen.getByTestId('boss-skill-WRITING')).getByRole('link', { name: 'Lihat umpan balik' });
    expect(link).toHaveAttribute('href', `/riwayat/penilaian/${NEW}`);
  });

  it('QA W7: tautan memakai graded_submission_id, lalu latest_submission_id, sebelum fallback submission_ids', () => {
    serveTables();
    const base = makeBossResult();
    const OLD = 'd4c3b2a1-1111-4000-8000-0000000000a1';
    const NEW = 'd4c3b2a1-1111-4000-8000-0000000000a2';
    const GRADED = 'd4c3b2a1-1111-4000-8000-0000000000a3';
    const LATEST = 'd4c3b2a1-1111-4000-8000-0000000000a4';
    const { unmount } = renderWithProviders(
      <ExamResultView
        result={withBoss({
          ...base,
          sections: base.sections.map((s) =>
            s.skill === 'WRITING'
              ? { ...s, band: 6.0, submission_ids: [OLD, NEW], latest_submission_id: LATEST, graded_submission_id: GRADED, ai_status: 'GRADED' as const }
              : s,
          ),
        })}
      />,
    );
    expect(within(screen.getByTestId('boss-skill-WRITING')).getByRole('link', { name: 'Lihat umpan balik' })).toHaveAttribute(
      'href',
      `/riwayat/penilaian/${GRADED}`,
    );
    unmount();
    renderWithProviders(
      <ExamResultView
        result={withBoss({
          ...base,
          sections: base.sections.map((s) =>
            s.skill === 'WRITING' ? { ...s, band: null, submission_ids: [OLD, NEW], latest_submission_id: LATEST, graded_submission_id: null, ai_status: 'PENDING' as const } : s,
          ),
        })}
      />,
    );
    expect(within(screen.getByTestId('boss-skill-WRITING')).getByRole('link', { name: 'Lihat umpan balik' })).toHaveAttribute(
      'href',
      `/riwayat/penilaian/${LATEST}`,
    );
  });

  it('QA W7: ai_status membedakan menunggu AI dari tanpa band, walau pending_ai sama', () => {
    serveTables();
    const base = makeBossResult();
    const withStatus = (ai_status: 'PENDING' | 'NO_BAND' | 'NOT_SUBMITTED', pendingAi: number) =>
      withBoss({
        ...base,
        pending_ai: pendingAi,
        sections: base.sections.map((s) => (s.skill === 'WRITING' ? { ...s, band: null, ai_status } : s)),
      });
    const first = renderWithProviders(<ExamResultView result={withStatus('NO_BAND', 1)} />);
    let w = screen.getByTestId('boss-skill-WRITING');
    expect(within(w).getByText('Belum ada band dari AI untuk tugas ini.')).toBeInTheDocument();
    expect(within(w).queryByText('Menunggu penilaian AI')).toBeNull();
    first.unmount();
    const second = renderWithProviders(<ExamResultView result={withStatus('PENDING', 0)} />);
    w = screen.getByTestId('boss-skill-WRITING');
    expect(within(w).getByText('Menunggu penilaian AI')).toBeInTheDocument();
    second.unmount();
    renderWithProviders(<ExamResultView result={withStatus('NOT_SUBMITTED', 1)} />);
    w = screen.getByTestId('boss-skill-WRITING');
    expect(within(w).getByText('Tidak dikerjakan')).toBeInTheDocument();
  });

  it('Boss tanpa Writing/Speaking: tanpa kartu masukan dan tanpa blok estimasi Overall', () => {
    serveTables();
    const base = makeBossResult();
    renderWithProviders(<ExamResultView result={withBoss({ ...base, pending_ai: 0, sections: base.sections.slice(0, 2) })} />);
    expect(screen.queryByTestId('boss-skill-WRITING')).toBeNull();
    expect(screen.queryByText('Estimasi Overall Band')).toBeNull();
  });

  it('blok boss tidak sesuai kontrak: galat, bukan hasil generik', () => {
    mockFetch(() => json({}, 404));
    renderWithProviders(<ExamResultView result={withBoss({ passed: 'ya' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Hasil Boss Stage tidak sesuai kontrak');
  });

  it('tidak menampilkan kunci jawaban atau pembahasan', () => {
    serveTables();
    renderWithProviders(<ExamResultView result={withBoss(makeBossResult())} />);
    expect(screen.queryByText(/pembahasan/i)).toBeNull();
    expect(screen.queryByText(/kunci/i)).toBeNull();
  });
});

describe('ExamResult: polling evaluasi AI Boss', () => {
  const resultPath = `/api/v1/attempts/${ATTEMPT_ID}/result`;

  function setup(pendingFor: (n: number) => number) {
    let n = 0;
    const calls = mockFetch((url) => {
      if (url.pathname === resultPath) {
        n += 1;
        const pending = pendingFor(n);
        const base = makeBossResult({ pending_ai: pending });
        const sections = base.sections.map((s) => (s.skill === 'WRITING' && pending === 0 ? { ...s, band: 6.0 } : s));
        return json({ data: withBoss({ ...base, sections }) });
      }
      if (url.pathname === '/api/v1/band-tables/active') return json({ data: activeBandTables });
      return json({}, 404);
    });
    return calls;
  }
  const resultCalls = (calls: ReturnType<typeof mockFetch>) => calls.filter((c) => c.url.pathname === resultPath).length;

  it('pending_ai > 0: ambil ulang tiap 10 detik; kartu terisi otomatis lalu berhenti', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const calls = setup((n) => (n >= 3 ? 0 : 1));
    renderWithProviders(<ExamResult attemptId={ATTEMPT_ID} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Menunggu penilaian AI')).toBeInTheDocument();
    expect(resultCalls(calls)).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(resultCalls(calls)).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(resultCalls(calls)).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(resultCalls(calls)).toBe(3);
    expect(screen.queryByText('Menunggu penilaian AI')).toBeNull();
    expect(within(screen.getByTestId('boss-skill-WRITING')).getByText('6,0')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(resultCalls(calls)).toBe(3);
  });

  it('berhenti setelah 10 menit dan menawarkan "Periksa lagi"', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const calls = setup(() => 1);
    renderWithProviders(<ExamResult attemptId={ATTEMPT_ID} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000 + 1_000);
    });
    const atTimeout = resultCalls(calls);
    expect(atTimeout).toBeGreaterThanOrEqual(55);
    expect(atTimeout).toBeLessThanOrEqual(62);
    expect(screen.getByText('Penilaian AI belum selesai. Anda dapat memeriksanya lagi nanti.')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(resultCalls(calls)).toBe(atTimeout);
    fireEvent.click(screen.getByRole('button', { name: 'Periksa lagi' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(resultCalls(calls)).toBe(atTimeout + 1);
  });

  it('pending_ai = 0: tidak ada polling', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const calls = setup(() => 0);
    renderWithProviders(<ExamResult attemptId={ATTEMPT_ID} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(resultCalls(calls)).toBe(1);
  });
});
