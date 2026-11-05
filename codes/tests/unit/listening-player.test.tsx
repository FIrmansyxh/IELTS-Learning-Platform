// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListeningPlayer } from '@/components/listening/listening-player';
import { ExamIntroView, playWebAudioTone } from '@/components/exam/exam-intro';
import type { ExamIntro as ExamIntroData } from '@/contracts/exams';

// Mock navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe('ListeningPlayer', () => {
  const attemptId = 'a1111111-1111-1111-1111-111111111111';
  const audioUrl = `/api/v1/attempts/${attemptId}/audio`;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
  });

  describe('Mode EXAM (Terkunci)', () => {
    it('merender kartu audio dengan tombol putar besar, progress bar readonly, tanpa controls bawaan', () => {
      render(
        <ListeningPlayer
          mode="EXAM"
          audioUrl={audioUrl}
          durationSec={284}
          attemptId={attemptId}
        />,
      );

      // Kartu region
      expect(screen.getByRole('region', { name: 'Pemutar Audio' })).toBeInTheDocument();

      // Tombol putar 56px
      const playBtn = screen.getByRole('button', { name: 'Putar audio' });
      expect(playBtn).toBeInTheDocument();
      expect(playBtn).toHaveClass('h-14', 'w-14');

      // Progress bar readonly
      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-readonly', 'true');
      expect(progress).toHaveAttribute('aria-label', 'Kemajuan audio');

      // Slider volume
      expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();

      // audio element tidak punya attribute controls
      const audioEl = document.querySelector('audio');
      expect(audioEl).toBeInTheDocument();
      expect(audioEl).not.toHaveAttribute('controls');
      expect(audioEl).toHaveAttribute('tabindex', '-1');
    });

    it('tidak ada kontrol Jeda, Mundur, Ulang, Kecepatan pada DOM mode EXAM', () => {
      render(
        <ListeningPlayer
          mode="EXAM"
          audioUrl={audioUrl}
          durationSec={284}
          attemptId={attemptId}
        />,
      );

      // Periksa bahwa tidak ada tombol dengan nama aksesibel jeda/mundur/kecepatan
      expect(screen.queryByRole('button', { name: /jeda/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /mundur/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /ulang/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /kecepatan/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('slider', { name: 'Kemajuan audio' })).not.toBeInTheDocument();
    });

    it('anti-rewind: saat seeking melompat > 1.5 detik, dikembalikan ke lastPosition', async () => {
      render(
        <ListeningPlayer
          mode="EXAM"
          audioUrl={audioUrl}
          durationSec={284}
          attemptId={attemptId}
        />,
      );

      const playBtn = screen.getByRole('button', { name: 'Putar audio' });
      const audioEl = document.querySelector('audio')!;

      // Mulai putar
      fireEvent.click(playBtn);

      // Set waktu berjalan di detik 30
      audioEl.currentTime = 30;
      fireEvent.timeUpdate(audioEl);

      // Simulasikan usaha manipulasi seek ke detik 5 (selisih 25s > 1.5s)
      audioEl.currentTime = 5;
      fireEvent(audioEl, new Event('seeking'));

      // Harusnya dikembalikan ke 30
      expect(audioEl.currentTime).toBe(30);
    });

    it('guard kecepatan: saat playbackRate diubah, dikembalikan ke 1', () => {
      render(
        <ListeningPlayer
          mode="EXAM"
          audioUrl={audioUrl}
          durationSec={284}
          attemptId={attemptId}
        />,
      );

      const audioEl = document.querySelector('audio')!;
      audioEl.playbackRate = 2.0;
      fireEvent(audioEl, new Event('ratechange'));

      expect(audioEl.playbackRate).toBe(1);
    });

    it('gangguan: bila audio terhenti (pause/stalled), tampil alert banner dengan tombol Lanjutkan Audio', async () => {
      render(
        <ListeningPlayer
          mode="EXAM"
          audioUrl={audioUrl}
          durationSec={284}
          attemptId={attemptId}
        />,
      );

      const playBtn = screen.getByRole('button', { name: 'Putar audio' });
      const audioEl = document.querySelector('audio')!;

      fireEvent.loadedMetadata(audioEl);
      await fireEvent.click(playBtn);
      audioEl.currentTime = 45;
      fireEvent.timeUpdate(audioEl);

      // Simulasikan peramban menjeda audio (gangguan)
      fireEvent.pause(audioEl);

      // Banner alert muncul
      const alertBanner = await screen.findByRole('alert');
      expect(alertBanner).toBeInTheDocument();
      expect(screen.getByText('Audio terhenti.')).toBeInTheDocument();

      // Klik Lanjutkan Audio
      const resumeBtn = screen.getByRole('button', { name: 'Lanjutkan Audio' });
      await fireEvent.click(resumeBtn);

      expect(audioEl.currentTime).toBe(45);
      expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('muat ulang halaman: memulihkan posisi dari localStorage', () => {
      localStorage.setItem(`audio:v1:${attemptId}`, JSON.stringify({ position_sec: 61 }));

      render(
        <ListeningPlayer
          mode="EXAM"
          audioUrl={audioUrl}
          durationSec={284}
          attemptId={attemptId}
        />,
      );

      const audioEl = document.querySelector('audio')!;
      // Metadata loaded
      fireEvent.loadedMetadata(audioEl);

      expect(audioEl.currentTime).toBe(61);
      expect(screen.getByText(/01:01/)).toBeInTheDocument();
    });

    it('audio berakhir: status Audio selesai, tombol putar disabled, info banner tampil', () => {
      const onEnded = vi.fn();
      render(
        <ListeningPlayer
          mode="EXAM"
          audioUrl={audioUrl}
          durationSec={284}
          attemptId={attemptId}
          onEnded={onEnded}
        />,
      );

      const audioEl = document.querySelector('audio')!;
      fireEvent.ended(audioEl);

      expect(onEnded).toHaveBeenCalled();
      expect(screen.getByText('Audio selesai. Periksa jawaban Anda sebelum waktu habis.')).toBeInTheDocument();
      const playBtn = screen.getByRole('button', { name: 'Putar audio' });
      expect(playBtn).toBeDisabled();
    });
  });

  describe('Mode PRACTICE (Kontrol Penuh)', () => {
    it('merender tombol putar/jeda, mundur 5 detik, pengubah kecepatan, dan slider progress', () => {
      render(
        <ListeningPlayer
          mode="PRACTICE"
          audioUrl={audioUrl}
          durationSec={120}
          attemptId={attemptId}
        />,
      );

      expect(screen.getByRole('button', { name: 'Putar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mundur 5 detik' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '0.75x' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '1x' })).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: 'Kemajuan audio' })).toBeInTheDocument();
    });

    it('menekan Mundur 5 detik mengurangi currentTime sebesar 5 detik (min 0)', () => {
      render(
        <ListeningPlayer
          mode="PRACTICE"
          audioUrl={audioUrl}
          durationSec={120}
          attemptId={attemptId}
        />,
      );

      const audioEl = document.querySelector('audio')!;
      audioEl.currentTime = 12;

      const rewindBtn = screen.getByRole('button', { name: 'Mundur 5 detik' });
      fireEvent.click(rewindBtn);

      expect(audioEl.currentTime).toBe(7);

      fireEvent.click(rewindBtn);
      fireEvent.click(rewindBtn);
      expect(audioEl.currentTime).toBe(0);
    });

    it('memilih kecepatan 0.75x mengubah playbackRate menjadi 0.75', () => {
      render(
        <ListeningPlayer
          mode="PRACTICE"
          audioUrl={audioUrl}
          durationSec={120}
          attemptId={attemptId}
        />,
      );

      const audioEl = document.querySelector('audio')!;
      const speed075Btn = screen.getByRole('button', { name: '0.75x' });
      fireEvent.click(speed075Btn);

      expect(audioEl.playbackRate).toBe(0.75);
    });
  });
});

