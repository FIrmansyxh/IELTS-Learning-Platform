import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/components/test-utils';
import { attemptsApi } from '@/lib/api/attempts';
import { ActiveDrill } from './active-drill';
import { makeAttempt, Q } from './fixtures';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/api/attempts', () => ({
  attemptsApi: { start: vi.fn(), get: vi.fn(), answer: vi.fn(), submit: vi.fn(), result: vi.fn() },
}));
void attemptsApi;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

function setMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe('ActiveDrill dengan teks bacaan / audio (mode latihan)', () => {
  it('Reading: menampilkan ruang baca dengan teks dan soal saat ini; "Periksa" tetap ada', () => {
    setMatchMedia(true);
    const q = { ...Q.tfng, passage_no: 2 };
    renderWithProviders(
      <ActiveDrill
        attempt={makeAttempt([q], { passage_markdown: '# Satu\n\nTeks satu.\n===PASSAGE===\n# Dua\n\n[A] Teks dua.' })}
        onFinished={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Dua' })).toBeInTheDocument();
    expect(screen.getByText('Teks dua.')).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Periksa' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Teks 1' }));
    expect(screen.getByText('Teks satu.')).toBeInTheDocument();
  });

  it('Listening: pemutar PRACTICE dengan kontrol penuh di atas soal', () => {
    setMatchMedia(false);
    renderWithProviders(
      <ActiveDrill
        attempt={makeAttempt([Q.tfng], { listening: { audio_url: '/api/v1/attempts/x/audio', mime_type: 'audio/mpeg', duration_sec: 60 } })}
        onFinished={vi.fn()}
      />,
    );
    fireEvent.loadedMetadata(screen.getByTestId('listening-audio'));
    expect(screen.getByRole('button', { name: 'Mundur 5 detik' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'True' })).toBeInTheDocument();
  });
});
