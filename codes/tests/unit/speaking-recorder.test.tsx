// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecordingConsentDialog } from '@/components/speaking/recording-consent-dialog';
import { SpeakingRecorder } from '@/components/speaking/speaking-recorder';

describe('SpeakingRecorder & Consent Components (SPEC-013)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RecordingConsentDialog', () => {
    it('menampilkan teks retensi dan menonaktifkan tombol setuju sampai dicentang', () => {
      const onConsentSuccess = vi.fn();
      render(
        <RecordingConsentDialog
          open={true}
          retentionDays={90}
          onConsentSuccess={onConsentSuccess}
        />
      );

      expect(screen.getByText(/Persetujuan Rekaman Suara/i)).toBeInTheDocument();
      expect(screen.getByText(/90 hari/i)).toBeInTheDocument();

      const agreeBtn = screen.getByRole('button', {
        name: /setuju dan lanjutkan/i,
      });
      expect(agreeBtn).toBeDisabled();

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(agreeBtn).not.toBeDisabled();
    });

    it('memanggil POST /api/v1/me/recording-consent saat tombol setuju ditekan', async () => {
      const onConsentSuccess = vi.fn();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            user: { consent_recording_at: '2026-11-04T10:00:00.000Z' },
          },
        }),
      } as Response);

      render(
        <RecordingConsentDialog
          open={true}
          retentionDays={90}
          onConsentSuccess={onConsentSuccess}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      const agreeBtn = screen.getByRole('button', {
        name: /setuju dan lanjutkan/i,
      });
      fireEvent.click(agreeBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          '/api/v1/me/recording-consent',
          expect.objectContaining({ method: 'POST' })
        );
        expect(onConsentSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('SpeakingRecorder', () => {
    it('menampilkan peringatan koneksi aman jika isSecureContext false', () => {
      Object.defineProperty(window, 'isSecureContext', {
        value: false,
        configurable: true,
      });

      render(
        <SpeakingRecorder
          kind="SPEAKING_PART2"
          promptText="Describe a website you use often."
        />
      );

      expect(
        screen.getByText(
          /Perekaman suara membutuhkan koneksi aman \(HTTPS atau localhost\)\./i
        )
      ).toBeInTheDocument();

      // Kembalikan ke true
      Object.defineProperty(window, 'isSecureContext', {
        value: true,
        configurable: true,
      });
    });

    it('menampilkan tombol izin mikrofon saat mikrofon belum diberikan', () => {
      render(
        <SpeakingRecorder
          kind="SPEAKING_PART2"
          promptText="Describe a famous person you admire."
        />
      );

      expect(screen.getByText(/Izinkan Mikrofon/i)).toBeInTheDocument();
    });

    it('merender topik soal dan area catatan lokal saat mikrofon telah diizinkan', async () => {
      // Mock getUserMedia
      const mockStream = {
        getTracks: () => [{ stop: vi.fn() }],
      };
      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
        configurable: true,
      });

      // Mock AudioContext
      const mockAudioContext = vi.fn().mockImplementation(() => ({
        createMediaStreamSource: vi.fn().mockReturnValue({
          connect: vi.fn(),
        }),
        createAnalyser: vi.fn().mockReturnValue({
          fftSize: 256,
          frequencyBinCount: 128,
          getByteFrequencyData: vi.fn(),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }));
      window.AudioContext = mockAudioContext as unknown as typeof AudioContext;

      render(
        <SpeakingRecorder
          kind="SPEAKING_PART2"
          promptText="Describe a book you enjoyed reading."
          cuePoints={['What the book is', 'Who wrote it', 'Why you liked it']}
          prepSeconds={60}
          hasConsented={true}
        />
      );

      const micBtn = screen.getByRole('button', { name: /izinkan mikrofon/i });
      fireEvent.click(micBtn);

      await waitFor(() => {
        expect(screen.getByText(/Describe a book you enjoyed reading\./i)).toBeInTheDocument();
        expect(screen.getByText(/What the book is/i)).toBeInTheDocument();
        expect(screen.getByText(/Fase Persiapan/i)).toBeInTheDocument();
      });

      const scratchNotes = screen.getByLabelText(/catatan persiapan/i);
      fireEvent.change(scratchNotes, { target: { value: 'Mention Harry Potter' } });
      expect(scratchNotes).toHaveValue('Mention Harry Potter');

      const startNowBtn = screen.getByRole('button', { name: /mulai rekam sekarang/i });
      expect(startNowBtn).toBeInTheDocument();
    });
  });
});