describe('Pra-cek Audio di ExamIntroView', () => {
  const baseIntro: ExamIntroData = {
    assessment_set_id: 's1111111-1111-1111-1111-111111111111',
    assessment_type: 'SKIP_MODULE_TEST',
    title: 'Listening Test Tier 2',
    time_limit_seconds: 1800,
    question_count: 20,
    scope: null,
    threshold: null,
    rules: ['Aturan 1', 'Aturan 2'],
    available: true,
    requires_audio: true,
    requires_microphone: false,
    active_attempt_id: null,
    cooldown: {
      attempts_in_window: 1,
      max_attempts: 3,
      next_allowed_at: null,
    },
    blocked_reason: null,
  };

  it('bila requires_audio=true, tombol Mulai Ujian dinonaktifkan sampai centang konfirmasi dipilih', () => {
    render(<ExamIntroView intro={baseIntro} />);

    // Nada uji button
    expect(screen.getByRole('button', { name: /Putar nada uji/i })).toBeInTheDocument();

    // Checkbox konfirmasi
    const checkbox = screen.getByRole('checkbox', {
      name: /Saya dapat mendengar nada dan volume sudah sesuai/i,
    });
    expect(checkbox).not.toBeChecked();

    // Tombol Mulai Ujian harus disabled dan ada teks peringatan
    const startBtn = screen.getByRole('button', { name: 'Mulai Ujian' });
    expect(startBtn).toBeDisabled();
    expect(screen.getByText('Lakukan pengecekan audio terlebih dahulu.')).toBeInTheDocument();

    // Centang konfirmasi
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Sekarang tombol Mulai Ujian aktif dan peringatan hilang
    expect(startBtn).not.toBeDisabled();
    expect(screen.queryByText('Lakukan pengecekan audio terlebih dahulu.')).not.toBeInTheDocument();
  });

  it('fungsi playWebAudioTone berjalan tanpa melempar kesalahan', () => {
    expect(() => playWebAudioTone()).not.toThrow();
  });
});
